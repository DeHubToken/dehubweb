"""One bounded transcription worker behind a small HTTP API."""
import hmac
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore

from fastapi import FastAPI, Header, HTTPException

import engine
from handler import handler, process

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
# One transcription at a time — Whisper already uses every core it is given —
# with a short queue behind it. A full queue answers 503 and the caller falls
# back to a paid engine straight away, which beats a job waiting past its
# deadline.
QUEUE = int(os.environ.get("WHISPER_QUEUE", "8"))
slots = BoundedSemaphore(QUEUE + 1)
executor = ThreadPoolExecutor(max_workers=1)
state = {"running": 0, "accepted": 0}
lock = threading.Lock()


@app.get("/")
def health():
    return {
        "service": "whisper",
        "model": engine.MODEL,
        "device": engine.device(),
        "running": state["running"],
        "accepted": state["accepted"],
        "queue": QUEUE,
    }


def authorized(authorization: str) -> str:
    secret = os.environ.get("WHISPER_WORKER_SECRET", "")
    if not secret or not hmac.compare_digest(authorization, f"Bearer {secret}"):
        raise HTTPException(403, "Forbidden")
    return secret


def run(job):
    with lock:
        state["running"] += 1
    try:
        handler({"input": job})
    finally:
        with lock:
            state["running"] -= 1
            state["accepted"] -= 1
        slots.release()


@app.post("/jobs", status_code=202)
def submit(body: dict, authorization: str = Header(default="")):
    secret = authorized(authorization)
    job = body.get("input") or {}
    if not all(job.get(k) for k in ("jobId", "mediaUrl", "callbackUrl")):
        raise HTTPException(400, "Incomplete job")
    if not slots.acquire(blocking=False):
        raise HTTPException(503, "Worker busy", headers={"Retry-After": "120"})
    job["secret"] = secret
    with lock:
        state["accepted"] += 1
    try:
        executor.submit(run, job)
    except Exception:
        with lock:
            state["accepted"] -= 1
        slots.release()
        raise
    return {"id": job["jobId"]}


@app.post("/transcribe")
def transcribe_now(body: dict, authorization: str = Header(default="")):
    """Synchronous, for checks by hand. Takes a queue slot like any job."""
    authorized(authorization)
    if not body.get("mediaUrl"):
        raise HTTPException(400, "mediaUrl required")
    if not slots.acquire(blocking=False):
        raise HTTPException(503, "Worker busy", headers={"Retry-After": "120"})
    try:
        return executor.submit(process, body).result()
    except RuntimeError as e:
        raise HTTPException(422, str(e)) from e
    finally:
        slots.release()
