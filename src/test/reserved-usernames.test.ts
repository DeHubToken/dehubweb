/**
 * Profiles live at `/:username`, the last route in the router. Every static
 * top-level path beats it, and the edge worker intercepts more paths before
 * React boots at all. So a username that matches one of those is a profile
 * nobody can ever open — and a product URL held by whoever registered first.
 *
 * That has already happened five times in production (`admin`, `explore`,
 * `creators`, `wallet`, `blog` are all real accounts on real wallets), and the
 * worker's SYSTEM_ROUTES list grew a reactive patch each time a new route
 * shipped and started answering "Join @<route>" to crawlers.
 *
 * The compiler cannot see any of this: App.tsx route strings and the worker's
 * redirect tables are just strings. So the invariant is asserted here — adding
 * a top-level route without reserving its name fails this spec.
 *
 * NOTE: package.json has no `test` script and CI runs `tsc` only, so nothing
 * executes this today. It is written to be correct the moment a runner is
 * wired up; until then it is an executable statement of the contract.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESERVED_USERNAMES, isReservedUsername } from '@/lib/reserved-usernames';

const ROOT = resolve(__dirname, '../..');
const APP_TSX = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

/** First path segment of every `path="/..."` in the router. */
function routerTopLevelSegments(): string[] {
  const segments = new Set<string>();
  for (const match of APP_TSX.matchAll(/path="\/([^"]*)"/g)) {
    const first = match[1].split('/')[0];
    // `:username` is the dynamic route itself; `*` is the catch-all; a dotted
    // segment (`skill.md`) is an asset, which isReservedUsername covers by rule.
    if (!first || first.startsWith(':') || first.startsWith('*') || first.includes('.')) continue;
    segments.add(first.toLowerCase());
  }
  return [...segments].sort();
}

/** Top-level paths the worker 301s away before the router ever sees them. */
function workerRedirectSegments(): string[] {
  const segments = new Set<string>();
  for (const table of ['LEGAL_REDIRECTS', 'SPA_REDIRECTS']) {
    const block = WORKER.match(new RegExp(`const ${table} = \\{([\\s\\S]*?)\\};`));
    if (!block) continue;
    for (const entry of block[1].matchAll(/'\/([^']*)'\s*:/g)) {
      const first = entry[1].split('/')[0];
      if (!first || first === 'app') continue;
      segments.add(first.toLowerCase());
    }
  }
  return [...segments].sort();
}

describe('reserved usernames', () => {
  it('reserves every top-level route in the router', () => {
    const unreserved = routerTopLevelSegments().filter((s) => !isReservedUsername(s));
    expect(unreserved, `unreserved top-level routes: ${unreserved.join(', ')}`).toEqual([]);
  });

  it('reserves every path the edge worker redirects away', () => {
    const unreserved = workerRedirectSegments().filter((s) => !isReservedUsername(s));
    expect(unreserved, `unreserved worker redirects: ${unreserved.join(', ')}`).toEqual([]);
  });

  it('found routes to check (guards against the parsers silently matching nothing)', () => {
    expect(routerTopLevelSegments().length).toBeGreaterThan(20);
    expect(workerRedirectSegments().length).toBeGreaterThan(3);
  });

  it('matches case-insensitively and ignores @ and padding', () => {
    // Router matching is case-insensitive, so /App resolves the /app route and
    // a profile named `App` is just as unreachable as `app`.
    for (const variant of ['App', 'APP', ' app ', '@app', '@App']) {
      expect(isReservedUsername(variant), variant).toBe(true);
    }
  });

  it('does not over-reserve ordinary names', () => {
    for (const name of ['alice', 'dehub_fan', 'app1', 'appleton', 'postman']) {
      expect(isReservedUsername(name), name).toBe(false);
    }
  });

  it('reserves the handles already registered against product routes', () => {
    // Real accounts hold all five today; they are why this file exists.
    for (const taken of ['admin', 'explore', 'creators', 'wallet', 'blog']) {
      expect(RESERVED_USERNAMES.has(taken), taken).toBe(true);
    }
  });
});
