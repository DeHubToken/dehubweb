"""One bounded worker, deployable on an existing host."""
import hmac
import os
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore

from fastapi import FastAPI, Header, HTTPException

from handler import handler

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
slots = BoundedSemaphore(1)
executor = ThreadPoolExecutor(max_workers=1)


@app.get("/")
def health():
    return {"service": "video-dubs", "provider": "chatterbox-multilingual-v3"}


def run(job):
    try:
        handler({"input": job})
    finally:
        slots.release()


@app.post("/jobs", status_code=202)
def submit(body: dict, authorization: str = Header(default="")):
    secret = os.environ.get("DUB_WORKER_SECRET", "")
    if not secret or not hmac.compare_digest(authorization, f"Bearer {secret}"):
        raise HTTPException(403, "Forbidden")
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
