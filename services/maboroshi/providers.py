"""Use DeHub's existing provider accounts through the private Edge bridge."""
import json
import os
import time
from pathlib import Path

import requests

BRIDGE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/maboroshi-provider'
_health = (0, False)


def call(operation, **values):
    response = requests.post(BRIDGE,
        headers={'x-internal-secret': os.environ['INTERNAL_SERVICE_SECRET']},
        json={'operation': operation, **values}, timeout=90)
    # Do not include provider bodies, tokens, or signed input URLs in exceptions.
    if not response.ok:
        raise RuntimeError(f'DeHub processing service returned {response.status_code}.')
    return response.json()


def ready():
    global _health
    if time.monotonic() - _health[0] > 60:
        try:
            value = call('health').get('ready') is True
        except (requests.RequestException, RuntimeError, KeyError, ValueError):
            value = False
        _health = (time.monotonic(), value)
    return _health[1]


def prediction(kind, path, folder, prompt='person'):
    from media_host import upload
    folder = Path(folder)
    record = folder / f'{kind}-prediction.json'
    attempt = folder / f'{kind}-attempted.json'
    if record.exists():
        result = json.loads(record.read_text())
    else:
        if attempt.exists():
            raise ValueError('An unconfirmed preparation request needs reconciliation.')
        url = upload(path)
        attempt.write_text(json.dumps({'attempted_at': time.time()}))
        result = call('prepare', kind=kind, media=url, prompt=prompt)
        record.write_text(json.dumps(result))
    for _ in range(180):
        if result['status'] in ('succeeded', 'failed', 'canceled'):
            break
        time.sleep(5)
        result = call('prediction', request_id=result['id'])
        record.write_text(json.dumps(result))
    if result['status'] != 'succeeded':
        raise RuntimeError(f'{kind} preparation did not complete.')
    return result
