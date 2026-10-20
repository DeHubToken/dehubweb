"""Shot-by-shot reference edits, using the existing private jobs and payment ledger."""
import json
import math
import shutil
import time
import uuid
from fractions import Fraction
from pathlib import Path

import av
import numpy as np
from fastapi import HTTPException

import access
import mask_review

MAX_SHOTS = 8


def read(folder):
    path = Path(folder) / 'remake.json'
    return json.loads(path.read_text()) if path.exists() else None


def write(folder, value):
    path = Path(folder) / 'remake.json'
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as output:
        json.dump(value, output)
        output.flush()
        __import__('os').fsync(output.fileno())
    temporary.replace(path)


def child(folder):
    path = Path(folder) / 'remake-parent.json'
    return json.loads(path.read_text()) if path.exists() else None


def metadata(path):
    with av.open(str(path)) as media:
        stream = media.streams.video[0]
        rate = stream.average_rate or Fraction(30, 1)
        if not 12 <= float(rate) <= 60:
            raise ValueError('Use a reference between 12 and 60 frames per second.')
        seconds = float(stream.duration * stream.time_base) if stream.duration else float(media.duration / av.time_base)
        return rate, round(seconds * float(rate)), stream.width, stream.height


def scan(path):
    """Decode small scene features on the hosted worker; never invoke generation."""
    rate, count, _, _ = metadata(path)
    previous = None
    candidates = []
    with av.open(str(path)) as media:
        origin = None
        for frame in media.decode(video=0):
            at = float(frame.time or 0)
            if origin is None:
                origin = at
            index = round((at - origin) * float(rate))
            pixels = frame.reformat(width=64, height=36, format='rgb24').to_ndarray().astype(np.float32) / 255
            histogram = np.concatenate([np.histogram(pixels[:, :, channel], bins=16, range=(0, 1))[0] / (64 * 36) for channel in range(3)])
            if previous is not None:
                distance = float(np.abs(pixels - previous[0]).mean())
                change = float(np.abs(histogram - previous[1]).sum() / 6)
                if distance > .18 and change > .2 and index >= round(float(rate) * .2) and count - index >= round(float(rate) * .2):
                    candidates.append((index, distance + change))
            previous = pixels, histogram
    # Retain the strongest cut within each 0.2-second neighbourhood.
    chosen = []
    for index, score in sorted(candidates, key=lambda item: -item[1]):
        if all(abs(index - saved) >= math.ceil(float(rate) * .2) for saved in chosen):
            chosen.append(index)
    return {'fps': float(rate), 'frames': count, 'cuts': [round(index / float(rate), 4) for index in sorted(chosen)], 'maxShots': MAX_SHOTS}


def ranges(cuts, rate, frames):
    if not isinstance(cuts, list) or len(cuts) >= MAX_SHOTS:
        raise ValueError(f'Choose at most {MAX_SHOTS - 1} cuts.')
    if any(isinstance(at, bool) or not isinstance(at, (int, float)) or not math.isfinite(at) for at in cuts):
        raise ValueError('Cut times must be finite seconds.')
    indices = [0] + [round(at * float(rate)) for at in cuts] + [frames]
    minimum = math.ceil(float(rate) * .2)
    if any(end - start < minimum for start, end in zip(indices, indices[1:])):
        raise ValueError('Put cuts in increasing order, at least 0.2 seconds apart and inside the reference.')
    return list(zip(indices, indices[1:]))


def encode_range(source, destination, start, end, rate, minimum_seconds=0):
    """Use frame positions, then hold the last frame to meet the provider minimum."""
    count = max(end - start, math.ceil(minimum_seconds * float(rate)))
    with av.open(str(source)) as media, av.open(str(destination), 'w') as output:
        video = media.streams.video[0]
        stream = output.add_stream('libx264', rate=rate)
        stream.width, stream.height = video.width // 2 * 2, video.height // 2 * 2
        stream.pix_fmt = 'yuv420p'
        stream.options = {'crf': '18', 'preset': 'fast', 'threads': '1'}
        frames = iter(media.decode(video=0))
        current = next(frames, None)
        if current is None:
            raise ValueError('The selected shot has no decoded frames.')
        origin = float(current.time or 0)
        current_at = origin
        following = next(frames, None)
        tolerance = 1.5 / float(video.average_rate or rate)
        for produced in range(count):
            # Resample by timestamps: provider and reference frame rates can differ.
            target = origin + (start + min(produced, end - start - 1)) / float(rate)
            while following is not None and float(following.time or 0) <= target + .000001:
                current = following
                current_at = float(current.time or 0)
                following = next(frames, None)
            if following is None and target - current_at > tolerance:
                raise ValueError('The generated video is shorter than the required shot. Its saved render needs review.')
            # Copy before assigning timestamps; reformat can return the input frame.
            encoded = av.VideoFrame.from_ndarray(current.to_ndarray(format='rgb24'), format='rgb24').reformat(width=stream.width, height=stream.height, format='yuv420p')
            encoded.pts, encoded.time_base = produced, 1 / rate
            for packet in stream.encode(encoded):
                output.mux(packet)
        for packet in stream.encode():
            output.mux(packet)


