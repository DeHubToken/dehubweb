"""Install one reviewed release on DeHub's existing Linux host."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import time
import urllib.request


def run(*args):
    subprocess.run(args, check=True)


def install(revision):
    if os.geteuid() != 0 or not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise SystemExit('Run as root with the merged 40-character revision.')
    release = Path(__file__).resolve().parent
    base = Path('/srv/dehub-maboroshi')
    if release != base / 'releases' / revision:
        raise SystemExit('Extract the reviewed archive under /srv/dehub-maboroshi/releases/REVISION first.')
    subprocess.run(['id', 'dehub-maboroshi'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0 or run('useradd', '--system', '--home', '/var/lib/dehub-maboroshi', '--shell', '/usr/sbin/nologin', 'dehub-maboroshi')
    run('apt-get', 'update', '-qq')
    run('apt-get', 'install', '-y', '-qq', 'python3.12-venv', 'rubberband-cli')
    for env in ('venv', 'mesh-venv'):
        if not (base / env / 'bin/python').exists():
            run('python3.12', '-m', 'venv', str(base / env))
    run(str(base / 'venv/bin/pip'), 'install', '--disable-pip-version-check', '-r', str(release / 'requirements.txt'))
    run(str(base / 'mesh-venv/bin/pip'), 'install', '--disable-pip-version-check', 'mediapipe==0.10.21', 'av==17.0.0', 'numpy<2', 'Pillow==12.1.1')
    models = base / 'models'
    models.mkdir(exist_ok=True)
    model = models / 'face_landmarker.task'
    if not model.exists():
        temporary = models / 'face_landmarker.download'
        urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task', temporary)
        temporary.replace(model)
    if not (release / 'models').exists():
        (release / 'models').symlink_to(models, target_is_directory=True)
    state = Path('/var/lib/dehub-maboroshi')
    state.mkdir(exist_ok=True, mode=0o700)
    run('chown', 'dehub-maboroshi:dehub-maboroshi', str(state))
    config = Path('/etc/dehub-maboroshi.env')
    if not config.exists():
        existing = {}
        for line in Path('/root/stream-nft/production/stream-backend/.env').read_text().splitlines():
            key, sep, value = line.partition('=')
            if sep:
                existing[key.strip()] = value.strip().strip('"').strip("'")
        internal = existing.get('INTERNAL_SERVICE_SECRET', '')
        if not internal or '\n' in internal or '"' in internal:
            raise SystemExit('Existing credit-service credential is unavailable.')
        values = {
            'INTERNAL_SERVICE_SECRET': internal,
            'MABOROSHI_MEDIA_SECRET': secrets.token_hex(32),
            'MABOROSHI_SETUP_TOKEN': secrets.token_urlsafe(32),
            'MABOROSHI_SETUP_EXPIRES': str(int(time.time()) + 86400),
            'MABOROSHI_MESH_PYTHON': str(base / 'mesh-venv/bin/python'),
            'MABOROSHI_PREPARE_MICROS': '1000000',
            'MABOROSHI_DRAFT_MICROS_PER_SECOND': '500000',
            'MABOROSHI_HD_MICROS_PER_SECOND': '1000000',
        }
        fd = os.open(config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as output:
            for key, value in values.items():
                output.write(f'{key}="{value}"\n')
    shutil.copy2(release / 'dehub-maboroshi.service', '/etc/systemd/system/dehub-maboroshi.service')
    shutil.copy2(release / 'nginx-location.conf', '/etc/nginx/snippets/dehub-maboroshi.conf')
    nginx = Path('/etc/nginx/conf.d/live.dehub.io.conf')
    include = '    include /etc/nginx/snippets/dehub-maboroshi.conf;\n'
    content = nginx.read_text()
    if include not in content:
        anchor = '    include /etc/nginx/snippets/dehub-dub.conf;'
        if anchor not in content:
            raise SystemExit('Live TLS configuration changed; review the include location.')
        shutil.copy2(nginx, str(nginx) + '.before-maboroshi-' + revision[:12])
        nginx.write_text(content.replace(anchor, include + anchor, 1))
    run('nginx', '-t')
    current = base / 'current'
    next_link = base / 'next'
    next_link.unlink(missing_ok=True)
    next_link.symlink_to(release, target_is_directory=True)
    next_link.replace(current)
    run('systemctl', 'daemon-reload')
    run('systemctl', 'enable', '--now', 'dehub-maboroshi')
    run('systemctl', 'restart', 'dehub-maboroshi')
    run('systemctl', 'reload', 'nginx')
    print(json.dumps({'release': revision, 'studio': 'https://dehub.io/creator/maboroshi', 'service': 'dehub-maboroshi'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('revision')
    install(parser.parse_args().revision)
