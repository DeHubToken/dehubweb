"""Single-pass Kling edits with durable submissions and the original audio mix."""
import json
import time
from pathlib import Path

import requests

from providers import call
from media_host import upload
from mask_review import require_approved
from audio_workflow import finish_preview


def resolved_prompt(prompt, second=False):
    return prompt + '\n@Video1 is the original scene. @Image1 is the replacement character.' + (
        ' @Image2 is the second replacement character.' if second else '') + (
        ' Preserve the original motion, camera, timing, background and dialogue. Do not add speech or music.')


def submit(folder, prompt, reference, second=None, status=print):
    folder = Path(folder)
    require_approved(folder)
    if (folder / 'seedance-response.json').exists() or (folder / 'submission-attempted.json').exists():
        raise ValueError('This job already has a submission attempt. Resume its saved response.')
    if Path(reference).suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
        raise ValueError('Kling requires an image character reference.')
    payload = {'prompt': resolved_prompt(prompt, bool(second)), 'video_url': upload(folder / 'upload.mp4'),
               'image_urls': [upload(path) for path in [reference] + ([second] if second else [])], 'keep_audio': True}
    (folder / 'seedance-request.json').write_text(json.dumps(payload))
    (folder / 'submission-attempted.json').write_text(json.dumps({'stage': 'draft', 'renderer': 'kling', 'attempted_at': time.time()}))
    result = call('kling', input=payload)
    (folder / 'seedance-response.json').write_text(json.dumps(result))
    if not result.get('requestId'):
        raise ValueError('No generation request ID returned.')
    status('Kling submitted. Your project is saved; no separate HD purchase is needed.')
    return result['requestId']


def wait_and_finish(folder, request_id, status=print):
    folder = Path(folder)
    saved = json.loads((folder / 'seedance-response.json').read_text())
    for _ in range(360):
        result = call('status', request_id=request_id, status_url=saved['status_url'], response_url=saved['response_url'])
        (folder / 'provider-status.json').write_text(json.dumps(result))
        if result.get('status') == 'COMPLETED':
            url = result.get('result')
            if not isinstance(url, str) or not url.startswith('https://'):
                raise ValueError('Result URL missing.')
            response = requests.get(url, timeout=180)
            response.raise_for_status()
            generated = folder / 'kling-result.mp4'
            generated.write_bytes(response.content)
            status('Restoring the complete original soundtrack')
            from remake import child, finish_shot
            if child(folder):
                finish_shot(generated, folder)
            else:
                finish_preview(generated, folder)
            return
        if result.get('status') in ('FAILED', 'CANCELED'):
            raise RuntimeError('Generation failed.')
        time.sleep(10)
    raise TimeoutError('Generation pending. Its request ID is saved; do not resubmit.')