def create_shot(parent, start, end, rate, prompt=None, previous=None):
    ident = uuid.uuid4().hex
    root = access.folder(parent['id'])
    folder = access.DATA / 'runs' / ident
    folder.mkdir(parents=True)
    try:
        encode_range(root / 'upload.mp4', folder / 'upload.mp4', start, end, rate, minimum_seconds=3)
        shutil.copy2(folder / 'upload.mp4', folder / 'seedance-input.mp4')
        (folder / 'workflow-mode.json').write_text('{"mode":"kling"}')
        info = {'parent': parent['id'], 'start': start, 'end': end, 'rate': str(rate), 'previous': previous}
        (folder / 'remake-parent.json').write_text(json.dumps(info))
        for name in (parent['reference'], parent['second_reference']):
            if name:
                shutil.copy2(root / name, folder / name)
        mask_review.review(folder, True, 'Shot derived from the approved source and reviewed cut list.', mask_review.fingerprint(folder))
        with access.database() as db:
            db.execute('INSERT INTO jobs (id,wallet,created,state,stage,status,mode,subject,seconds,renderer,prompt,reference,second_reference) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (ident, parent['wallet'], int(time.time()), 'prepared', '', 'Shot ready. Review its price before generating.',
                 parent['mode'], parent['subject'], max(math.ceil(3 * float(rate)), end - start) / float(rate), 'kling', prompt or parent['prompt'], parent['reference'], parent['second_reference']))
        return {'id': ident, 'start': start, 'end': end, 'versions': [ident]}
    except Exception:
        shutil.rmtree(folder)
        raise


def plan(row, cuts):
    folder = access.folder(row['id'])
    existing = read(folder)
    if existing and not existing.get('building'):
        raise HTTPException(409, 'This project already has a shot plan. Open its saved shots.')
    if row['renderer'] != 'kling' or row['state'] != 'prepared' or not row['reference'] or child(folder):
        raise HTTPException(409, 'Save image references and approve a Kling source before making a shot plan.')
    mask_review.require_approved(folder)
    rate, frames, width, height = metadata(folder / 'upload.mp4')
    selected = ranges(cuts, rate, frames)
    if existing and existing.get('ranges') != [list(pair) for pair in selected]:
        raise HTTPException(409, 'Resume the saved cut list before changing this interrupted plan.')
    manifest = existing or {'version': 1, 'fps': str(rate), 'frames': frames, 'width': width, 'height': height, 'shots': [], 'ranges': selected}
    # A partial plan survives a process interruption and cannot duplicate children.
    write(folder, {**manifest, 'building': True})
    for start, end in selected[len(manifest['shots']):]:
        manifest['shots'].append(create_shot(row, start, end, rate))
        write(folder, {**manifest, 'building': True})
    manifest.pop('building', None)
    write(folder, manifest)
    access.update(row['id'], state='editing', status='Shot plan saved. Generate each shot, then assemble your edit.')
    return manifest


def revise(row, index, prompt):
    folder = access.folder(row['id'])
    manifest = read(folder)
    if not manifest or manifest.get('building') or not 0 <= index < len(manifest['shots']) or not 1 <= len(prompt.strip()) <= 6000:
        raise HTTPException(400, 'Choose a saved shot and describe the revision in up to 6,000 characters.')
    selected = manifest['shots'][index]
    active = access.job(selected['id'], row['wallet'])
    failed = active['state'] == 'failed' and not (access.folder(active['id']) / 'submission-attempted.json').exists()
    if active['state'] != 'complete' and not failed:
        raise HTTPException(409, 'Complete the current shot before creating another version. An uncertain render must be reconciled first.')
    if len(selected['versions']) >= 5:
        raise HTTPException(409, 'This shot has reached its five-version limit.')
    if failed and not access.refund(active['id'], 'draft'):
        raise HTTPException(409, 'The failed shot refund needs reconciliation before a replacement can be created.')
    next_shot = create_shot(row, selected['start'], selected['end'], Fraction(manifest['fps']), prompt, selected['id'])
    selected['versions'].append(next_shot['id'])
    selected['id'] = next_shot['id']
    write(folder, manifest)
    access.update(row['id'], state='editing', status='Revision saved. Only this shot needs a new generation.')
    return manifest


