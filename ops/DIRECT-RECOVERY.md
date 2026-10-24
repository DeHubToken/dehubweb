# Production direct HTTPS delivery

The 24 October 2026 recurrence had the existing apex A record pointing to
138.68.188.224 with its proxy enabled. The affected phone resolved it to
188.114.96.5/188.114.97.5 and timed out on both TCP/443 endpoints. Google,
the Supabase project, and 138.68.188.224 remained reachable. A TLS-validated
request through the phone's own Wi-Fi to the direct gateway returned the
current production version. Do not fix this by changing the user's DNS or VPN.

The durable routing contract is `ops/production-routing.json`, shared with
dehub-mobile. The apex must be DNS-only to the gateway. No apex AAAA record
is supported until a working IPv6 gateway is verified. `origin.dehub.io` stays
attached to dehub-migration as a custom domain; the public apex must not be a
Worker route or custom domain. The build validates this separation. Production
release checks verify A/AAAA through two resolvers, HTTPS, and API health before
and after deployment. Mobile publication checks the same public route.

The old zone-route mutation is retired: it cannot make shared Cloudflare
addresses reliable on the affected network. The inspection workflow is now
read-only and needs no DNS API credential. Do not re-enable the apex proxy to
address the dashboard's origin-exposure recommendation: api.dehub.io already
uses this public gateway. A future move behind a delivery provider requires
phone verification, an explicit contract change, and a reviewed PR.

These checks prevent releases from silently claiming success on a regressed
route. They cannot prevent an account owner from changing DNS in the dashboard,
or guarantee against future provider outages. They are release checks, not a
recurring monitor. Keep certificate renewal enabled and validate it after cutover.

Approved incident tradeoff: public API/apex traffic bypasses Cloudflare's inbound
edge filtering. HTTPS, application authentication and API rate limits remain.
The web application and its assets still run on the existing Cloudflare Worker;
the DigitalOcean entry point reaches it using a separate upstream hostname.

Preparation order:

1. Validate direct API TLS and health from the affected phone, then set only
   api.dehub.io's existing A record to DNS-only. Verify normal phone DNS/HTTPS.
2. Obtain a valid dehub.io certificate in the dehub-direct lineage. Attach
   origin.dehub.io to the same dehub-migration Worker. Keep the existing apex
   attachment until the direct website has passed validation.
3. Deploy canonicalOriginRequest and test the origin hostname with the
   X-DeHub-Public-Host header. Unmarked origin and staging remain noindex.
4. Back up /etc/nginx/conf.d/dehub.io.conf. Remove only dehub.io from its two
   legacy `server_name dehub.io www.dehub.io;` declarations, leaving www intact.
   Install direct-web-nginx.conf as /etc/nginx/conf.d/03-direct-web.conf.
   Run nginx -t before reloading; retain the backup outside conf.d.
5. Test direct HTTPS HTML, an asset, API relay and auth preflight from the phone
   before changing apex DNS. Keep certificate validation enabled on both hops.
6. Only after those checks, replace the apex Worker custom-domain attachment
   with a DNS-only A record pointing to 138.68.188.224. Keep origin attached.
   Do not change mail records, Namecheap registration, staging or live ingest.
7. Once public apex HTTP reaches this server, reconfigure dehub-direct renewal
   to webroot /var/www/dehub-acme and verify a dry-run. The initial manual DNS
   certificate alone is not a completed renewal setup.

No cache is added for API/auth requests. The public-host header is only a URL
semantic hint and does not grant access to accounts or privileged routes.
Verify backend client-IP attribution separately when removing Cloudflare.
Record the actual DNS cutover and phone results in the incident log; preparation
and a successful deployment alone are not proof of recovery.
