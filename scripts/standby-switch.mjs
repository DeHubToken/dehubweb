// Points riftn.com at the standby copy on the DigitalOcean server, or back at
// the Cloudflare Worker. See ops/STANDBY.md. Usage: node standby-switch.mjs check|backup|cloudflare
import { normalizeCredentials } from './cloudflare-credentials.mjs';

const STANDBY_IP = '138.68.188.224';
const HOSTS = ['riftn.com', 'www.riftn.com'];
const WORKER = 'dehub-migration';
const mode = process.argv[2];
if (!['check', 'backup', 'cloudflare'].includes(mode)) throw new Error('Mode must be check, backup or cloudflare.');

const { token, account } = normalizeCredentials(process.env.CLOUDFLARE_APITOKEN, process.env.CLOUDFLARE_ID);
console.log(`::add-mask::${token}`);
console.log(`::add-mask::${account}`);

async function cf(method, path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    const errors = (result.errors ?? []).map(e => `${e.code} ${e.message}`).join('; ');
    throw new Error(`${method} ${path.replace(account, '<account>')} failed (HTTP ${response.status}): ${errors || 'no detail'}`);
  }
  return result.result;
}

const [zone] = await cf('GET', '/zones?name=riftn.com');
if (!zone) throw new Error('riftn.com zone not visible to this token.');
const domains = async () => (await cf('GET', `/accounts/${account}/workers/domains`)).filter(d => HOSTS.includes(d.hostname));
const records = async () => (await cf('GET', `/zones/${zone.id}/dns_records?per_page=100`)).filter(r => HOSTS.includes(r.name) && ['A', 'AAAA', 'CNAME'].includes(r.type));

const report = async () => {
  const d = await domains();
  const r = await records();
  console.log('Worker domains:', d.map(x => `${x.hostname} -> ${x.service}`).join(', ') || 'none');
  console.log('DNS records:', r.map(x => `${x.name} ${x.type} ${x.content} proxied=${x.proxied}`).join(', ') || 'none');
  const onBackup = HOSTS.every(h => r.some(x => x.name === h && x.type === 'A' && x.content === STANDBY_IP && !x.proxied));
  console.log(`riftn.com is now on: ${onBackup ? 'BACKUP (DigitalOcean)' : d.length ? 'Cloudflare' : 'unknown'}`);
};

if (mode === 'check') {
  await report();
  // Prove the token may edit DNS without touching a live record.
  const probe = await cf('POST', `/zones/${zone.id}/dns_records`, { type: 'TXT', name: '_standby-check.riftn.com', content: '"standby switch permission check"', ttl: 60 });
  await cf('DELETE', `/zones/${zone.id}/dns_records/${probe.id}`);
  console.log('Token can edit riftn.com DNS and read Worker domains. The switch will work.');
} else if (mode === 'backup') {
  for (const d of await domains()) {
    await cf('DELETE', `/accounts/${account}/workers/domains/${d.id}`);
    console.log(`Detached ${d.hostname} from the Worker.`);
  }
  for (const r of await records()) await cf('DELETE', `/zones/${zone.id}/dns_records/${r.id}`);
  for (const name of HOSTS) {
    await cf('POST', `/zones/${zone.id}/dns_records`, { type: 'A', name, content: STANDBY_IP, proxied: false, ttl: 60, comment: 'Standby switch: Cloudflare bypass' });
    console.log(`${name} -> ${STANDBY_IP} (not proxied).`);
  }
  await report();
} else {
  for (const r of await records()) {
    if (r.type === 'A' && r.content === STANDBY_IP) {
      await cf('DELETE', `/zones/${zone.id}/dns_records/${r.id}`);
      console.log(`Removed backup record for ${r.name}.`);
    }
  }
  for (const hostname of HOSTS) {
    await cf('PUT', `/accounts/${account}/workers/domains`, { hostname, service: WORKER, environment: 'production', zone_id: zone.id });
    console.log(`${hostname} attached to the Worker again.`);
  }
  await report();
}
