"""
Speech to text on our own hardware.

faster-whisper (CTranslate2) produces the words and their timings. When asked,
a sherpa-onnx pass (pyannote segmentation plus a speaker-embedding model, both
ONNX, both CPU-cheap) says who spoke each word. The result is the segment shape
the `transcribe` Edge Function already stores — {start, end, text, speaker?} —
with each segment's words attached.

Everything model-related is loaded lazily and cached, so the pure functions
below (speaker assignment, segment building) are testable without weights.
"""
from __future__ import annotations

import os
import subprocess
from typing import Any, Iterable

import numpy as np

SR = 16_000
MODEL = os.environ.get("WHISPER_MODEL", "small")
MODELS_DIR = os.environ.get("WHISPER_MODELS_DIR", "/models")
# A caption line longer than this reads badly and seeks badly.
MAX_SEGMENT_S = 6.0
# A pause this long starts a new line even mid-sentence.
MAX_GAP_S = 1.0
MAX_AUDIO_S = float(os.environ.get("WHISPER_MAX_SECONDS", str(4 * 3600)))

_whisper = None
_diarizer = None


def device() -> str:
    forced = os.environ.get("WHISPER_DEVICE")
    if forced:
        return forced
    try:
        import ctranslate2

        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:  # noqa: BLE001
        return "cpu"


def threads() -> int:
    return int(os.environ.get("WHISPER_THREADS") or os.cpu_count() or 2)


def whisper():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel

        dev = device()
        compute = os.environ.get("WHISPER_COMPUTE") or ("float16" if dev == "cuda" else "int8")
        print(f"loading faster-whisper {MODEL} on {dev} ({compute}, {threads()} threads)")
        _whisper = WhisperModel(MODEL, device=dev, compute_type=compute, cpu_threads=threads())
    return _whisper


def diarizer():
    global _diarizer
    if _diarizer is None:
        import sherpa_onnx

        seg = os.path.join(MODELS_DIR, "sherpa-onnx-pyannote-segmentation-3-0", "model.onnx")
        emb = os.path.join(MODELS_DIR, os.environ.get("DIARIZE_EMBEDDING", "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"))
        config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
            segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
                pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=seg),
                num_threads=threads(),
            ),
            embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=emb, num_threads=threads()),
            clustering=sherpa_onnx.FastClusteringConfig(
                num_clusters=-1,
                threshold=float(os.environ.get("DIARIZE_THRESHOLD", "0.5")),
            ),
            min_duration_on=0.3,
            min_duration_off=0.5,
        )
        if not config.validate():
            raise RuntimeError("diarization models missing or invalid")
        _diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
    return _diarizer


# ───────────────────────────── audio ─────────────────────────────────────


def load_audio(path: str) -> np.ndarray:
    """Any container we receive — MP4, WebM/Opus, raw ADTS AAC, M4A — as 16 kHz
    mono float32. ffmpeg rather than PyAV because the stage recordings include
    hand-remuxed and raw-AAC files that only ffmpeg's probing gets right."""
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    audio = np.frombuffer(proc.stdout, dtype=np.float32)
    if len(audio) > MAX_AUDIO_S * SR:
        raise RuntimeError("audio exceeds duration limit")
    return audio


# ───────────────────────────── recognition ───────────────────────────────


def recognize(audio: np.ndarray, language: str | None = None, vad: bool = True) -> tuple[list[dict], dict]:
    """Words with timings, each tagged with the Whisper segment it came from."""
    segments, info = whisper().transcribe(
        audio,
        language=language or None,
        beam_size=5,
        word_timestamps=True,
        vad_filter=vad,
        vad_parameters={"min_silence_duration_ms": 500},
        # Conditioning on the previous window is what turns one misheard line
        # into a loop that repeats for minutes. Short posts lose nothing by it.
        condition_on_previous_text=False,
    )
    words: list[dict] = []
    previous: list[str] = []
    for index, seg in enumerate(segments):
        text = (seg.text or "").strip()
        # The same line three times running is a decoding loop, not speech.
        if text and previous[-2:] == [text, text]:
            continue
        previous.append(text)
        for w in seg.words or []:
            piece = w.word or ""
            if not piece.strip():
                continue
            words.append({"start": float(w.start), "end": float(w.end), "word": piece, "segment": index})
    meta = {
        "language": info.language,
        "languageProbability": round(float(info.language_probability or 0), 3),
        "duration": round(float(info.duration or len(audio) / SR), 3),
    }
    return words, meta


def diarize(audio: np.ndarray) -> list[tuple[float, float, int]]:
    result = diarizer().process(audio).sort_by_start_time()
    return [(float(r.start), float(r.end), int(r.speaker)) for r in result]


# ───────────────────────────── assembly ──────────────────────────────────


def assign_speakers(words: list[dict], turns: Iterable[tuple[float, float, int]]) -> None:
    """Give each word the speaker whose turn overlaps it most. A word in a gap
    between turns takes the nearest turn within a second, else the previous
    word's speaker — a breath between turns is not a new person."""
    turns = sorted(turns)
    if not turns:
        return
    last: int | None = None
    for w in words:
        best, best_overlap = None, 0.0
        nearest, nearest_gap = None, 1.0
        for start, end, spk in turns:
            if start > w["end"] + 1.0:
                break
            overlap = min(end, w["end"]) - max(start, w["start"])
            if overlap > best_overlap:
                best, best_overlap = spk, overlap
            gap = max(start - w["end"], w["start"] - end, 0.0)
            if gap < nearest_gap:
                nearest, nearest_gap = spk, gap
        spk = best if best is not None else nearest if nearest is not None else last
        if spk is not None:
            w["speaker"] = f"speaker_{spk}"
            last = spk


def build_segments(words: list[dict]) -> list[dict]:
    """Caption lines. Whisper's own segment boundaries are kept (they fall on
    sentences); inside one, a change of speaker, a pause or a line running past
    MAX_SEGMENT_S starts a new one."""
    out: list[dict] = []
    cur: dict | None = None
    for w in words:
        if (
            cur is None
            or w.get("segment") != cur["_segment"]
            or w.get("speaker") != cur.get("speaker")
            or w["start"] - cur["end"] > MAX_GAP_S
            or w["end"] - cur["start"] > MAX_SEGMENT_S
        ):
            if cur is not None:
                out.append(cur)
            cur = {"start": w["start"], "end": w["end"], "words": [], "_segment": w.get("segment")}
            if w.get("speaker"):
                cur["speaker"] = w["speaker"]
        cur["end"] = max(cur["end"], w["end"])
        cur["words"].append({"start": round(w["start"], 3), "end": round(w["end"], 3), "word": w["word"]})
    if cur is not None:
        out.append(cur)

    segments = []
    for s in out:
        text = "".join(x["word"] for x in s["words"]).strip()
        if not text:
            continue
        seg: dict[str, Any] = {"start": round(s["start"], 3), "end": round(s["end"], 3), "text": text, "words": s["words"]}
        if s.get("speaker"):
            seg["speaker"] = s["speaker"]
        segments.append(seg)
    return segments


def transcribe(audio: np.ndarray, *, diarize_speakers: bool = False, language: str | None = None, vad: bool = True) -> dict:
    words, meta = recognize(audio, language=language, vad=vad)
    diarized = False
    if diarize_speakers and words:
        assign_speakers(words, diarize(audio))
        diarized = True
    segments = build_segments(words)
    return {
        **meta,
        "model": MODEL,
        "diarized": diarized,
        "segments": segments,
        "text": " ".join(s["text"] for s in segments),
    }
