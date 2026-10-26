"""Authenticated hosted Maboroshi workflow, with one bounded processing worker."""
import asyncio
import json
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
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

import access
import remake
import product_import
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
        if stage == 'assemble':
            remake.assemble(row)
        elif stage == 'prepare':
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
            if row.get('renderer') == 'kling':
                from kling_bridge import submit, wait_and_finish
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
            complete = stage == 'hd' or row.get('renderer') == 'kling'
            access.update(ident, state='complete' if complete else 'draft',
                          status='Video ready with the complete original audio.' if complete else 'Draft ready with original audio. Review before approving 1080p.')
    except Exception:
        # Provider response bodies and signed URLs stay out of user-visible errors.
        log.exception('Maboroshi %s failed for %s', stage, ident)
        if stage == 'assemble':
            access.update(ident, state='editing', status='Assembly failed. Your generated shots are saved; assemble again without a generation charge.')
            return
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
    with access.database() as db:
        interrupted = db.execute("SELECT * FROM jobs WHERE state IN ('running','queued')").fetchall()
    for saved in interrupted:
        row = dict(saved)
        folder = access.folder(row['id'])
        target = folder / 'hd' if row['stage'] == 'hd' else folder
        response = target / ('response.json' if row['stage'] == 'hd' else 'seedance-response.json')
        if row['stage'] == 'assemble':
            executor.submit(run_stage, row['id'], 'assemble', True)
        elif row['stage'] != 'prepare' and response.exists():
            executor.submit(run_stage, row['id'], row['stage'], True)
        else:
            access.update(row['id'], state='attention', status='Processing was interrupted. Saved work needs review; no paid step was automatically repeated.')
    yield
    executor.shutdown(wait=False)


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['https://dehub.io'],
                   allow_methods=['GET', 'POST'], allow_headers=['x-dehub-token', 'content-type'])


@app.middleware('http')
async def headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self' https://dehub.io; frame-ancestors https://dehub.io; base-uri 'none'; form-action 'self'"
    return response


@app.get('/')
def index():
    return FileResponse(ROOT / 'static' / 'index.html')


@app.get('/setup')
def setup():
    return RedirectResponse('https://dehub.io/creator/maboroshi', status_code=308)


@app.get('/health')
def health():
    return {'service': 'maboroshi', 'ready': access.readiness(), 'modes': list(access.MODES), 'maxSeconds': 30, 'maxBytes': LIMIT,
            'remakeContract': 1, 'maxRemakeShots': remake.MAX_SHOTS}


def snapshot(row):
    folder = access.folder(row['id'])
    result = {key: row[key] for key in ('id', 'created', 'state', 'stage', 'status', 'mode', 'subject', 'seconds', 'prompt', 'renderer')}
    result['files'] = {name: access.media_url(folder / name) for name in access.FILES if (folder / name).is_file()}
    result['review'] = review_state(folder)
    result['hasReference'] = bool(row['reference'])
    result['referenceKind'] = 'video' if row['reference_seconds'] else 'image'
    result['references'] = {}
    for name, column in (('reference', 'reference'), ('second', 'second_reference')):
        if row[column] and (folder / row[column]).is_file():
            result['references'][name] = {'url': access.media_url(folder / row[column]),
                'kind': result['referenceKind'] if name == 'reference' else 'image', 'key': row[column]}
    from seedance_bridge import resolved_prompt
    if row['renderer'] == 'kling':
        from kling_bridge import resolved_prompt as kling_prompt
        result['resolvedPrompt'] = kling_prompt(row['prompt'], bool(row['second_reference'])) if row['reference'] else ''
    else:
        result['resolvedPrompt'] = resolved_prompt(folder, row['prompt'], bool(row['reference_seconds']), bool(row['second_reference'])) if row['reference'] else ''
    stages = ('draft',) if row['renderer'] == 'kling' else ('prepare', 'draft', 'hd')
    result['remake'] = remake.snapshot(row)
    result['workflow'] = 'remake' if result['remake'] or (folder / 'remake-intent.json').exists() else ''
    result['quotes'] = {stage: access.price(row, stage) for stage in stages} if not result['remake'] and access.readiness() else {}
    adjustment = folder / ('hd/duration-adjustment.json' if row['state'] == 'complete' else 'duration-adjustment.json')
    result['durationAdjustment'] = json.loads(adjustment.read_text()) if adjustment.exists() else None
    return result


