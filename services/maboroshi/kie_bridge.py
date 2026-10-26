"""One-pass 720p recasts on kie: Seedance 2.5 and Wan 3.0, with the original audio mix."""
import json
import math
import time
from fractions import Fraction
from pathlib import Path

import av
import numpy as np
import requests
from PIL import Image

from providers import ProviderFailed, call
from media_host import upload
from mask_review import require_approved
from audio_workflow import finish_preview

# Renderer name -> provider model. kie bills these on input plus output seconds.
MODELS = {'seedance-direct': 'seedance', 'wan': 'wan'}
LABELS = {'seedance-direct': 'Seedance 720p', 'wan': 'Wan 3.0'}
# kie's Seedance reference video must be 409,600-927,408 pixels; aim between.
AREA = 640 * 1000


def resolved_prompt(prompt, second=False):
    return prompt + '\n@Video1 is the original scene. @Image1 is the replacement character.' + (
        ' @Image2 is the second replacement character.' if second else '') + (
        ' Edit @Video1: replace only that subject with the character, keeping the original motion, camera, timing, framing,'
        ' background and lip movement. Do not add speech or music.')


def provider_input(source, target):
    """A 24 fps, silent H.264 copy sized for kie's reference-video limits."""
    with av.open(str(source)) as inp:
        stream = inp.streams.video[0]
        seconds = float(stream.duration * stream.time_base) if stream.duration else float(inp.duration / av.time_base)
        scale = math.sqrt(AREA / (stream.width * stream.height))
        width, height = max(2, int(stream.width * scale) // 2 * 2), max(2, int(stream.height * scale) // 2 * 2)
        out = av.open(str(target), 'w')
        video = out.add_stream('libx264', rate=24)
        video.width, video.height, video.pix_fmt = width, height, 'yuv420p'
        video.options = {'crf': '18', 'preset': 'fast'}
        frames = inp.decode(video=0)
        current = next(frames)
        start = float(current.time or 0)
        following = next(frames, None)
        for index in range(round(seconds * 24)):
            moment = start + index / 24
            while following is not None and float(following.time) <= moment:
                current, following = following, next(frames, None)
            frame = av.VideoFrame.from_ndarray(np.asarray(current.to_image().resize((width, height), Image.Resampling.LANCZOS)), format='rgb24')
            frame.pts, frame.time_base = index, Fraction(1, 24)
            for packet in video.encode(frame):
                out.mux(packet)
        for packet in video.encode():
            out.mux(packet)
        out.close()
    return seconds


def fit_duration(generated, source, target):
    """Hold or cut the final frame so the render spans the source exactly; audio is restored afterwards."""
    with av.open(str(source)) as probe:
        seconds = float(probe.duration / av.time_base)
    with av.open(str(generated)) as inp, av.open(str(target), 'w') as out:
        stream = inp.streams.video[0]
        rate = stream.average_rate or Fraction(24, 1)
        video = out.add_stream('libx264', rate=rate)
        video.width, video.height, video.pix_fmt = stream.width, stream.height, 'yuv420p'
        video.options = {'crf': '18'}
        frames = inp.decode(video=0)
        last = None
        for index in range(round(seconds * float(rate))):
            last = next(frames, last)
            if last is None:
                raise ValueError('Generated video has no frames.')
            frame = av.VideoFrame.from_ndarray(last.to_ndarray(format='rgb24'), format='rgb24')
            frame.pts, frame.time_base = index, 1 / rate
            for packet in video.encode(frame):
                out.mux(packet)
        for packet in video.encode():
            out.mux(packet)
    return target


def submit(folder, prompt, reference, second=None, status=print, renderer='wan'):
    folder = Path(folder)
    require_approved(folder)
    if (folder / 'seedance-response.json').exists() or (folder / 'submission-attempted.json').exists():
        raise ValueError('This job already has a submission attempt. Resume its saved response.')
    if Path(reference).suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
        raise ValueError(f'{LABELS[renderer]} requires an image character reference.')
    status('Preparing the source for rendering')
    seconds = provider_input(folder / 'upload.mp4', folder / 'kie-input.mp4')
    payload = {'prompt': resolved_prompt(prompt, bool(second)), 'video_url': upload(folder / 'kie-input.mp4'),
               'image_urls': [upload(path) for path in [reference] + ([second] if second else [])],
               'duration': max(4 if renderer == 'seedance-direct' else 2, math.ceil(seconds - .05))}
    (folder / 'seedance-request.json').write_text(json.dumps({**payload, 'model': MODELS[renderer]}))
    (folder / 'submission-attempted.json').write_text(json.dumps({'stage': 'draft', 'renderer': renderer, 'attempted_at': time.time()}))
    result = call('kie', model=MODELS[renderer], input=payload)
    (folder / 'seedance-response.json').write_text(json.dumps(result))
    if not result.get('requestId'):
        raise ValueError('No generation request ID returned.')
    status(f'{LABELS[renderer]} submitted. Your project is saved; no separate HD purchase is needed.')
    return result['requestId']


def wait_and_finish(folder, request_id, status=print):
    folder = Path(folder)
    for _ in range(540):
        result = call('kie_status', request_id=request_id)
        (folder / 'provider-status.json').write_text(json.dumps(result))
        if result.get('status') == 'COMPLETED':
            url = result.get('result')
            if not isinstance(url, str) or not url.startswith('https://'):
                raise ValueError('Result URL missing.')
            response = requests.get(url, timeout=180)
            response.raise_for_status()
            generated = folder / 'kie-result.mp4'
            generated.write_bytes(response.content)
            status('Restoring the complete original soundtrack')
            finish_preview(fit_duration(generated, folder / 'upload.mp4', folder / 'kie-fitted.mp4'), folder)
            return
        if result.get('status') == 'FAILED':
            # kie charges nothing for a failed task, so the stage is refunded.
            raise ProviderFailed('Generation failed.')
        time.sleep(10)
    raise TimeoutError('Generation pending. Its request ID is saved; do not resubmit.')
