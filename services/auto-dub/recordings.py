"""Convert stage audio to indexed AAC/M4A for browsers, AVPlayer and media3."""
import json
import os
import subprocess
import tempfile
from urllib.parse import urlparse

import requests


def convert(job):
    for key in ('sourceUrl', 'uploadUrl'):
        if urlparse(job.get(key, '')).scheme != 'https':
            raise ValueError('HTTPS media URLs required')
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = os.path.join(tmp, 'source'), os.path.join(tmp, 'recording.m4a')
        with requests.get(job['sourceUrl'], stream=True, timeout=60) as response:
            response.raise_for_status()
            size = 0
            with open(src, 'wb') as output:
                for chunk in response.iter_content(1 << 20):
                    size += len(chunk)
                    if size > 500 * 1024 * 1024:
                        raise ValueError('Recording exceeds download limit')
                    output.write(chunk)
        source_probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                       '-of', 'json', src], check=True, capture_output=True, text=True)
        duration = float(json.loads(source_probe.stdout)['format'].get('duration', 0))
        if duration > 14400:
            raise ValueError('Recording exceeds duration limit')
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-map', '0:a:0',
                        '-vn', '-c:a', 'aac', '-b:a', '96k',
                        '-movflags', '+faststart', dst], check=True, timeout=180,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                '-of', 'json', dst], check=True, capture_output=True, text=True)
        duration = float(json.loads(probe.stdout)['format']['duration'])
        with open(dst, 'rb') as audio:
            response = requests.put(job['uploadUrl'], data=audio,
                                    headers={'Content-Type': 'audio/mp4', 'x-upsert': 'true'}, timeout=60)
            response.raise_for_status()
        return {'ok': True, 'durationSeconds': duration}
