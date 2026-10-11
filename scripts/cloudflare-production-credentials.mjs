import { appendFileSync } from 'node:fs';
import { normalizeCredentials } from './cloudflare-credentials.mjs';

const { token, account } = normalizeCredentials(process.env.CLOUDFLARE_APITOKEN, process.env.CLOUDFLARE_ID);
console.log(`::add-mask::${token}`);
console.log(`::add-mask::${account}`);

const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/services/dehub-migration`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(15_000),
});
const result = await response.json();
if (!response.ok || !result.success) {
  const codes = (result.errors ?? []).map(error => Number(error.code)).filter(Number.isFinite).join(', ');
  throw new Error(`Cloudflare production access failed (HTTP ${response.status}; codes ${codes || 'none'}).`);
}

appendFileSync(process.env.GITHUB_ENV, `CLOUDFLARE_API_TOKEN=${token}\nCLOUDFLARE_ACCOUNT_ID=${account}\n`);
console.log('Cloudflare credentials can access dehub-migration.');
