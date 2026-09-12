# Destination-specific connectivity recovery

On 2026-09-12 the affected S24 resolved dehub.io to 188.114.96.5. TCP/443
to that address and 188.114.97.5 repeatedly timed out. The same device
connected to 104.21.91.225 and 172.67.180.213. A TLS-validated request for
dehub.io through 104.21.91.225, carried over the phone's own network,
returned HTTP 200 in 0.244 seconds. No DNS or VPN setting was changed.

The clients use the API hostname as primary, with one alternate relay attempt
for GET transport failures only. HTTP errors do not trigger route switching;
mutations and uploads are never replayed across routes. The native client
must not depend on website reachability for every JSON request.

The Edge route recovery workflow first supports read-only inspection. Its
zone-route mode preserves the deployed Worker and proxied HTTPS protection,
installs an apex zone route, detaches the custom-domain binding, then installs
a proxied documentation-address record. The Worker is still the origin: no
traffic is sent to a new application server. A snapshot is saved as a workflow
artifact. Unexpected ownership or DNS records stop the operation.

This attachment change is a measured recovery attempt, not a guarantee of a
particular Cloudflare anycast address or permanent protection from network
blocking. Verify the device's new DNS answer, TLS, page assets and API after
the DNS TTL expires. Preserve the working configuration in wrangler.jsonc
only after that verification. Never hard-code shared Cloudflare addresses in
public DNS, disable certificate verification, or remove proxy protection as
a shortcut. If the route remains unreachable, a separately protected delivery
provider is required; do not claim the incident resolved from server health alone.
