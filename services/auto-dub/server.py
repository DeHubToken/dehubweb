"""One bounded worker, deployable on an existing host."""
import hmac
import os
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore

from fastapi import FastAPI, Header, HTTPException

import clips
from handler import handler

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
slots = BoundedSemaphore(1)
executor = ThreadPoolExecutor(max_workers=1)
# Stage clips are ffmpeg only and run on their own thread, one at a time, with
# room for one more stage to wait its turn.
clip_slots = BoundedSemaphore(2)
clip_executor = ThreadPoolExecutor(max_workers=1)


@app.get("/")
def health():
    return {"service": "video-dubs", "provider": "chatterbox-multilingual-v3", "clips": True}


def authorized(authorization: str) -> str:
    secret = os.environ.get("DUB_WORKER_SECRET", "")
    if not secret or not hmac.compare_digest(authorization, f"Bearer {secret}"):
        raise HTTPException(403, "Forbidden")
    return secret


def run(job):
    try:
        handler({"input": job})
    finally:
        slots.release()


def run_clips(job):
    try:
        clips.handler(job)
    finally:
        clip_slots.release()


@app.post("/jobs", status_code=202)
def submit(body: dict, authorization: str = Header(default="")):
    secret = authorized(authorization)
    job = body.get("input") or {}
    if not all(job.get(k) for k in ("dubId", "jobId", "lang", "videoUrl", "uploadUrl", "callbackUrl", "path")):
        raise HTTPException(400, "Incomplete job")
    if not slots.acquire(blocking=False):
        raise HTTPException(503, "Worker busy", headers={"Retry-After": "60"})
    job["secret"] = secret
    try:
        executor.submit(run, job)
    except Exception:
        slots.release()
        raise
    return {"id": job["jobId"]}


@app.post("/clips", status_code=202)
def submit_clips(body: dict, authorization: str = Header(default="")):
    secret = authorized(authorization)
    job = body.get("input") or {}
    if not job.get("stageId") or not job.get("recordingUrl") or not job.get("callbackUrl") or not clips.valid_clips(job):
        raise HTTPException(400, "Incomplete job")
    if not clip_slots.acquire(blocking=False):
        raise HTTPException(503, "Worker busy", headers={"Retry-After": "300"})
    job["secret"] = secret
    try:
        clip_executor.submit(run_clips, job)
    except Exception:
        clip_slots.release()
        raise
    return {"id": job["stageId"]}