def finish_shot(generated, folder):
    info = child(folder)
    # Trim the padded generation back to the exact reference frame count.
    encode_range(generated, Path(folder) / 'final-preview.mp4', 0, info['end'] - info['start'], Fraction(info['rate']))


def select_version(row, index, ident):
    folder = access.folder(row['id'])
    manifest = read(folder)
    if not manifest or manifest.get('building') or not 0 <= index < len(manifest['shots']):
        raise HTTPException(400, 'Choose a saved shot.')
    selected = manifest['shots'][index]
    if ident not in selected['versions'] or access.job(ident, row['wallet'])['state'] != 'complete':
        raise HTTPException(409, 'Choose a completed version of this shot.')
    active = access.job(selected['id'], row['wallet'])
    if active['state'] not in ('complete', 'prepared') or active['state'] == 'prepared' and access.payment_reference(active, 'draft'):
        raise HTTPException(409, 'Resolve the current paid render before switching versions.')
    selected['id'] = ident
    write(folder, manifest)
    access.update(row['id'], state='editing', status='Shot version selected. Assemble again to include it in the edit.')


def assemble(row):
    folder = access.folder(row['id'])
    manifest = read(folder)
    if not manifest or manifest.get('building'):
        raise ValueError('The shot plan is unavailable or incomplete.')
    rate = Fraction(manifest['fps'])
    paths = []
    for shot in manifest['shots']:
        saved = access.job(shot['id'], row['wallet'])
        if saved['state'] != 'complete':
            raise ValueError('Complete every shot before assembling the edit.')
        paths.append(access.folder(saved['id']) / 'final-preview.mp4')
    silent = folder / 'remake-silent.mp4'
    with av.open(str(silent), 'w') as output:
        stream = output.add_stream('libx264', rate=rate)
        stream.width, stream.height = manifest['width'] // 2 * 2, manifest['height'] // 2 * 2
        stream.pix_fmt = 'yuv420p'
        stream.options = {'crf': '18', 'preset': 'fast', 'threads': '1'}
        position = 0
        for shot, path in zip(manifest['shots'], paths):
            with av.open(str(path)) as media:
                count = 0
                for frame in media.decode(video=0):
                    if count >= shot['end'] - shot['start']:
                        break
                    encoded = frame.reformat(width=stream.width, height=stream.height, format='yuv420p')
                    encoded.pts, encoded.time_base = position, 1 / rate
                    for packet in stream.encode(encoded):
                        output.mux(packet)
                    count += 1
                    position += 1
                if count != shot['end'] - shot['start']:
                    raise ValueError('A generated shot has an incomplete frame range.')
        for packet in stream.encode():
            output.mux(packet)
    from audio_workflow import finish_preview
    temporary = folder / 'remake-assembly'
    temporary.mkdir(exist_ok=True)
    shutil.copy2(folder / 'upload.mp4', temporary / 'upload.mp4')
    result = finish_preview(silent, temporary)
    result.replace(folder / 'remake-result.mp4')
    shutil.rmtree(temporary)
    access.update(row['id'], state='edit_complete', status='Edit ready. Original shot timings and the complete original soundtrack are preserved.')


def snapshot(row):
    manifest = read(access.folder(row['id']))
    if not manifest:
        return None
    result = {key: manifest[key] for key in ('version', 'fps', 'frames', 'width', 'height')}
    result['building'] = bool(manifest.get('building'))
    result['cuts'] = [round(pair[1] / float(Fraction(manifest['fps'])), 4) for pair in manifest.get('ranges', [])[:-1]]
    result['shots'] = []
    for index, shot in enumerate(manifest['shots']):
        saved = access.job(shot['id'], row['wallet'])
        folder = access.folder(saved['id'])
        # A completed previous version remains available while its revision renders.
        versions = []
        for ident in reversed(shot['versions']):
            previous = access.job(ident, row['wallet'])
            if previous['state'] == 'complete':
                versions.append({'id': ident, 'url': access.media_url(access.folder(ident) / 'final-preview.mp4')})
        result['shots'].append({**shot, 'index': index, 'state': saved['state'], 'status': saved['status'], 'prompt': saved['prompt'],
            'seconds': (shot['end'] - shot['start']) / float(Fraction(manifest['fps'])), 'billableSeconds': math.ceil(saved['seconds']),
            'priceMicros': access.price(saved, 'draft'), 'source': access.media_url(folder / 'upload.mp4'), 'results': versions,
            'canCollect': saved['state'] == 'attention' and (folder / 'seedance-response.json').exists()})
    return result