@app.get('/jobs')
def list_jobs(wallet=Depends(owner)):
    with access.database() as db:
        rows = db.execute('SELECT id,created,state,status,mode,subject FROM jobs WHERE wallet=? ORDER BY created DESC LIMIT 1500', (wallet,)).fetchall()
    return {'jobs': [{**dict(row), 'workflow': 'remake' if (access.DATA / 'runs' / row['id'] / 'remake-intent.json').exists() or (access.DATA / 'runs' / row['id'] / 'remake.json').exists() else ''} for row in rows if not remake.child(access.DATA / 'runs' / row['id'])][:30]}


@app.get('/session')
def session(wallet=Depends(owner)):
    return {'wallet': wallet}


@app.post('/marketing/import-product')
def import_marketing_product(url: str = Form(..., max_length=4096), wallet=Depends(owner)):
    return product_import.import_product(url, wallet)


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
            if (not 2 <= seconds <= 30 or video.width * video.height > 3840 * 2160
                    or min(video.width, video.height) < 300 or not .4 <= video.width / video.height <= 2.5):
                raise ValueError('duration or dimensions')
            if audio and not media.streams.audio:
                raise ValueError('audio missing')
            return seconds
    except Exception:
        raise HTTPException(400, 'Use a 2–30 second video, 300 pixels per side to 4K, between 2:5 and 5:2. Include an audio track for the source.')


@app.post('/jobs', status_code=201)
def create_job(video: UploadFile = File(...), mode: str = Form('depth'), subject: str = Form('person'), renderer: str = Form('seedance'), workflow: str = Form(''), wallet=Depends(owner)):
    if renderer not in ('seedance', 'kling'):
        raise HTTPException(400, 'Choose Kling or Seedance Premium.')
    if workflow not in ('', 'remake') or workflow == 'remake' and renderer != 'kling':
        raise HTTPException(400, 'Remake uses Kling with image references.')
    if mode not in access.MODES or not 1 <= len(subject.strip()) <= 200:
        raise HTTPException(400, 'Choose a preparation mode and describe the subject in up to 200 characters.')
    with lock, access.database() as db:
        recent = db.execute('SELECT id FROM jobs WHERE wallet=? AND created>?', (wallet, int(time.time()) - 86400)).fetchall()
        count = sum(not remake.child(access.DATA / 'runs' / row['id']) for row in recent)
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
            if renderer == 'kling':
                with av.open(str(folder / 'upload.mp4')) as source:
                    stream = source.streams.video[0]
                    if not 3 <= seconds <= 15 or min(stream.width, stream.height) < 720 or Path(video.filename or '').suffix.lower() not in ('.mp4', '.mov'):
                        raise HTTPException(400, 'Kling needs a 3–15 second MP4 or MOV, at least 720 pixels on each side. Use Seedance Premium for other clips.')
                shutil.copy2(folder / 'upload.mp4', folder / 'seedance-input.mp4')
                (folder / 'workflow-mode.json').write_text(json.dumps({'mode': 'kling'}))
            if workflow == 'remake':
                (folder / 'remake-intent.json').write_text('{"version":1}')
            db.execute('INSERT INTO jobs (id,wallet,created,state,stage,status,mode,subject,seconds,renderer) VALUES (?,?,?,?,?,?,?,?,?,?)',
                (ident, wallet, int(time.time()), 'prepared' if renderer == 'kling' else 'uploaded', '',
                 'Review your source clip, then generate with Kling.' if renderer == 'kling' else 'Source saved. Review the preparation price to continue.', mode, subject.strip(), seconds, renderer))
        except Exception:
            shutil.rmtree(folder)
            raise
    return snapshot(access.job(ident, wallet))


