"""
Live clips: the last stretch of a live video stream, and the vertical Short
cut from it.

Runs beside the Stage clips on the dub host, with the same ffmpeg, secret and
nginx route. Two kinds of job, both answered through the live-clips edge
function's callback; the worker holds no database key and no state.

  grab    Pull the newest segments of a live HLS stream (whatever the CDN still
          holds, up to `maxSeconds`), join them and remux to one MP4 with no
          re-encode. That file is what the clipper trims in the editor.
  render  Cut [start, end] out of a source MP4 (a grabbed window or a whole
          replay; ffmpeg seeks it over HTTP), fit it to 1080x1920 over a
          blurred copy of itself, burn in the overlay and end card, and write a
          poster frame and a 1200x630 share card next to it.

`python live_clips.py job.json` runs one job locally.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import traceback
from urllib.parse import urljoin

import requests

import clips

MAX_GRAB_S = 90.0
MAX_SEGMENT_BYTES = 40 * 1024 * 1024
MAX_GRAB_BYTES = 250 * 1024 * 1024
MIN_CLIP_S, MAX_CLIP_S = 3.0, 75.0
CARD_W, CARD_H = 1200, 630


def fetch_text(url: str) -> str:
    if not url.startswith("https://"):
        raise RuntimeError("only https sources are fetched")
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.text


def parse_master(text: str, base: str) -> str | None:
    """The highest-bandwidth variant of a master playlist, or None for a media playlist."""
    best: tuple[int, str] | None = None
    lines = [ln.strip() for ln in text.splitlines()]
    for i, line in enumerate(lines):
        if not line.startswith("#EXT-X-STREAM-INF"):
            continue
        bw = 0
        for part in line.split(":", 1)[-1].split(","):
            if part.startswith("BANDWIDTH="):
                try:
                    bw = int(part.split("=", 1)[1])
                except ValueError:
                    bw = 0
        uri = next((ln for ln in lines[i + 1:] if ln and not ln.startswith("#")), None)
        if uri and (best is None or bw > best[0]):
            best = (bw, urljoin(base, uri))
    return best[1] if best else None


def parse_media(text: str, base: str) -> tuple[str | None, list[tuple[float, str]]]:
    """(init segment URL or None, [(duration, segment URL)]) of a media playlist."""
    init = None
    segments: list[tuple[float, str]] = []
    pending: float | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("#EXT-X-MAP:"):
            for part in line.split(":", 1)[1].split(","):
                if part.startswith("URI="):
                    init = urljoin(base, part.split("=", 1)[1].strip('"'))
        elif line.startswith("#EXTINF:"):
            try:
                pending = float(line.split(":", 1)[1].split(",", 1)[0])
            except ValueError:
                pending = None
        elif line and not line.startswith("#") and pending is not None:
            segments.append((pending, urljoin(base, line)))
            pending = None
    return init, segments


def tail(segments: list[tuple[float, str]], seconds: float) -> list[tuple[float, str]]:
    """The newest segments covering at least `seconds` (or all of them)."""
    out: list[tuple[float, str]] = []
    total = 0.0
    for seg in reversed(segments):
        out.append(seg)
        total += seg[0]
        if total >= seconds:
            break
    return list(reversed(out))


def download_bytes(url: str, limit: int) -> bytes:
    if not url.startswith("https://"):
        raise RuntimeError("only https sources are fetched")
    with requests.get(url, stream=True, timeout=30) as r:
        r.raise_for_status()
        buf = bytearray()
        for chunk in r.iter_content(1 << 16):
            buf += chunk
            if len(buf) > limit:
                raise RuntimeError("segment exceeds download limit")
        return bytes(buf)


def probe_duration(path: str) -> float:
    out = clips.sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path)
    try:
        return float(out.strip())
    except ValueError:
        return 0.0


def grab(job: dict, tmp: str) -> dict:
    """Join the newest live segments into one faststart MP4 and upload it."""
    want = max(5.0, min(MAX_GRAB_S, float(job.get("maxSeconds") or 60)))
    url = job["hlsUrl"]
    text = fetch_text(url)
    variant = parse_master(text, url)
    if variant:
        url = variant
        text = fetch_text(url)
    init, segments = parse_media(text, url)
    picked = tail(segments, want)
    if not picked:
        raise RuntimeError("live playlist has no segments")

    joined = os.path.join(tmp, "joined" + (".mp4" if init else ".ts"))
    size = 0
    with open(joined, "wb") as f:
        if init:
            data = download_bytes(init, MAX_SEGMENT_BYTES)
            f.write(data)
        for _, seg in picked:
            data = download_bytes(seg, MAX_SEGMENT_BYTES)
            size += len(data)
            if size > MAX_GRAB_BYTES:
                raise RuntimeError("live window exceeds download limit")
            f.write(data)

    out = os.path.join(tmp, "source.mp4")
    try:
        clips.sh("ffmpeg", "-y", "-v", "error", "-i", joined, "-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart", out)
    except subprocess.CalledProcessError:
        # Opus audio or a codec MP4 will not carry: re-encode the audio only.
        clips.sh("ffmpeg", "-y", "-v", "error", "-i", joined, "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out)
    duration = probe_duration(out)
    if duration < MIN_CLIP_S:
        raise RuntimeError("live window too short to clip")
    put(job["uploadUrl"], out, "video/mp4")
    return {"ok": True, "path": job["path"], "durationSeconds": round(duration, 2)}


def card_cmd(source: str, at: float, out: str) -> list[str]:
    """A 1200x630 share card: the frame fitted over a blurred copy of itself."""
    graph = (
        "split=2[bg][fg];"
        f"[bg]scale={CARD_W}:{CARD_H}:force_original_aspect_ratio=increase,crop={CARD_W}:{CARD_H},boxblur=20:2,eq=brightness=-0.2[b];"
        f"[fg]scale={CARD_W}:{CARD_H}:force_original_aspect_ratio=decrease[f];"
        "[b][f]overlay=(W-w)/2:(H-h)/2"
    )
    return ["ffmpeg", "-y", "-v", "error", "-ss", f"{at:.3f}", "-i", source, "-frames:v", "1", "-filter_complex", graph, "-q:v", "3", out]


def render(job: dict, tmp: str) -> dict:
    start, end = float(job["start"]), float(job["end"])
    clip_s = end - start
    if start < 0 or not (MIN_CLIP_S <= clip_s <= MAX_CLIP_S):
        raise RuntimeError("clip window out of range")
    source = job["sourceUrl"]
    if not source.startswith("https://"):
        raise RuntimeError("only https sources are fetched")
    with open(os.path.join(tmp, "clip.ass"), "w", encoding="utf-8") as f:
        f.write(job["ass"])
    out = os.path.join(tmp, "clip.mp4")
    clips.sh(*clips.render_cmd(source, start, clip_s, True, None, out), cwd=tmp)
    poster = os.path.join(tmp, "poster.jpg")
    clips.sh("ffmpeg", "-y", "-v", "error", "-ss", f"{min(1.0, clip_s / 2):.3f}", "-i", out, "-frames:v", "1", "-q:v", "3", poster)
    card = os.path.join(tmp, "card.jpg")
    clips.sh(*card_cmd(source, start + clip_s / 2, card))

    uploads = job["uploads"]
    put(uploads["video"]["url"], out, "video/mp4")
    put(uploads["poster"]["url"], poster, "image/jpeg")
    put(uploads["card"]["url"], card, "image/jpeg")
    return {
        "ok": True,
        "paths": {k: uploads[k]["path"] for k in ("video", "poster", "card")},
        "durationSeconds": round(clip_s + clips.END_CARD_S, 2),
    }


def put(url: str, path: str, mime: str) -> None:
    with open(path, "rb") as f:
        r = requests.put(url, data=f.read(), headers={"Content-Type": mime, "x-upsert": "true"}, timeout=180)
    if not r.ok:
        raise RuntimeError(f"upload failed ({r.status_code})")


def valid(job: dict) -> bool:
    keys = ("kind", "clipId", "jobId", "callbackUrl")
    if not all(job.get(k) for k in keys):
        return False
    if job["kind"] == "grab":
        return all(job.get(k) for k in ("hlsUrl", "uploadUrl", "path"))
    if job["kind"] == "render":
        uploads = job.get("uploads") or {}
        return bool(job.get("sourceUrl") and job.get("ass")) and all(
            isinstance(uploads.get(k), dict) and uploads[k].get("url") and uploads[k].get("path") for k in ("video", "poster", "card")
        )
    return False


def report(job: dict, payload: dict) -> None:
    body = {"action": "complete", "secret": job.get("secret"), "kind": job.get("kind"), "clipId": job.get("clipId"), "jobId": job.get("jobId"), **payload}
    for attempt in range(3):
        try:
            r = requests.post(job["callbackUrl"], json=body, timeout=30)
            if r.ok:
                return
            print(f"live clip callback failed: {r.status_code}")
        except requests.RequestException:
            print("live clip callback connection failed")
        time.sleep(2 * (attempt + 1))


def handler(job: dict) -> dict:
    t0 = time.time()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            result = grab(job, tmp) if job.get("kind") == "grab" else render(job, tmp)
    except Exception as e:  # noqa: BLE001
        if not isinstance(e, (requests.RequestException, subprocess.CalledProcessError, RuntimeError)):
            traceback.print_exc()
        result = {"ok": False, "error": clips.error_text(e)}
    result["seconds"] = round(time.time() - t0, 1)
    print(json.dumps({"clipId": job.get("clipId"), "kind": job.get("kind"), **result}))
    report(job, result)
    return result


if __name__ == "__main__":
    with open(sys.argv[1]) as f:
        print(json.dumps(handler(json.load(f)), indent=2))
