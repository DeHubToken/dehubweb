import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function normalizeCredentials(tokenValue = '', accountValue = '') {
  const unwrap = value => value.trim().replace(/^(["'])(.*)\1$/s, '$2').trim();
  const token = unwrap(unwrap(tokenValue).replace(/^Bearer\s+/i, ''));
  const account = unwrap(accountValue);
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('CLOUDFLARE_APITOKEN must contain only the API token, without a command or internal whitespace.');
  }
  if (!/^[a-f0-9]{32}$/i.test(account)) {
    throw new Error('CLOUDFLARE_ID must contain the 32-character account ID.');
  }
  return { token, account };
}

async function main() {
  const { token, account } = normalizeCredentials(process.env.CLOUDFLARE_APITOKEN, process.env.CLOUDFLARE_ID);
  // Mask the normalized value before persisting it for Wrangler. Never log credentials.
  console.log(`::add-mask::${token}`);
  console.log(`::add-mask::${account}`);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/services/dehub-staging`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    const codes = (data.errors ?? []).map(error => Number(error.code)).filter(Number.isFinite).join(', ');
    throw new Error(`Cloudflare staging access failed (HTTP ${response.status}; codes ${codes || 'none'}). Check the repository Cloudflare token and account ID.`);
  }
  appendFileSync(process.env.GITHUB_ENV, `CLOUDFLARE_API_TOKEN=${token}\nCLOUDFLARE_ACCOUNT_ID=${account}\n`);
  console.log('Cloudflare credentials can access dehub-staging.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Network errors can contain request details; expose only our fixed diagnostic messages.
    console.error(error.message.startsWith('CLOUDFLARE_') || error.message.startsWith('Cloudflare staging access failed')
      ? error.message : 'Cloudflare credential preflight failed before deployment.');
    process.exitCode = 1;
  });
}
