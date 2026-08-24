/**
 * The boot shell's gate, exercised as code rather than eyeballed.
 *
 * index.html paints the signed-out welcome card before any JavaScript bundle
 * arrives. Whether it paints is decided by an inline script that can only read
 * localStorage synchronously — it cannot ask the app who is signed in. Get that
 * predicate wrong in the permissive direction and a signed-in visitor watches a
 * welcome panel flash and vanish on every cold load, which is exactly what
 * shipped the first time: the gate tested `dehub_token` (the wallet/API token)
 * and so read every Supabase-authenticated visitor as a stranger.
 *
 * The script is inline by design — moving it into the bundle would put it back
 * behind the very wall it exists to beat — so it can't be imported. This test
 * lifts it out of index.html and runs it against controlled storage instead,
 * which keeps the real shipped source under test rather than a copy of it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** The inline <script> that inserts the shell, identified by what it does. */
const gateSource = (() => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const found = scripts.find((s) => s.includes('el.id = "boot-shell"'));
  if (!found) throw new Error('boot-shell inserter not found in index.html');
  return found;
})();

/** Minimal localStorage double — the real one, keyed and enumerable. */
function makeStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

/** Run the real inline script against a given environment; report the outcome. */
function runGate(opts: { pathname?: string; userAgent?: string; storage?: Record<string, string> }) {
  document.body.innerHTML = '';
  delete (window as { __dehubDismissBootShell?: unknown }).__dehubDismissBootShell;
  const fn = new Function('location', 'navigator', 'localStorage', 'document', 'window', 'Image', gateSource);
  fn(
    { pathname: opts.pathname ?? '/' },
    { userAgent: opts.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0' },
    makeStorage(opts.storage ?? {}),
    document,
    window,
    class {
      set src(_v: string) {
        /* never resolves in jsdom, which is what a slow network looks like */
      }
    },
  );
  return !!document.getElementById('boot-shell');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('boot shell gate', () => {
  it('paints for a genuine first-time visitor on the root path', () => {
    expect(runGate({})).toBe(true);
  });

  // The reported bug. supabase-js stores the session under sb-<ref>-auth-token,
  // and chunks a large one across `.0`/`.1` — both must count as signed in.
  it.each([
    ['sb-aigxuutjaqsywioxjefr-auth-token'],
    ['sb-aigxuutjaqsywioxjefr-auth-token.0'],
  ])('stays down for a Supabase session stored at %s', (key) => {
    expect(runGate({ storage: { [key]: '{"access_token":"x"}' } })).toBe(false);
  });

  it('stays down for a live wallet token', () => {
    expect(
      runGate({
        storage: { dehub_token: 'x', dehub_token_expires_at: String(Date.now() + 60_000) },
      }),
    ).toBe(false);
  });

  it('still paints for an EXPIRED wallet token — that is not a session', () => {
    expect(
      runGate({
        storage: { dehub_token: 'x', dehub_token_expires_at: String(Date.now() - 60_000) },
      }),
    ).toBe(true);
  });

  it('honours what HomeIntro concluded on the previous load', () => {
    expect(runGate({ storage: { 'dehub.showIntro': '0' } })).toBe(false);
    expect(runGate({ storage: { 'dehub.showIntro': '1' } })).toBe(true);
  });

  it('stays down once the panel has been dismissed', () => {
    expect(runGate({ storage: { 'dehub.homeIntroDismissed': '1' } })).toBe(false);
  });

  // A full-viewport overlay in a rendered crawl is what the intrusive
  // interstitial signal looks for; crawlers get HOME_INTRO_HTML instead.
  it('stays down for crawlers', () => {
    expect(runGate({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' })).toBe(false);
  });

  // The shell mirrors HomeIntro, which HomePage renders on "/" only.
  it('stays down off the root path', () => {
    expect(runGate({ pathname: '/app/explore' })).toBe(false);
  });

  it('exposes a dismiss function whenever it paints', () => {
    expect(runGate({})).toBe(true);
    expect(typeof window.__dehubDismissBootShell).toBe('function');
    window.__dehubDismissBootShell!();
    expect(document.getElementById('boot-shell')!.className).toContain('bs-gone');
  });
});
