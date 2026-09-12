# Temporary direct entry point

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
