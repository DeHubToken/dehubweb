/**
 * "Allow AI scraping" off must reach the HTML crawlers get, not only the
 * browser: AI crawlers run no script, so a tag the app adds after load is one
 * they never see. The worker adds `noai, noimageai` and `tdm-reservation` for
 * a creator whose customs say 'deny', and nothing for anyone else.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKER = readFileSync(resolve(__dirname, '../../CLOUDFLARE_WORKER_SEO.js'), 'utf8');

function decl(signature: string): string {
  const start = WORKER.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  return WORKER.slice(start, WORKER.indexOf('\n}\n', start) + 2);
}

const fns = new Function(
  `${decl('function aiTrainingReserved(')}\n${decl('function reserveAiTraining(')}\nreturn { aiTrainingReserved, reserveAiTraining };`,
)() as {
  aiTrainingReserved: (customs: unknown) => boolean;
  reserveAiTraining: (html: string) => string;
};

describe('crawler AI opt-out', () => {
  it('only a literal deny reserves', () => {
    expect(fns.aiTrainingReserved({ aiScraping: 'deny' })).toBe(true);
    expect(fns.aiTrainingReserved({ aiScraping: 'allow' })).toBe(false);
    expect(fns.aiTrainingReserved({})).toBe(false);
    expect(fns.aiTrainingReserved(null)).toBe(false);
    expect(fns.aiTrainingReserved('deny')).toBe(false);
  });

  it('extends an existing robots meta and adds tdm-reservation once', () => {
    const out = fns.reserveAiTraining('<head><meta name="robots" content="index, follow"><meta name="tdm-reservation" content="0"></head>');
    expect(out).toContain('<meta name="robots" content="index, follow, noai, noimageai">');
    expect(out.match(/tdm-reservation/g)).toHaveLength(1);
    expect(out).toContain('<meta name="tdm-reservation" content="1">');
  });

  it('adds a robots meta when the page has none, without noindex', () => {
    const out = fns.reserveAiTraining('<head><title>x</title></head>');
    expect(out).toContain('<meta name="robots" content="noai, noimageai">');
    expect(out).not.toContain('noindex');
  });

  it('is applied to profiles and posts right before the response', () => {
    expect(WORKER).toContain('aiReserved = aiTrainingReserved(account && account.customs);');
    expect(WORKER).toContain('aiReserved = aiTrainingReserved(record && record.minterUser && record.minterUser.customs);');
    expect(WORKER).toMatch(/if \(aiReserved\) html = reserveAiTraining\(html\);\n[^\n]*\n\s*const rendered = await guard/);
  });
});
