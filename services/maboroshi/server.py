"""Authenticated hosted Maboroshi workflow, with one bounded processing worker."""
import asyncio
import json
import hmac
import logging
import os
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

import av
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image

import access
from mask_review import state as review_state, review, require_approved

ROOT = Path(__file__).resolve().parent
LIMIT = 100 * 1024 * 1024
lock = threading.RLock()
executor = ThreadPoolExecutor(max_workers=1)
log = logging.getLogger('maboroshi')


def owner(x_dehub_token: str = Header(default='')):
    return access.identity(x_dehub_token)


def run_stage(ident, stage, resume=False):
    row = access.job(ident)
    folder = access.folder(ident)
    access.update(ident, state='running')
    progress = lambda text: access.update(ident, status=text)
    try:
        if stage == 'prepare':
            if row['mode'] == 'depth':
                from pipeline import run
                run(folder / 'upload.mp4', folder, row['subject'], 'replicate', progress)
            elif row['mode'] == 'face_mesh':
                from face_mesh import run
                run(folder / 'upload.mp4', folder, progress)
            else:
                from face_mesh import run_depth
                run_depth(folder / 'upload.mp4', folder, row['subject'], 'replicate', progress)
            access.update(ident, state='prepared', status='Prepared input ready. Review the full clip before generating.')
        else:
            from seedance_bridge import submit, submit_hd, wait_and_finish
            target = folder / 'hd' if stage == 'hd' else folder
            response_path = target / ('response.json' if stage == 'hd' else 'seedance-response.json')
            if resume:
                request_id = json.loads(response_path.read_text())['requestId']
            elif stage == 'draft':
                request_id = submit(folder, row['prompt'], folder / row['reference'],
                                    folder / row['second_reference'] if row['second_reference'] else None, progress)
            else:
                request_id = submit_hd(folder)
            wait_and_finish(target, request_id, progress)
            access.update(ident, state='complete' if stage == 'hd' else 'draft',
                          status='1080p ready with original audio.' if stage == 'hd' else 'Draft ready with original audio. Review before approving 1080p.')
    except Exception:
        # Provider response bodies and signed URLs stay out of user-visible errors.
        log.exception('Maboroshi %s failed for %s', stage, ident)
        target = folder / 'hd' if stage == 'hd' else folder
        response_path = target / ('response.json' if stage == 'hd' else 'seedance-response.json')
        submitted = response_path.exists() or (target / 'submission-attempted.json').exists()
        if submitted:
            access.update(ident, state='attention', status='Generation needs attention. Its payment and submission references are saved; no duplicate request will be sent.')
        else:
            refunded = access.refund(ident, stage)
            access.update(ident, state='failed', status='Processing failed. ' +
                ('This step has been refunded.' if refunded else 'The refund needs attention. Your payment reference is saved.'))


@asynccontextmanager
async def lifespan(app):
    os.environ['ENHANCOR_WEBHOOK_URL'] = access.PUBLIC + '/callback'
    with access.database() as db:
        interrupted = db.execute("SELECT * FROM jobs WHERE state IN ('running','queued')").fetchall()
    for saved in interrupted:
        row = dict(saved)
        folder = access.folder(row['id'])
        target = folder / 'hd' if row['stage'] == 'hd' else folder
        response = target / ('response.json' if row['stage'] == 'hd' else 'seedance-response.json')
        if row['stage'] != 'prepare' and response.exists():
            executor.submit(run_stage, row['id'], row['stage'], True)
        else:
            access.update(row['id'], state='attention', status='Processing was interrupted. Saved work needs review; no paid step was automatically repeated.')
    yield
    executor.shutdown(wait=False)


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.middleware('http')
async def headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors https://dehub.io; base-uri 'none'; form-action 'self'"
    return response


@app.get('/')
def index():
    return FileResponse(ROOT / 'static' / 'index.html')


@app.get('/setup')
def setup():
    return FileResponse(ROOT / 'static' / 'setup.html')


@app.post('/configure')
def configure(replicate: str = Form(...), enhancor: str = Form(...), x_setup_token: str = Header(default='')):
    with lock:
        expected = os.environ.get('MABOROSHI_SETUP_TOKEN', '')
        if (not expected or not hmac.compare_digest(expected, x_setup_token)
                or time.time() > int(os.environ.get('MABOROSHI_SETUP_EXPIRES', '0'))
                or (access.DATA / 'setup-consumed').exists()):
            raise HTTPException(403, 'This setup link has expired or has already been used.')
        if any(not 20 <= len(value.strip()) <= 500 or any(char.isspace() for char in value.strip()) for value in (replicate, enhancor)):
            raise HTTPException(400, 'Enter both provider keys without spaces.')
        values = {'REPLICATE_API_TOKEN': replicate.strip(), 'ENHANCOR_API_KEY': enhancor.strip()}
        access.DATA.mkdir(parents=True, exist_ok=True)
        temporary = access.SETTINGS.with_suffix('.tmp')
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, 'w') as output:
            json.dump(values, output)
        temporary.replace(access.SETTINGS)
        (access.DATA / 'setup-consumed').touch(mode=0o600)
        os.environ.update(values)
    return {'configured': True}


