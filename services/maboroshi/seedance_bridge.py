"""Draft and complete Seedance through DeHub's shared fal account."""
from pathlib import Path
import json
import math
import shutil
import time
import requests
from media_host import upload
from providers import call
from audio_workflow import finish_preview


def resolved_prompt(folder, prompt, video_reference=False, second_reference=False):
    from mask_review import is_mesh
    folder = Path(folder)
    if video_reference:
        result = prompt + '\n@Video1 is the source edit and contains isolated vocals pitched +3 semitones. @Video2 is only the primary character visual identity reference. Use only @Video1 audio for speech timing.'
    else:
        result = prompt.replace('@Audio1', 'the audio embedded in @Video1') + '\n@Video1 contains the colored-depth composite and embedded isolated vocals pitched up three semitones, without the music bed; use its embedded audio for performance and lip synchronization. ' + ('@Image1 is the primary character reference; @Image2 is the secondary character reference.' if second_reference else '@Image1 is the only replacement character reference.')
    if is_mesh(folder):
        mode = json.loads((folder / 'workflow-mode.json').read_text()).get('mode')
        description = 'depth composite with face mesh overlay' if mode == 'depth_mesh' else 'original video with face mesh overlay'
        result = result.replace('colored-depth composite', description) + ' Remove all face mesh lines and any depth colors from the output; use them only for expression and lip motion guidance. Replace the entire original identity including hair. Preserve the exact embedded dialogue and timing.'
    return result


def submit(folder, prompt, sirio, tein=None, status=print):
    folder = Path(folder)
    from mask_review import require_approved
    require_approved(folder)
    if (folder / 'seedance-response.json').exists() or (folder / 'submission-attempted.json').exists():
        raise ValueError('This job already has a submission attempt. Resume its saved response.')
    if not (folder / 'audio-manifest.json').exists() or not (folder / 'seedance-input.mp4').is_file():
        raise ValueError('Prepare and review the input before submission.')
    prepared = folder / 'seedance-input.mp4'
    video_reference = Path(sirio).suffix.lower() in ('.mp4', '.mov', '.webm')
    urls = [upload(path) for path in [prepared, sirio] + ([tein] if tein else [])]
    payload = {'task': 'editing', 'draft': True, 'resolution': '480p', 'duration': 'auto',
               'video_urls': [urls[0]], 'image_urls': urls[1:], 'generate_audio': True}
    if video_reference:
        import av
        with av.open(str(prepared)) as source:
            seconds = float(source.duration / av.time_base)
        payload.update(task='reference', duration=str(max(4, min(30, math.ceil(seconds)))),
                       video_urls=urls[:2], image_urls=urls[2:])
    payload['prompt'] = resolved_prompt(folder, prompt, video_reference, bool(tein))
    (folder / 'seedance-request.json').write_text(json.dumps(payload, indent=2))
    (folder / 'submission-attempted.json').write_text(json.dumps({'stage': 'draft', 'attempted_at': time.time()}))
    result = call('draft', input=payload)
    (folder / 'seedance-response.json').write_text(json.dumps(result))
    ident = result.get('requestId')
    if not ident:
        raise ValueError('No generation request ID returned.')
    (folder / 'generation.json').write_text(json.dumps({'request_id': ident, 'provider': 'fal', 'prompt': payload['prompt'], 'mode': payload['task']}))
    status('Draft submitted. You can return to this project later.')
    return ident


def wait_and_finish(folder, request_id, status=print):
    folder = Path(folder)
    path = folder / ('response.json' if folder.name == 'hd' else 'seedance-response.json')
    saved = json.loads(path.read_text())
    if saved.get('provider') != 'fal':
        raise ValueError('Legacy provider request needs reconciliation.')
    for _ in range(360):
        result = call('status', request_id=request_id, status_url=saved['status_url'], response_url=saved['response_url'])
        (folder / 'provider-status.json').write_text(json.dumps(result, indent=2))
        if result.get('status') == 'COMPLETED':
            url = result.get('result')
            if not isinstance(url, str) or not url.startswith('https://'):
                raise ValueError('Result URL missing.')
            response = requests.get(url, timeout=180)
            response.raise_for_status()
            (folder / 'seedance-result.mp4').write_bytes(response.content)
            if folder.name != 'hd':
                if not result.get('draft_id'):
                    raise ValueError('Provider did not return a completable draft.')
                (folder / 'draft.json').write_text(json.dumps({'draft_id': result['draft_id'], 'completed_at': time.time()}))
            status('Restoring the entire original source audio')
            finish_preview(folder / 'seedance-result.mp4', folder)
            return
        if result.get('status') in ('FAILED', 'CANCELED'):
            raise RuntimeError('Generation failed.')
        time.sleep(10)
    raise TimeoutError('Generation pending. Its request ID is saved; do not resubmit.')


def require_draft(folder):
    folder = Path(folder)
    original = json.loads((folder / 'seedance-request.json').read_text())
    draft = json.loads((folder / 'draft.json').read_text())
    if not original.get('draft') or not (folder / 'final-preview.mp4').exists():
        raise ValueError('A completed draft is required before generating 1080p.')
    if time.time() - draft['completed_at'] > 6 * 86400:
        raise ValueError('The HD approval window has expired. Your draft remains available to download.')
    return draft['draft_id']


def submit_hd(folder):
    folder = Path(folder)
    if (folder / 'hd/response.json').exists() or (folder / 'hd/submission-attempted.json').exists():
        raise ValueError('HD already attempted. Resume its saved request.')
    draft_id = require_draft(folder)
    hd = folder / 'hd'
    hd.mkdir(exist_ok=True)
    source = hd / 'upload.mp4'
    if not source.exists():
        shutil.copy2(folder / 'upload.mp4', source)
    (hd / 'request.json').write_text(json.dumps({'draft_id': draft_id, 'resolution': '1080p'}))
    (hd / 'submission-attempted.json').write_text(json.dumps({'stage': 'hd', 'attempted_at': time.time()}))
    result = call('hd', draft_id=draft_id)
    (hd / 'response.json').write_text(json.dumps(result))
    if not result.get('requestId'):
        raise ValueError('No HD request ID returned.')
    return result['requestId']