@app.post('/jobs/{ident}/references')
def references(ident: str, prompt: str = Form(...), reference: UploadFile | None = File(None), second: UploadFile | None = File(None), wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        if remake.read(access.folder(ident)):
            raise HTTPException(409, 'References are saved with the shot plan. Revise an individual shot or start a new project for a different cast.')
        if row['state'] not in ('uploaded', 'prepared') or not 1 <= len(prompt.strip()) <= 6000:
            raise HTTPException(409, 'Character references can be changed before preparation or after the clip is ready for review. Use a prompt of up to 6,000 characters.')
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
                if row['renderer'] == 'kling' and suffix in ('.mp4', '.mov', '.webm'):
                    raise HTTPException(400, 'Kling uses image character references. Use Seedance Premium for video references.')
                name = f'reference-{index}-{uuid.uuid4().hex}{suffix}'
                target = folder / name
                saved.append(name)
                replaced.append(name)
                save_upload(upload, target)
                if suffix in ('.mp4', '.mov', '.webm'):
                    seconds = validate_video(target)
                    if seconds + row['seconds'] > 30:
                        raise HTTPException(400, 'Source and reference videos must total 30 seconds or less.')
                    from pipeline import normalize
                    normalized = target.with_suffix('.normalized.mp4')
                    replaced.append(normalized.name)
                    normalize(target, normalized)
                    saved[-1] = normalized.name
                    target.unlink()
                else:
                    if target.stat().st_size > 30 * 1024 * 1024:
                        raise HTTPException(400, 'Reference images must be 30 MB or less.')
                    with Image.open(target) as image:
                        image.verify()
                    if index == 0:
                        seconds = 0
            if not saved[0]:
                raise HTTPException(400, 'Choose a character reference.')
        except Exception as error:
            for name in replaced:
                if name:
                    (folder / name).unlink(missing_ok=True)
            if isinstance(error, HTTPException):
                raise error
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


def stage_quote(ident, stage, wallet):
    if stage not in ('prepare', 'draft', 'hd'):
        raise HTTPException(404)
    row = access.job(ident, wallet)
    if remake.read(access.folder(ident)):
        raise HTTPException(409, 'Generate the individual shots in this edit. Assembly has no generation charge.')
    parent = remake.child(access.folder(ident))
    if parent:
        project = access.job(parent['parent'], wallet)
        plan = remake.read(access.folder(project['id']))
        if not plan or plan.get('building') or project['state'] not in ('editing', 'edit_complete'):
            raise HTTPException(409, 'Finish saving the parent shot plan before generating.')
        if not any(shot['id'] == ident for shot in plan['shots']):
            raise HTTPException(409, 'Only the selected version of a shot can start a new render.')
    if row['renderer'] == 'kling' and stage != 'draft':
        raise HTTPException(400, 'Kling has one complete render and no separate preparation or HD step.')
    expected = {'prepare': 'uploaded', 'draft': 'prepared', 'hd': 'draft'}[stage]
    if row['state'] != expected:
        raise HTTPException(409, 'This step has already started or its earlier step is incomplete.')
    if not access.readiness():
        raise HTTPException(503, 'Processing is temporarily unavailable. Your source is saved; nothing has been charged.')
    amount = access.price(row, stage)
    if stage in ('draft', 'hd'):
        try:
            require_approved(access.folder(ident))
        except ValueError as error:
            raise HTTPException(409, str(error))
    if stage == 'draft' and not row['reference']:
        raise HTTPException(400, 'Save a character reference and prompt first.')
    if stage == 'hd':
        from seedance_bridge import require_draft
        try:
            require_draft(access.folder(ident))
        except (ValueError, OSError, KeyError) as error:
            raise HTTPException(409, str(error) if isinstance(error, ValueError) else 'The completed draft is unavailable.')
    with access.database() as db:
        active = db.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('queued','running')").fetchone()[0]
    if active >= 4:
        raise HTTPException(503, 'Maboroshi is busy. Try again when a current job finishes; nothing has been charged.')
    return row, amount


@app.get('/jobs/{ident}/checkout/{stage}')
def checkout(ident: str, stage: str, wallet=Depends(owner)):
    with lock:
        row, amount = stage_quote(ident, stage, wallet)
        payment = access.payment_reference(row, stage)
        if payment and payment['amount'] != amount:
            raise HTTPException(409, 'The saved payment quote needs review.')
        return {'id': ident, 'stage': stage, 'wallet': wallet, 'price_micros': amount,
                'renderer': row['renderer'],
                'payment_ref': payment['tx_hash'] if payment else None}


@app.post('/jobs/{ident}/remake/scan')
def scan_remake(ident: str, wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        if row['renderer'] != 'kling' or row['state'] != 'prepared' or remake.child(access.folder(ident)):
            raise HTTPException(409, 'Choose a saved Kling reference before scanning its cuts.')
        try:
            return remake.scan(access.folder(ident) / 'upload.mp4')
        except ValueError as error:
            raise HTTPException(400, str(error))


@app.post('/jobs/{ident}/remake/plan')
def plan_remake(ident: str, cuts: str = Form('[]'), wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        if len(cuts) > 512:
            raise HTTPException(400, 'Enter at most seven cut times.')
        if shutil.disk_usage(access.DATA).free < 5 * 1024 ** 3:
            raise HTTPException(503, 'Storage is temporarily full. Nothing has been charged.')
        try:
            remake.plan(row, json.loads(cuts))
        except (ValueError, TypeError) as error:
            raise HTTPException(400, str(error))
    return snapshot(access.job(ident, wallet))


@app.post('/jobs/{ident}/remake/revise')
def revise_remake(ident: str, shot: int = Form(...), prompt: str = Form(...), wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        if row['state'] not in ('editing', 'edit_complete'):
            raise HTTPException(409, 'Wait for assembly to finish before revising a shot.')
        remake.revise(row, shot, prompt)
    return snapshot(access.job(ident, wallet))


@app.post('/jobs/{ident}/remake/assemble')
def assemble_remake(ident: str, wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        if row['stage'] == 'assemble' and row['state'] in ('queued', 'running', 'edit_complete'):
            return snapshot(row)
        manifest = remake.read(access.folder(ident))
        if not manifest or manifest.get('building') or row['state'] != 'editing' or not manifest['shots']:
            raise HTTPException(409, 'Finish the shot plan before assembling.')
        if any(access.job(shot['id'], wallet)['state'] != 'complete' for shot in manifest['shots']):
            raise HTTPException(409, 'Complete each shot before assembling.')
        with access.database() as db:
            active = db.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('queued','running')").fetchone()[0]
        if active >= 4:
            raise HTTPException(503, 'Processing is busy. Your shots are saved; try assembly later.')
        access.update(ident, state='queued', stage='assemble', status='Assembling shots and restoring the original soundtrack.')
        executor.submit(run_stage, ident, 'assemble')
    return snapshot(access.job(ident, wallet))


@app.post('/jobs/{ident}/remake/select')
def select_remake(ident: str, shot: int = Form(...), version: str = Form(...), wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        if row['state'] not in ('editing', 'edit_complete'):
            raise HTTPException(409, 'Wait for assembly to finish before switching shot versions.')
        remake.select_version(row, shot, version)
    return snapshot(access.job(ident, wallet))


@app.post('/jobs/{ident}/remake/collect')
def collect_remake(ident: str, shot: int = Form(...), wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        plan = remake.read(access.folder(ident))
        if not plan or plan.get('building') or not 0 <= shot < len(plan['shots']):
            raise HTTPException(400, 'Choose a saved shot.')
        saved = access.job(plan['shots'][shot]['id'], wallet)
        response = access.folder(saved['id']) / 'seedance-response.json'
        if saved['state'] != 'attention' or not response.exists() or not json.loads(response.read_text()).get('requestId'):
            raise HTTPException(409, 'No confirmed provider request is available to collect. The submission needs reconciliation.')
        with access.database() as db:
            active = db.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('queued','running')").fetchone()[0]
        if active >= 4:
            raise HTTPException(503, 'Processing is busy. Try collecting this saved render later.')
        access.update(saved['id'], state='queued', status='Collecting the existing render. No new generation will be submitted.')
        executor.submit(run_stage, saved['id'], 'draft', True)
    return snapshot(access.job(ident, wallet))


@app.post('/jobs/{ident}/{stage}')
def start_stage(ident: str, stage: str, price_micros: int = Form(...), tx_hash: str = Form('credits'), wallet=Depends(owner)):
    with lock:
        row = access.job(ident, wallet)
        if row['stage'] == stage and row['state'] in ('queued', 'running', 'draft', 'complete'):
            payment = access.payment_reference(row, stage)
            return {**snapshot(row), 'payment_ref': payment['tx_hash'] if payment else 'credits'}
        row, amount = stage_quote(ident, stage, wallet)
        if amount != price_micros:
            raise HTTPException(409, 'The price changed. Refresh and review the new quote.')
        access.debit(row, stage, amount, tx_hash)
        access.update(ident, state='queued', stage=stage, price=amount, status='Queued for processing. You can return to this job later.')
        executor.submit(run_stage, ident, stage)
    return {**snapshot(access.job(ident, wallet)), 'payment_ref': tx_hash.lower()}


@app.get('/media/{relative:path}')
def media(relative: str, expires: int, signature: str):
    return FileResponse(access.resolve_media(relative, expires, signature))


app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')
