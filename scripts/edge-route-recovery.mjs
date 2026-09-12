// Keep the existing Worker and TLS/proxy protections while changing its DNS attachment.
// No application assets, accounts, database data or other hostnames are changed.
import fs from 'node:fs';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const mode = process.env.ROUTING_MODE || 'inspect';
if (!token || !account) throw new Error('Cloudflare credentials are missing');
if (!['inspect', 'zone-route'].includes(mode)) throw new Error('Invalid routing mode');
const hostname = 'dehub.io';
const script = 'dehub-migration';
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`${method} ${path}: ${JSON.stringify(data.errors)}`);
  return data.result;
}
const zones = await api(`/zones?name=${hostname}&account.id=${account}`);
if (zones.length !== 1) throw new Error('Expected exactly one DeHub zone');
const zone = zones[0].id;
const domains = await api(`/accounts/${account}/workers/domains`);
const domain = domains.find(item => item.hostname === hostname);
const routes = await api(`/zones/${zone}/workers/routes`);
const records = await api(`/zones/${zone}/dns_records?name=${hostname}`);
const route = routes.find(item => item.pattern === `${hostname}/*`);
if (domain && domain.service !== script) throw new Error('Apex belongs to another Worker; refusing to change it');
if (route && route.script !== script) throw new Error('Apex route belongs to another Worker');
const snapshot = { capturedAt: new Date().toISOString(), zone, domain, routes, records };
fs.writeFileSync('edge-route-before.json', JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify({ mode, domain, route, records: records.map(({id,type,name,content,proxied}) => ({id,type,name,content,proxied})) }, null, 2));
if (mode === 'inspect') process.exit(0);

// An already-tested zone route serves the same deployed Worker on staging.
const staging = routes.find(item => item.pattern === 'staging.dehub.io/*');
if (staging?.script !== script) throw new Error('Staging does not serve the production Worker');
for (const path of ['/app', '/_api/api/health']) {
  const response = await fetch(`https://staging.dehub.io${path}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Staging preflight failed for ${path}`);
  if (path.endsWith('/health') && (await response.json()).status !== 'ok') throw new Error('API health failed');
}
// Install the route BEFORE removing its custom-domain attachment. Both point
// to the same existing Worker; the code and asset deployment are untouched.
if (!route) await api(`/zones/${zone}/workers/routes`, 'POST', { pattern: `${hostname}/*`, script });
const addresses = records.filter(item => ['A','AAAA','CNAME'].includes(item.type));
if (addresses.some(item => !item.meta?.managed_by_apps && item.type !== 'AAAA' && !(item.type === 'A' && item.content === '192.0.2.1' && item.proxied && route?.script === script))) {
  throw new Error('Unexpected existing apex address; inspect before proceeding');
}
if (domain) await api(`/accounts/${account}/workers/domains/${domain.id}`, 'DELETE');
try {
  const remaining = await api(`/zones/${zone}/dns_records?name=${hostname}`);
  if (!remaining.some(item => item.type === 'A' && item.content === '192.0.2.1' && item.proxied)) {
    if (remaining.some(item => ['A','AAAA','CNAME'].includes(item.type))) throw new Error('Address record remains after detaching custom domain');
    // Discard/documentation address: the Worker handles every request. There
    // is no origin fallback and no exposure of the database server.
    await api(`/zones/${zone}/dns_records`, 'POST', {
      type: 'A', name: hostname, content: '192.0.2.1', proxied: true, ttl: 1,
      comment: 'Production Worker zone route; no origin fallback. See edge-route-recovery.mjs.',
    });
  }
} catch (error) {
  // Restore the original attachment if DNS creation fails. This restores
  // infrastructure only; it does not roll application code backwards.
  if (domain) await api(`/accounts/${account}/workers/domains`, 'PUT', {
    hostname, service: script, environment: domain.environment || 'production', zone_id: zone,
  });
  throw error;
}
console.log('Zone route and proxied DNS attachment installed. Device DNS/TLS verification is still required.');
