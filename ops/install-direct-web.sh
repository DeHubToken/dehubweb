#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
target=/etc/nginx/conf.d/dehub.io.conf
expected=818d008983e43806de1a6976e7f90a9ed1e142d38c6d10cd912e106fee0cda48
actual=$(sha256sum "$target" | cut -d ' ' -f 1)
[[ "$actual" == "$expected" ]] || { echo 'Legacy configuration changed; inspect before installing.'; exit 1; }
[[ ! -e /etc/nginx/conf.d/03-direct-web.conf ]] || { echo 'Direct gateway already exists; inspect before replacing.'; exit 1; }
[[ ! -e /etc/nginx/snippets/dehub-cloudflare-real-ip.conf ]]
[[ $(grep -c 'server_name dehub.io www.dehub.io;' "$target") == 2 ]]
backup=$(mktemp -d /etc/nginx/direct-recovery-backup.XXXXXX)
cp -a "$target" "$backup/dehub.io.conf"
# Direct clients must not supply their own trusted forwarding address.
sed -e 's/server_name dehub.io www.dehub.io;/server_name www.dehub.io;/' \
    -e 's/proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/proxy_set_header X-Forwarded-For $remote_addr;/' \
    -e '/proxy_pass http:\/\/api_backend;/a\        proxy_set_header CF-Connecting-IP $remote_addr;' \
    -e '/server_name api.dehub.io;/a\    include /etc/nginx/snippets/dehub-cloudflare-real-ip.conf;' \
    "$backup/dehub.io.conf" > "$backup/dehub.io.updated.conf"
install -d -m 755 /var/www/dehub-acme
install -m 644 cloudflare-real-ip.conf /etc/nginx/snippets/dehub-cloudflare-real-ip.conf
install -m 644 "$backup/dehub.io.updated.conf" "$target"
install -m 644 direct-web-nginx.conf /etc/nginx/conf.d/03-direct-web.conf
nginx -t
systemctl reload nginx
echo "Direct gateway installed; original configuration retained at $backup"
