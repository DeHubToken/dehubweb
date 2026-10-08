"""
Auto-dub worker.

One job in, one dubbed audio track out. The job carries everything the worker
needs — the video URL, the translated lines with their timings, the original
lines for picking a voice sample, a signed upload URL and a callback — so the
worker holds no database key and no state.

Pipeline, per job:
  1. pull the video, extract mono 24 kHz audio
  2. build a voice sample: the loudest-talking speaker's clean stretches,
     stitched to ~20 s
  3. read each translated line with Chatterbox in that voice
  4. fit each line into its slot (speed up a little, never more than 1.5x)
  5. keep only the new speech; players mix original audio separately
  6. encode AAC, PUT to the signed URL, report back

Runs as a RunPod serverless handler by default. `python handler.py job.json`
runs one job locally for a listen.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import traceback
from typing import Any

import numpy as np
import requests
import soundfile as sf
import torch

SR = 24_000
MODEL = "chatterbox-multilingual-v3"
REF_TARGET_S = 20.0
REF_MIN_S = 4.0
MAX_STRETCH = 1.5
# Lines shorter than this are folded into a neighbour: a two-word
# fragment badly, and the join is inaudible when the gap is under half a second.
MERGE_GAP_S = 0.5
MERGE_MAX_S = 9.0
MERGE_MAX_CHARS = 240

LANGUAGES = {"ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it", "ja", "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh"}

_tts = None


def tts():
    global _tts
    if _tts is None:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"loading {MODEL} on {device}")
        torch.set_num_threads(int(os.environ.get("DUB_CPU_THREADS", "2")))
        _tts = ChatterboxMultilingualTTS.from_pretrained(device=device, t3_model="v3")
        if _tts.sr != SR:
            raise RuntimeError(f"unexpected sample rate {_tts.sr}")
    return _tts


def sh(*cmd: str) -> None:
    subprocess.run(list(cmd), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def read_wav(path: str) -> np.ndarray:
    data, sr = sf.read(path, dtype="float32", always_2d=False)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != SR:
        raise RuntimeError(f"expected {SR} Hz, got {sr}")
    return data


def extract_audio(video: str, out: str) -> None:
    sh("ffmpeg", "-y", "-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", out)


def stretch(wav: np.ndarray, factor: float, tmp: str) -> np.ndarray:
    """Speed up by `factor` (>1) without changing pitch."""
    src = os.path.join(tmp, "st_in.wav")
    dst = os.path.join(tmp, "st_out.wav")
    sf.write(src, wav, SR)
    # atempo takes 0.5–2.0 per stage; chain if ever asked for more.
    stages = []
    f = factor
    while f > 2.0:
        stages.append("atempo=2.0")
        f /= 2.0
    stages.append(f"atempo={f:.4f}")
    sh("ffmpeg", "-y", "-v", "error", "-i", src, "-filter:a", ",".join(stages), "-ar", str(SR), dst)
    return read_wav(dst)


# ───────────────────────────── voice sample ──────────────────────────────


def build_reference(orig: np.ndarray, source_segments: list[dict], tmp: str) -> tuple[str | None, str]:
    """Return (path, 'cloned'|'stock'). Picks the speaker who talks most and
    stitches their longest lines up to REF_TARGET_S."""
    by_speaker: dict[str, float] = {}
    for s in source_segments:
        d = max(0.0, float(s.get("end", 0)) - float(s.get("start", 0)))
        by_speaker[str(s.get("speaker") or "0")] = by_speaker.get(str(s.get("speaker") or "0"), 0.0) + d
    speaker = max(by_speaker, key=by_speaker.get) if by_speaker else "0"

    lines = [
        s for s in source_segments
        if str(s.get("speaker") or "0") == speaker and float(s.get("end", 0)) - float(s.get("start", 0)) >= 1.0
    ]
    lines.sort(key=lambda s: float(s["end"]) - float(s["start"]), reverse=True)

    pieces: list[np.ndarray] = []
    total = 0.0
    gap = np.zeros(int(0.2 * SR), dtype=np.float32)
    for s in lines:
        a = max(0, int(float(s["start"]) * SR))
        b = min(len(orig), int(float(s["end"]) * SR))
        if b <= a:
            continue
        pieces.append(orig[a:b])
        pieces.append(gap)
        total += (b - a) / SR
        if total >= REF_TARGET_S:
            break

    voice = "cloned"
    if total < REF_MIN_S:
        return None, "stock"

    ref = np.concatenate(pieces)[: int(REF_TARGET_S * SR)]
    peak = float(np.max(np.abs(ref))) if len(ref) else 0.0
    if peak > 0:
        ref = ref * (0.9 / peak)
    path = os.path.join(tmp, f"ref-{len(os.listdir(tmp))}.wav")
    sf.write(path, ref, SR)
    return path, voice


# ───────────────────────────── line merging ──────────────────────────────


def merge_lines(segments: list[dict]) -> list[dict]:
    out: list[dict] = []
    for s in segments:
        text = " ".join(str(s.get("text") or "").split())
        if not text:
            continue
        cur = {"start": float(s["start"]), "end": float(s["end"]), "text": text, "speaker": s.get("speaker")}
        if out:
            prev = out[-1]
            same = prev.get("speaker") == cur.get("speaker")
            gap = cur["start"] - prev["end"]
            if (
                same
                and gap <= MERGE_GAP_S
                and cur["end"] - prev["start"] <= MERGE_MAX_S
                and len(prev["text"]) + len(text) + 1 <= MERGE_MAX_CHARS
            ):
                prev["end"] = cur["end"]
                prev["text"] = prev["text"] + " " + text
                continue
        out.append(cur)
    return out


# ───────────────────────────── synthesis ─────────────────────────────────


def synth(text: str, ref: str | None, lang: str) -> np.ndarray:
    engine = tts()
    original_conditioning = engine.conds
    try:
        with torch.inference_mode():
            wav = engine.generate(text, language_id=lang, audio_prompt_path=ref)
        arr = wav.squeeze().detach().cpu().numpy().astype(np.float32)
    finally:
        engine.conds = original_conditioning
    # Trim leading/trailing near-silence so the line lands on its cue.
    thresh = 0.01
    idx = np.where(np.abs(arr) > thresh)[0]
    if len(idx):
        arr = arr[max(0, idx[0] - int(0.02 * SR)) : min(len(arr), idx[-1] + int(0.05 * SR))]
    return arr


def render(orig: np.ndarray, lines: list[dict], refs: dict[str, str | None], lang: str, tmp: str) -> tuple[np.ndarray, int]:
    speech = np.zeros_like(orig)
    cursor = 0.0  # where the previous line actually ended, in seconds
    spoken = 0

    for i, line in enumerate(lines):
        wav = synth(line["text"], refs.get(str(line.get("speaker") or "0")), lang)
        if not len(wav):
            continue
        start = max(line["start"], cursor + 0.05)
        next_start = lines[i + 1]["start"] if i + 1 < len(lines) else len(orig) / SR
        # The slot is the line's own span plus whatever silence follows it,
        # up to a second — a translation is often longer than the original.
        allowed = max(0.6, (line["end"] - start) + min(1.0, max(0.0, next_start - line["end"])))
        dur = len(wav) / SR
        if dur > allowed:
            factor = min(MAX_STRETCH, dur / allowed)
            if factor > 1.03:
                wav = stretch(wav, factor, tmp)
        a = int(start * SR)
        b = min(len(speech), a + len(wav))
        if b <= a:
            break
        speech[a:b] += wav[: b - a]
        cursor = b / SR
        spoken += 1

    mix = speech
    peak = float(np.max(np.abs(mix))) if len(mix) else 0.0
    if peak > 0.95:
        mix = mix * (0.95 / peak)
    return mix.astype(np.float32), spoken


# ───────────────────────────── job ───────────────────────────────────────


def report(job: dict, payload: dict) -> None:
    url = job.get("callbackUrl")
    if not url:
        print("no callback:", json.dumps(payload)[:300])
        return
    body = {"action": "complete", "secret": job.get("secret"), "dubId": job.get("dubId"), "jobId": job.get("jobId"), **payload}
    for attempt in range(3):
        try:
            r = requests.post(url, json=body, timeout=30)
            if r.ok:
                return
            print(f"callback failed: {r.status_code}")
        except requests.RequestException:
            print("callback connection failed")
        time.sleep(2 * (attempt + 1))


def process(job: dict) -> dict:
    t0 = time.time()
    lang = str(job["lang"]).lower()
    if lang not in LANGUAGES:
        raise RuntimeError("unsupported dub language")
    segments = job.get("segments") or []
    source_segments = job.get("sourceSegments") or segments
    if not segments:
        raise RuntimeError("no lines to dub")

    with tempfile.TemporaryDirectory() as tmp:
        video = os.path.join(tmp, "in.mp4")
        with requests.get(job["videoUrl"], stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(video, "wb") as f:
                size = 0
                for chunk in r.iter_content(1 << 20):
                    size += len(chunk)
                    if size > 500 * 1024 * 1024:
                        raise RuntimeError("video exceeds download limit")
                    f.write(chunk)

        orig_path = os.path.join(tmp, "orig.wav")
        extract_audio(video, orig_path)
        orig = read_wav(orig_path)
        if len(orig) < SR:
            raise RuntimeError("audio too short")
        if len(orig) > 900 * SR:
            raise RuntimeError("video exceeds duration limit")

        refs = {}
        cloned = False
        for speaker in {str(s.get("speaker") or "0") for s in segments}:
            sample_lines = [s for s in source_segments if str(s.get("speaker") or "0") == speaker]
            ref, kind = build_reference(orig, sample_lines, tmp)
            refs[speaker] = ref
            cloned = cloned or kind == "cloned"
        voice = "cloned" if cloned else "stock"
        lines = merge_lines(segments)
        mix, spoken = render(orig, lines, refs, lang, tmp)
        if spoken == 0:
            raise RuntimeError("nothing synthesised")

        mix_path = os.path.join(tmp, "mix.wav")
        out_path = os.path.join(tmp, "out.m4a")
        sf.write(mix_path, mix, SR)
        sh("ffmpeg", "-y", "-v", "error", "-i", mix_path, "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", out_path)

        with open(out_path, "rb") as f:
            data = f.read()
        up = requests.put(
            job["uploadUrl"],
            data=data,
            headers={"Content-Type": "audio/mp4", "x-upsert": "true"},
            timeout=120,
        )
        if not up.ok:
            raise RuntimeError(f"upload failed ({up.status_code})")

    # The signed URL is .../upload/sign/<bucket>/<path>?token=…; the row wants <path>.
    path = job["path"]
    result = {
        "ok": True,
        "path": path,
        "voice": voice,
        "durationSeconds": len(orig) / SR,
        "lines": spoken,
        "seconds": round(time.time() - t0, 1),
        "bytes": len(data),
    }
    print(json.dumps({k: v for k, v in result.items()}))
    return result


def handler(event: dict) -> dict:
    job = event.get("input") or {}
    try:
        result = process(job)
        report(job, result)
        return result
    except Exception as e:  # noqa: BLE001
        err = f"{type(e).__name__}: network request failed" if isinstance(e, requests.RequestException) else f"{type(e).__name__}: {e}"
        if isinstance(e, subprocess.CalledProcessError) and e.stderr:
            err += " — " + e.stderr.decode(errors="ignore")[-300:]
        if not isinstance(e, requests.RequestException):
            traceback.print_exc()
        report(job, {"ok": False, "error": err})
        return {"ok": False, "error": err}


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            print(json.dumps(handler({"input": json.load(f)}), indent=2))
    else:
        import runpod

        runpod.serverless.start({"handler": handler})
