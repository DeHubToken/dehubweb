"""
Stage clips: vertical shorts cut from a finished Stage recording.

Runs beside the dub worker on the same host, because that host already has
ffmpeg, the shared worker secret and the nginx route. One job is one stage: the
recording URL, an optional background image (the stage cover or the host's
avatar) and up to three clips, each with its own window, its own ASS overlay
(captions, watermark, end card; written by the stage-clips edge function) and
its own signed upload URL. The worker holds no database key and no state.

Per clip:
  1. cut the window out of the recording
  2. 1080x1920: a video stage is fitted over a blurred copy of itself; an
     audio-only stage gets the image (or a flat brand colour) and a waveform
  3. freeze the last frame for the end card, darken it, burn in the overlay
  4. H.264/AAC MP4, PUT to the signed URL, report back

`python clips.py job.json` runs one job locally.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import traceback

import requests

W, H = 1080, 1920
FPS = 30
END_CARD_S = 3.0
MAX_RECORDING_BYTES = 500 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_CLIPS = 3
MIN_CLIP_S, MAX_CLIP_S = 10.0, 75.0
BG_COLOUR = "0x0E0E14"
WAVE_COLOUR = "0xF5C542"


def sh(*cmd: str, cwd: str | None = None) -> str:
    out = subprocess.run(list(cmd), check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd)
    return out.stdout.decode(errors="ignore")


def download(url: str, path: str, limit: int) -> None:
    if not url.startswith("https://"):
        raise RuntimeError("only https sources are fetched")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        size = 0
        with open(path, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                size += len(chunk)
                if size > limit:
                    raise RuntimeError("source exceeds download limit")
                f.write(chunk)


def has_video(path: str) -> bool:
    out = sh("ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=codec_type", "-of", "csv=p=0", path)
    return "video" in out


def filter_graph(clip_s: float, video: bool, image: bool) -> str:
    """The filter_complex for one clip. Input 0 is the recording, already cut to
    the window; input 1 is the looped background image when `image`. Output pads
    are [v] and [a]; the overlay is read from clip.ass in the working directory."""
    total = clip_s + END_CARD_S
    fade_at = max(0.0, clip_s - 0.8)
    parts: list[str] = []
    if video:
        parts += [
            "[0:v]split=2[src_bg][src_fg]",
            f"[src_bg]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=24:2,eq=brightness=-0.15[bg]",
            f"[src_fg]scale={W}:{H}:force_original_aspect_ratio=decrease[fg]",
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,fps={FPS}[base]",
            "[0:a]anull[speech]",
        ]
    else:
        if image:
            parts += [
                "[1:v]split=2[img_bg][img_fg]",
                f"[img_bg]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:2,eq=brightness=-0.3[bg]",
                "[img_fg]scale=560:560:force_original_aspect_ratio=increase,crop=560:560[face]",
                "[bg][face]overlay=(W-w)/2:400[still]",
            ]
        else:
            parts.append(f"color=c={BG_COLOUR}:s={W}x{H}:r={FPS}:d={clip_s:.3f}[still]")
        parts += [
            "[0:a]asplit=2[speech][for_wave]",
            f"[for_wave]showwaves=s={W}x260:mode=cline:rate={FPS}:colors={WAVE_COLOUR},format=rgba,colorkey=black:0.1:0.1[wave]",
            f"[still][wave]overlay=0:1040:shortest=1,fps={FPS}[base]",
        ]
    parts += [
        f"[base]trim=duration={clip_s:.3f},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={END_CARD_S},"
        f"drawbox=x=0:y=0:w=iw:h=ih:color=black@0.62:t=fill:enable='gte(t,{clip_s:.3f})',ass=clip.ass,format=yuv420p[v]",
        f"[speech]atrim=duration={clip_s:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.15,afade=t=out:st={fade_at:.3f}:d=0.8,"
        f"apad=whole_dur={total:.3f},aresample=44100[a]",
    ]
    return ";".join(parts)


def render_cmd(recording: str, start: float, clip_s: float, video: bool, image: str | None, out: str) -> list[str]:
    total = clip_s + END_CARD_S
    cmd = ["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{clip_s:.3f}", "-i", recording]
    if image and not video:
        cmd += ["-loop", "1", "-framerate", str(FPS), "-t", f"{clip_s:.3f}", "-i", image]
    cmd += [
        "-filter_complex", filter_graph(clip_s, video, bool(image) and not video),
        "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-profile:v", "high", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-movflags", "+faststart", out,
    ]
    return cmd


def report(job: dict, clip: dict, payload: dict) -> None:
    url = job.get("callbackUrl")
    if not url:
        print("no callback:", json.dumps(payload)[:300])
        return
    body = {"action": "complete", "secret": job.get("secret"), "clipId": clip.get("clipId"), "jobId": clip.get("jobId"), **payload}
    for attempt in range(3):
        try:
            r = requests.post(url, json=body, timeout=30)
            if r.ok:
                return
            print(f"clip callback failed: {r.status_code}")
        except requests.RequestException:
            print("clip callback connection failed")
        time.sleep(2 * (attempt + 1))


def valid_clips(job: dict) -> list[dict]:
    clips = []
    for c in job.get("clips") or []:
        if len(clips) >= MAX_CLIPS:
            break
        try:
            start, end = float(c["start"]), float(c["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if start < 0 or not (MIN_CLIP_S <= end - start <= MAX_CLIP_S):
            continue
        if not all(c.get(k) for k in ("clipId", "jobId", "uploadUrl", "path", "ass")):
            continue
        clips.append({**c, "start": start, "end": end})
    return clips


def render_one(job: dict, clip: dict, recording: str, video: bool, image: str | None, tmp: str) -> dict:
    t0 = time.time()
    clip_s = clip["end"] - clip["start"]
    work = os.path.join(tmp, clip["clipId"])
    os.makedirs(work, exist_ok=True)
    with open(os.path.join(work, "clip.ass"), "w", encoding="utf-8") as f:
        f.write(clip["ass"])
    out = os.path.join(work, "clip.mp4")
    sh(*render_cmd(recording, clip["start"], clip_s, video, image, out), cwd=work)
    with open(out, "rb") as f:
        data = f.read()
    up = requests.put(clip["uploadUrl"], data=data, headers={"Content-Type": "video/mp4", "x-upsert": "true"}, timeout=180)
    if not up.ok:
        raise RuntimeError(f"upload failed ({up.status_code})")
    return {
        "ok": True,
        "path": clip["path"],
        "durationSeconds": round(clip_s + END_CARD_S, 2),
        "bytes": len(data),
        "seconds": round(time.time() - t0, 1),
    }


def error_text(e: Exception) -> str:
    if isinstance(e, requests.RequestException):
        return f"{type(e).__name__}: network request failed"
    err = f"{type(e).__name__}: {e}"
    if isinstance(e, subprocess.CalledProcessError) and e.stderr:
        err += " - " + e.stderr.decode(errors="ignore")[-300:]
    return err


def process(job: dict) -> list[dict]:
    clips = valid_clips(job)
    if not clips:
        raise RuntimeError("no renderable clips")
    results = []
    with tempfile.TemporaryDirectory() as tmp:
        recording = os.path.join(tmp, "recording")
        try:
            download(job["recordingUrl"], recording, MAX_RECORDING_BYTES)
            video = has_video(recording)
        except Exception as e:  # noqa: BLE001
            err = error_text(e)
            for clip in clips:
                report(job, clip, {"ok": False, "error": err})
            return [{"ok": False, "error": err}]

        image = None
        if not video and job.get("imageUrl"):
            try:
                image = os.path.join(tmp, "background")
                download(job["imageUrl"], image, MAX_IMAGE_BYTES)
            except Exception as e:  # noqa: BLE001
                # A missing avatar is not worth a clip: fall back to the brand colour.
                print("background image skipped:", error_text(e))
                image = None

        for clip in clips:
            try:
                result = render_one(job, clip, recording, video, image, tmp)
            except Exception as e:  # noqa: BLE001
                if not isinstance(e, (requests.RequestException, subprocess.CalledProcessError)):
                    traceback.print_exc()
                result = {"ok": False, "error": error_text(e)}
            print(json.dumps({"clipId": clip["clipId"], **result}))
            report(job, clip, result)
            results.append(result)
    return results


def handler(job: dict) -> list[dict]:
    try:
        return process(job)
    except Exception as e:  # noqa: BLE001
        err = error_text(e)
        print("clip job failed:", err)
        return [{"ok": False, "error": err}]


if __name__ == "__main__":
    with open(sys.argv[1]) as f:
        print(json.dumps(handler(json.load(f)), indent=2))
