"""
Whisper transcription worker.

One job in, one transcript out. The job names a public media URL and a
callback; the worker holds no database key and keeps no state. It downloads
the media, transcribes it (and diarizes it when asked), and posts the result to
the callback with the shared secret and the job id the caller is waiting for.

Runs as a RunPod serverless handler (`python handler.py`), behind the HTTP
server in server.py, or once from the command line for a listen:
`python handler.py job.json`.
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

import engine

MAX_DOWNLOAD_BYTES = int(os.environ.get("WHISPER_MAX_BYTES", str(2 * 1024 * 1024 * 1024)))


def download(url: str, path: str) -> None:
    with requests.get(url, stream=True, timeout=(10, 120)) as r:
        r.raise_for_status()
        size = 0
        with open(path, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                size += len(chunk)
                if size > MAX_DOWNLOAD_BYTES:
                    raise RuntimeError("media exceeds download limit")
                f.write(chunk)


def process(job: dict) -> dict:
    t0 = time.time()
    url = str(job.get("mediaUrl") or "")
    if not url.startswith("https://"):
        raise RuntimeError("mediaUrl must be https")
    with tempfile.TemporaryDirectory() as tmp:
        media = os.path.join(tmp, "media")
        download(url, media)
        audio = engine.load_audio(media)
    if len(audio) < engine.SR // 2:
        raise RuntimeError("audio too short")
    result = engine.transcribe(
        audio,
        diarize_speakers=bool(job.get("diarize")),
        language=job.get("language") or None,
    )
    result["seconds"] = round(time.time() - t0, 1)
    print(json.dumps({
        "jobId": job.get("jobId"),
        "language": result["language"],
        "duration": result["duration"],
        "segments": len(result["segments"]),
        "diarized": result["diarized"],
        "seconds": result["seconds"],
    }))
    return result


def report(job: dict, payload: dict) -> None:
    url = job.get("callbackUrl")
    if not url:
        return
    body = {
        "action": "complete",
        "secret": job.get("secret"),
        "jobId": job.get("jobId"),
        "kind": job.get("kind"),
        "ref": job.get("ref"),
        **payload,
    }
    for attempt in range(3):
        try:
            r = requests.post(url, json=body, timeout=60)
            # 409 is the caller saying it stopped waiting for this job.
            if r.ok or r.status_code == 409:
                return
            print(f"callback failed: {r.status_code}")
        except requests.RequestException:
            print("callback connection failed")
        time.sleep(2 * (attempt + 1))


def error_text(e: Exception) -> str:
    if isinstance(e, requests.RequestException):
        return f"{type(e).__name__}: media download failed"
    err = f"{type(e).__name__}: {e}"
    if isinstance(e, subprocess.CalledProcessError) and e.stderr:
        err += " — " + e.stderr.decode(errors="ignore")[-300:]
    return err[:1000]


def handler(event: dict) -> dict:
    job = event.get("input") or {}
    start_by = float(job.get("startBy") or 0)
    if start_by and time.time() > start_by:
        # The caller has already given up on this job and transcribed it some
        # other way. Say so instead of spending minutes on it.
        payload = {"ok": False, "error": "expired before it started"}
        report(job, payload)
        return payload
    try:
        result = process(job)
        payload = {"ok": True, **result}
    except Exception as e:  # noqa: BLE001
        if not isinstance(e, requests.RequestException):
            traceback.print_exc()
        payload = {"ok": False, "error": error_text(e)}
    report(job, payload)
    return payload


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            out = handler({"input": json.load(f)})
        print(json.dumps({k: v for k, v in out.items() if k != "segments"}, indent=2))
    else:
        import runpod

        runpod.serverless.start({"handler": handler})
