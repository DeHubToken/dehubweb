"""Stage media runs separately so deploying it never interrupts a video dub."""
import hmac
import os
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore

from fastapi import FastAPI, Header, HTTPException
import recordings

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
slots = BoundedSemaphore(1)
recording_slots = BoundedSemaphore(1)
executor = ThreadPoolExecutor(max_workers=1)


def authorize(value):
    secret = os.environ.get('DUB_WORKER_SECRET', '')
    if not secret or not hmac.compare_digest(value, f'Bearer {secret}'):
        raise HTTPException(403, 'Forbidden')
    return secret


@app.get('/')
def health():
    return {'service': 'stage-media', 'recordings': True, 'dubs': True}


@app.post('/recordings')
def convert(body: dict, authorization: str = Header(default='')):
    authorize(authorization)
    if not recording_slots.acquire(blocking=False):
        raise HTTPException(503, 'Recording worker busy')
    try:
        return recordings.convert(body.get('input') or {})
    except Exception:
        raise HTTPException(502, 'Recording conversion failed')
    finally:
        recording_slots.release()


def run(job):
    try:
        from handler import handler
        handler({'input': job})
    finally:
        slots.release()


@app.post('/jobs', status_code=202)
def submit(body: dict, authorization: str = Header(default='')):
    secret = authorize(authorization)
    job = body.get('input') or {}
    if job.get('sourceKind') != 'stage' or not all(job.get(k) for k in ('dubId', 'jobId', 'lang', 'videoUrl', 'uploadUrl', 'callbackUrl', 'path')):
        raise HTTPException(400, 'Incomplete stage job')
    if not slots.acquire(blocking=False):
        raise HTTPException(503, 'Worker busy')
    job['secret'] = secret
    try:
        executor.submit(run, job)
    except Exception:
        slots.release()
        raise
    return {'id': job['jobId']}
