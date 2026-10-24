#!/usr/bin/env bash
set -euo pipefail
revision="${1:?Exact merged revision required}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]]
archive="/tmp/dehub-stage-media-$revision.tar"
test -f "$archive"
test -x /srv/dehub-dub/venv/bin/uvicorn
# Existing video renders keep running. A stage service update must first drain
# its own jobs; the first deployment has no stage service to interrupt.
if systemctl is-active --quiet dehub-stage-media; then
  echo 'Stage media is already running; drain its jobs before replacing it.' >&2
  exit 1
fi
if ss -H -lnt 'sport = :7862' | grep -q .; then
  echo 'Stage media port 7862 is already occupied.' >&2
  exit 1
fi
release="/srv/dehub-stage-media/releases/$revision"
install -d "$release"
tar -xf "$archive" --strip-components=2 -C "$release"
test -f "$release/stage_server.py"
ln -sfn "$release" /srv/dehub-stage-media/app
install -m 644 "$release/dehub-stage-media.service" /etc/systemd/system/dehub-stage-media.service
install -m 644 "$release/stage-nginx-location.conf" /etc/nginx/snippets/dehub-stage-media.conf
config=/etc/nginx/conf.d/live.dehub.io.conf
cp -n "$config" "$config.before-stage-$revision"
if ! grep -q 'include /etc/nginx/snippets/dehub-stage-media.conf;' "$config"; then
  sed -i '\|include /etc/nginx/snippets/dehub-dub.conf;|a\    include /etc/nginx/snippets/dehub-stage-media.conf;' "$config"
fi
nginx -t
systemctl daemon-reload
systemctl enable --now dehub-stage-media
curl --fail --silent --show-error --retry-connrefused --retry 10 --retry-delay 1 --retry-max-time 15 http://127.0.0.1:7862/ \
  | python3 -c 'import json,sys; assert json.load(sys.stdin).get("service") == "stage-media"'
systemctl reload nginx
echo "Stage media deployed from $revision"
