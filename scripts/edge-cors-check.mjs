#!/usr/bin/env node
/**
 * Every CORS allow-list in supabase/functions must name the headers the
 * Supabase client actually sends.
 *
 * A custom request header that is missing from a preflight's
 * `Access-Control-Allow-Headers` makes the browser refuse to send the request
 * at all — no network row, no function log, and a failure that reads exactly
 * like the server being broken. That has now bitten this repo three times:
 * `x-wallet-address` / `x-dehub-token` took every paid AI function offline
 * (#337), DELETE and PATCH did the same for the surfaces that use them, and in
 * August 2026 the supabase-js client began attaching
 * `x-supabase-client-platform` (and three siblings) to EVERY functions.invoke,
 * which silently took 62 of 115 deployed functions off the air for browsers.
 *
 * The cause each time is the same: a function hand-rolls its own `corsHeaders`
 * object instead of importing the shared one, and the copy stops matching what
 * the client sends. This check is the tripwire — it does not care where the
 * list is declared, only that every declared list is complete.
 *
 * Deliberately dependency-free (node builtins, no install), like
 * scripts/i18n-coverage.mjs, so it stays a ~2s CI job immune to lockfile drift.
 *
 * NOTE: passing here does not mean production is fixed. Merging deploys no edge
 * function — the live function keeps its old CORS until it is redeployed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'supabase/functions';

/**
 * The four the client attaches to every invoke. `authorization`, `apikey` and
 * `content-type` are not listed: two are CORS-safelisted and every existing
 * list already carries them, so requiring them would add noise without
 * catching anything.
 */
const REQUIRED = [
  'x-supabase-client-platform',
  'x-supabase-client-platform-version',
  'x-supabase-client-runtime',
  'x-supabase-client-runtime-version',
];

const KEY = /(["']Access-Control-Allow-Headers["']\s*:\s*)(["'])([^"']*)\2/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const failures = [];
let listsChecked = 0;

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  for (const match of src.matchAll(KEY)) {
    listsChecked++;
    const declared = new Set(
      match[3].split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
    );
    const missing = REQUIRED.filter((h) => !declared.has(h));
    if (missing.length) {
      const line = src.slice(0, match.index).split('\n').length;
      failures.push(`${file.replace(/\\/g, '/')}:${line} — missing ${missing.join(', ')}`);
    }
  }
}

if (failures.length) {
  console.error(`\nIncomplete CORS allow-lists (${failures.length} of ${listsChecked}):\n`);
  for (const f of failures) console.error('  ' + f);
  console.error(
    '\nAdd the missing headers, or import corsHeaders from _shared/cors.ts,' +
      '\nwhich is the canonical list. A browser drops the whole request when one' +
      '\nis absent, and it leaves no trace anywhere to debug from.\n',
  );
  process.exit(1);
}

console.log(`Edge CORS: ${listsChecked} allow-lists, all complete.`);
