# riftn.com standby copy

If Cloudflare goes down, riftn.com can be served from the DigitalOcean server
(138.68.188.224) instead of the Worker.

- **Copy:** the backend repo's "Web standby copy" workflow builds the commit
  that is live on riftn.com (from /version.json) every 20 minutes when it
  changes, and puts it in /var/www/riftn-standby/current on the server. It also
  installs ops/riftn-standby-nginx.conf and keeps the riftn-standby
  certificate. The Worker passes riftn.com/.well-known/acme-challenge/* to the
  server so the certificate can be issued and renewed while Cloudflare serves
  the site.
- **Switch to backup:** Actions > "Switch riftn.com (Cloudflare / backup)" >
  target `backup`. It checks the copy answers, detaches riftn.com and
  www.riftn.com from the Worker and adds DNS-only A records to the server
  (TTL 60). Visitors move over within a few minutes.
- **Switch back:** same workflow, target `cloudflare`. Do not run "Deploy
  production" while on backup; switch back first.
- **Check:** target `check` changes nothing and proves the token can switch.

The copy is the plain app: pages, sign-in (Supabase via /_sb), the API
(api.dehub.io and /_api) all work. Worker-only extras (share card images,
server-rendered SEO pages, /api/stats, editor rooms) do not, and Supabase
itself sits behind Cloudflare, so a full Cloudflare outage can still affect
sign-in. If Cloudflare's own DNS or API is down the switch cannot run.