@app.get('/health')
def health():
    return {'service': 'maboroshi', 'ready': access.readiness(), 'modes': list(access.MODES), 'maxSeconds': 30, 'maxBytes': LIMIT}


@app.post('/callback')
def callback():
    # Acknowledgement only; the provider status API remains authoritative.
    return Response(status_code=204)


def snapshot(row):
    folder = access.folder(row['id'])
    result = {key: row[key] for key in ('id', 'created', 'state', 'stage', 'status', 'mode', 'subject', 'seconds', 'prompt')}
    result['files'] = {name: access.media_url(folder / name) for name in access.FILES if (folder / name).is_file()}
    result['review'] = review_state(folder)
    result['hasReference'] = bool(row['reference'])
    result['referenceKind'] = 'video' if row['reference_seconds'] else 'image'
    from seedance_bridge import resolved_prompt
    result['resolvedPrompt'] = resolved_prompt(folder, row['prompt'], bool(row['reference_seconds']), bool(row['second_reference'])) if row['reference'] else ''
    result['quotes'] = {stage: access.price(row, stage) for stage in ('prepare', 'draft', 'hd')} if access.readiness() else {}
    adjustment = folder / ('hd/duration-adjustment.json' if row['state'] == 'complete' else 'duration-adjustment.json')
    result['durationAdjustment'] = json.loads(adjustment.read_text()) if adjustment.exists() else None
    return result


@app.get('/jobs')
def list_jobs(wallet=Depends(owner)):
    with access.database() as db:
        rows = db.execute('SELECT id,created,state,status,mode FROM jobs WHERE wallet=? ORDER BY created DESC LIMIT 30', (wallet,)).fetchall()
    return {'jobs': [dict(row) for row in rows]}


@app.get('/jobs/{ident}')
def get_job(ident: str, wallet=Depends(owner)):
    return snapshot(access.job(ident, wallet))


def save_upload(upload, path):
    total = 0
    with path.open('wb') as output:
        while chunk := upload.file.read(1024 * 1024):
            total += len(chunk)
            if total > LIMIT:
                path.unlink(missing_ok=True)
                raise HTTPException(413, 'Choose a file smaller than 100 MB.')
            output.write(chunk)
    if total == 0:
        path.unlink(missing_ok=True)
        raise HTTPException(400, 'The selected file is empty.')


def validate_video(path, audio=False):
    try:
        with path.open('rb') as stream:
            header = stream.read(12)
        if header[4:8] != b'ftyp' and header[:4] != b'\x1a\x45\xdf\xa3':
            raise ValueError('Unsupported container')
        with av.open(str(path), options={'protocol_whitelist': 'file'}) as media:
            video = media.streams.video[0]
            seconds = float(video.duration * video.time_base) if video.duration else float(media.duration / av.time_base)
            if not 0.5 <= seconds <= 30 or video.width * video.height > 3840 * 2160:
                raise ValueError('duration or dimensions')
            if audio and not media.streams.audio:
                raise ValueError('audio missing')
            return seconds
    except Exception:
        raise HTTPException(400, 'Use a video from 0.5 to 30 seconds, at most 4K, with an audio track for the source.')


@app.post('/jobs', status_code=201)
def create_job(video: UploadFile = File(...), mode: str = Form('depth'), subject: str = Form('person'), wallet=Depends(owner)):
    if mode not in access.MODES or not 1 <= len(subject.strip()) <= 200:
        raise HTTPException(400, 'Choose a preparation mode and describe the subject in up to 200 characters.')
    with lock, access.database() as db:
        count = db.execute('SELECT COUNT(*) FROM jobs WHERE wallet=? AND created>?', (wallet, int(time.time()) - 86400)).fetchone()[0]
        if count >= 10:
            raise HTTPException(429, 'You can upload up to ten Maboroshi clips per day.')
        if shutil.disk_usage(access.DATA).free < 5 * 1024 ** 3:
            raise HTTPException(503, 'Maboroshi storage is temporarily full.')
        ident = uuid.uuid4().hex
        folder = access.DATA / 'runs' / ident
        folder.mkdir(parents=True)
        try:
            save_upload(video, folder / 'upload.mp4')
            seconds = validate_video(folder / 'upload.mp4', audio=True)
            db.execute('INSERT INTO jobs (id,wallet,created,state,stage,status,mode,subject,seconds) VALUES (?,?,?,?,?,?,?,?,?)',
                (ident, wallet, int(time.time()), 'uploaded', '', 'Source saved. Review the preparation price to continue.', mode, subject.strip(), seconds))
        except Exception:
            shutil.rmtree(folder)
            raise
    return snapshot(access.job(ident, wallet))


