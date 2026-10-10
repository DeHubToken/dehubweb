"""Private job storage, short-lived file links and keyed DeHub credit charges."""
import hashlib
import hmac
import json
import math
import os
import re
import sqlite3
import time
from pathlib import Path
from urllib.parse import quote

import requests
from fastapi import HTTPException

DATA = Path(os.environ.get('MABOROSHI_DATA', '/var/lib/dehub-maboroshi'))
SETTINGS = DATA / 'provider-settings.json'
if SETTINGS.exists():
    for key, value in json.loads(SETTINGS.read_text()).items():
        if key in ('REPLICATE_API_TOKEN', 'ENHANCOR_API_KEY'):
            os.environ[key] = value
PUBLIC = os.environ.get('MABOROSHI_PUBLIC_URL', 'https://live.dehub.io/maboroshi').rstrip('/')
MODES = ('depth', 'face_mesh', 'depth_mesh')
FILES = ('upload.mp4', 'original.mp4', 'depth.mp4', 'mask.mp4', 'composite-silent.mp4',
         'seedance-input.mp4', 'final-preview.mp4', 'hd/final-preview.mp4',
         'vocals.wav', 'vocals-plus3.wav', 'music.wav')


def database():
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA / 'jobs.sqlite', timeout=20)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('''CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, wallet TEXT NOT NULL, created INTEGER NOT NULL,
        state TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL,
        mode TEXT NOT NULL, subject TEXT NOT NULL, seconds REAL NOT NULL,
        prompt TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '',
        second_reference TEXT NOT NULL DEFAULT '', reference_seconds REAL NOT NULL DEFAULT 0,
        price INTEGER NOT NULL DEFAULT 0)''')
    return db


def identity(token):
    if not token or len(token) > 8192:
        raise HTTPException(401, 'Sign in to DeHub to use Maboroshi.')
    try:
        response = requests.get('https://api.dehub.io/api/auth/verify',
                                headers={'Authorization': 'Bearer ' + token}, timeout=12)
        if response.status_code in (400, 401, 403):
            raise HTTPException(401, 'Your session expired. Sign in again.')
        response.raise_for_status()
        wallet = str(response.json().get('address', '')).lower()
        if not re.fullmatch(r'0x[a-f0-9]{40}', wallet):
            raise ValueError('Invalid identity')
        return wallet
    except (requests.RequestException, ValueError):
        raise HTTPException(503, 'Sign-in verification is temporarily unavailable.')


def job(ident, wallet=None):
    if not re.fullmatch(r'[a-f0-9]{32}', ident):
        raise HTTPException(404, 'Job not found.')
    with database() as db:
        row = db.execute('SELECT * FROM jobs WHERE id=?', (ident,)).fetchone()
    if row is None or (wallet is not None and row['wallet'] != wallet):
        raise HTTPException(404, 'Job not found.')
    return dict(row)


def update(ident, **values):
    allowed = {'state', 'stage', 'status', 'prompt', 'reference', 'second_reference', 'reference_seconds', 'price'}
    if not values or set(values) - allowed:
        raise ValueError('Invalid job update')
    with database() as db:
        db.execute('UPDATE jobs SET ' + ','.join(key + '=?' for key in values) + ' WHERE id=?',
                   (*values.values(), ident))


def folder(ident):
    job(ident)
    return DATA / 'runs' / ident


def signature(relative, expires):
    secret = os.environ.get('MABOROSHI_MEDIA_SECRET', '')
    if len(secret) < 32:
        raise HTTPException(503, 'Media access is not configured.')
    return hmac.new(secret.encode(), f'{relative}\n{expires}'.encode(), hashlib.sha256).hexdigest()


def media_url(path, lifetime=3600):
    relative = Path(path).resolve().relative_to((DATA / 'runs').resolve()).as_posix()
    expires = int(time.time()) + lifetime
    return f'{PUBLIC}/media/{quote(relative, safe="/")}?expires={expires}&signature={signature(relative, expires)}'


def resolve_media(relative, expires, supplied):
    root = (DATA / 'runs').resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file() or expires < time.time() or expires > time.time() + 21660:
        raise HTTPException(404, 'File link expired or unavailable.')
    if not hmac.compare_digest(signature(relative, expires), supplied):
        raise HTTPException(404, 'File link expired or unavailable.')
    return path


def readiness():
    required = ('REPLICATE_API_TOKEN', 'ENHANCOR_API_KEY', 'INTERNAL_SERVICE_SECRET',
                'MABOROSHI_MEDIA_SECRET', 'MABOROSHI_PREPARE_MICROS',
                'MABOROSHI_DRAFT_MICROS_PER_SECOND', 'MABOROSHI_HD_MICROS_PER_SECOND')
    return all(os.environ.get(key) for key in required)


def price(row, stage):
    try:
        if stage == 'prepare':
            result = int(os.environ['MABOROSHI_PREPARE_MICROS'])
        else:
            rate = int(os.environ['MABOROSHI_' + stage.upper() + '_MICROS_PER_SECOND'])
            result = math.ceil(max(4, row['seconds']) + row['reference_seconds']) * rate
        if result <= 0 or result > 100_000_000:
            raise ValueError('Invalid configured price')
        return result
    except (KeyError, ValueError):
        raise HTTPException(503, 'Maboroshi pricing is being configured. Nothing has been charged.')


def debit(row, stage, amount):
    key = f'maboroshi:{row["id"]}:{stage}'
    try:
        response = requests.post('https://api.dehub.io/api/internal/credits/debit',
            headers={'x-internal-secret': os.environ['INTERNAL_SERVICE_SECRET']},
            json={'address': row['wallet'], 'usdMicros': amount, 'key': key, 'purpose': 'ai'}, timeout=15)
        if response.status_code == 402:
            raise HTTPException(402, 'Insufficient DeHub credit. Top up, then try again.')
        response.raise_for_status()
        if response.json().get('debited') is not True:
            raise ValueError('Debit unconfirmed')
    except (requests.RequestException, ValueError, KeyError):
        raise HTTPException(503, 'Payment could not be confirmed. Retry uses the same payment reference.')


def refund(ident, stage):
    try:
        response = requests.post('https://api.dehub.io/api/internal/credits/refund',
            headers={'x-internal-secret': os.environ['INTERNAL_SERVICE_SECRET']},
            json={'key': f'maboroshi:{ident}:{stage}'}, timeout=15)
        return response.status_code in (200, 404)
    except (requests.RequestException, KeyError):
        return False
