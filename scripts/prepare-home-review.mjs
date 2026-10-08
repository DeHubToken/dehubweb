import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeCredentials } from './cloudflare-credentials.mjs';

if (process.argv.includes('--assets')) {
  const origin = process.env.HOME_REVIEW_ORIGIN;
  if (!/^https:\/\/dehub-home-uix-review\.[a-z0-9-]+\.workers\.dev$/.test(origin ?? '')) {
    throw new Error('Invalid review origin');
  }
  // Only the preview artifact changes API origin. Production source and routes
  // remain untouched; the preview relay uses the same bearer authentication.
  function rewrite(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) rewrite(file);
      else if (/\.(?:js|html)$/.test(file)) {
        const before = readFileSync(file, 'utf8');
        const after = before.replaceAll('https://api.dehub.io', `${origin}/_api`);
        if (after !== before) writeFileSync(file, after);
      }
    }
  }
  rewrite('dist');
  const version = JSON.parse(readFileSync('dist/version.json', 'utf8'));
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Review build: ${version.id}\n\n[Open Home preview](${origin}/app)\n`);
} else {
  const { token, account } = normalizeCredentials(process.env.CLOUDFLARE_APITOKEN, process.env.CLOUDFLARE_ID);
  console.log(`::add-mask::${token}`);
  console.log(`::add-mask::${account}`);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || !body.success || !/^[a-z0-9-]+$/.test(body.result?.subdomain ?? '')) {
    throw new Error(`Cannot read the review Worker subdomain (HTTP ${response.status})`);
  }
  const origin = `https://dehub-home-uix-review.${body.result.subdomain}.workers.dev`;
  appendFileSync(process.env.GITHUB_ENV, `CLOUDFLARE_API_TOKEN=${token}\nCLOUDFLARE_ACCOUNT_ID=${account}\nHOME_REVIEW_ORIGIN=${origin}\n`);
  console.log(`Review origin: ${origin}`);
}