@app.post('/jobs/{ident}/references')
def references(ident: str, prompt: str = Form(...), reference: UploadFile | None = File(None), second: UploadFile | None = File(None), wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        if row['state'] != 'prepared' or not 1 <= len(prompt.strip()) <= 6000:
            raise HTTPException(409, 'Prepare the clip first, then enter a prompt of up to 6,000 characters.')
        folder = access.folder(ident)
        saved = []
        seconds = row['reference_seconds']
        replaced = []
        try:
            for index, upload in enumerate((reference, second)):
                if upload is None or not upload.filename:
                    saved.append(row['reference'] if index == 0 else row['second_reference'])
                    continue
                suffix = Path(upload.filename).suffix.lower()
                allowed = ('.png', '.jpg', '.jpeg', '.webp') + (('.mp4', '.mov', '.webm') if index == 0 else ())
                if suffix not in allowed:
                    raise HTTPException(400, 'Choose a PNG, JPG or WebP reference; the first reference can also be a video.')
                name = f'reference-{index}-{uuid.uuid4().hex}{suffix}'
                target = folder / name
                saved.append(name)
                replaced.append(name)
                save_upload(upload, target)
                if suffix in ('.mp4', '.mov', '.webm'):
                    seconds = validate_video(target)
                else:
                    with Image.open(target) as image:
                        image.verify()
                    if index == 0:
                        seconds = 0
            if not saved[0]:
                raise HTTPException(400, 'Choose a character reference.')
        except Exception:
            for name in replaced:
                if name:
                    (folder / name).unlink(missing_ok=True)
            raise HTTPException(400, 'A reference could not be read. Choose a valid image or video within the upload limits.')
        access.update(ident, prompt=prompt.strip(), reference=saved[0], second_reference=saved[1], reference_seconds=seconds)
        for name in (row['reference'], row['second_reference']):
            if name and name not in saved:
                (folder / name).unlink(missing_ok=True)
    return snapshot(access.job(ident, wallet))


@app.post('/jobs/{ident}/review')
def save_review(ident: str, approved: bool = Form(...), fingerprint: str = Form(...), wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        if row['state'] != 'prepared':
            raise HTTPException(409, 'Wait for preparation to complete.')
        try:
            review(access.folder(ident), approved, 'Full clip approved by its creator.' if approved else 'Input needs correction.', fingerprint)
        except ValueError as error:
            raise HTTPException(409, str(error))
    return snapshot(access.job(ident, wallet))


@app.post('/jobs/{ident}/{stage}')
def start_stage(ident: str, stage: str, price_micros: int = Form(...), wallet=Depends(owner)):
    if stage not in ('prepare', 'draft', 'hd'):
        raise HTTPException(404)
    with lock:
        row = access.job(ident, wallet)
        if row['stage'] == stage and row['state'] in ('queued', 'running', 'draft', 'complete'):
            return snapshot(row)
        expected = {'prepare': 'uploaded', 'draft': 'prepared', 'hd': 'draft'}[stage]
        if row['state'] != expected:
            raise HTTPException(409, 'This step has already started or its earlier step is incomplete.')
        if not access.readiness():
            raise HTTPException(503, 'Maboroshi generation is being connected. Your source is saved; nothing has been charged.')
        amount = access.price(row, stage)
        if amount != price_micros:
            raise HTTPException(409, 'The price changed. Refresh and review the new quote.')
        if stage in ('draft', 'hd'):
            try:
                require_approved(access.folder(ident))
            except ValueError as error:
                raise HTTPException(409, str(error))
        if stage == 'draft' and not row['reference']:
            raise HTTPException(400, 'Save a character reference and prompt first.')
        with access.database() as db:
            active = db.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('queued','running')").fetchone()[0]
        if active >= 4:
            raise HTTPException(503, 'Maboroshi is busy. Try again when a current job finishes; nothing has been charged.')
        access.debit(row, stage, amount)
        access.update(ident, state='queued', stage=stage, price=amount, status='Queued for processing. You can return to this job later.')
        executor.submit(run_stage, ident, stage)
    return snapshot(access.job(ident, wallet))


@app.get('/media/{relative:path}')
def media(relative: str, expires: int, signature: str):
    return FileResponse(access.resolve_media(relative, expires, signature))


app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')
