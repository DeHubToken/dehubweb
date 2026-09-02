/**
 * A shared Creator Flow link (/creator/flow/<id>) has to get past the SSR
 * gate and reach its own renderer, or it unfurls as the homepage card. Same
 * shape as entity-seo-routes.test.ts: the regexes are pulled out of the
 * worker source and executed, so this asserts which paths are carded rather
 * than how the pattern is spelled.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

const gate = () => {
  const start = WORKER.indexOf('function shouldServeSSR');
  expect(start).toBeGreaterThan(-1);
  return WORKER.slice(start, WORKER.indexOf('\n}\n', start));
};

function workerRegex(source: string, marker: string): RegExp {
  const at = source.indexOf(marker);
  expect(at, `no regex containing ${marker}`).toBeGreaterThan(-1);
  const start = source.lastIndexOf('/^', at);
  const end = source.indexOf('$/', at);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return new RegExp(source.slice(start + 1, end + 1));
}

describe('creator flow share links', () => {
  const gateFlow = () => workerRegex(gate(), String.raw`\/creator\/flow\/`);
  const renderFlow = () => workerRegex(WORKER.slice(WORKER.indexOf('const flowMatch')), String.raw`\/creator\/flow\/`);

  it('lets a shared flow past the gate', () => {
    expect(gateFlow().test('/creator/flow/mf3k2a9x1b')).toBe(true);
    expect(gateFlow().test('/creator/flow/mf3k2a9x1b/')).toBe(true);
  });

  it('keeps the editor itself and junk ids as SPA', () => {
    expect(gateFlow().test('/creator/flow')).toBe(false);
    expect(gateFlow().test('/creator/flow/')).toBe(false);
    expect(gateFlow().test('/creator/flow/ab')).toBe(false);
    expect(gateFlow().test('/creator/flow/<script>')).toBe(false);
    expect(gateFlow().test('/creator')).toBe(false);
  });

  it('routes the same ids to the renderer', () => {
    expect(renderFlow().test('/creator/flow/mf3k2a9x1b')).toBe(true);
    expect(renderFlow().test('/creator/flow/ab')).toBe(false);
  });

  it('only ever reads public rows', () => {
    const at = WORKER.indexOf('const flowMatch');
    const branch = WORKER.slice(at, WORKER.indexOf('const proposalMatch', at));
    expect(branch).toContain('creator_flows?id=eq.');
    expect(branch).toContain('is_public=eq.true');
    expect(branch).toContain('buildCreatorFlowHtml(flow)');
  });

  it('has a renderer that falls back to the creator card', () => {
    const at = WORKER.indexOf('function buildCreatorFlowHtml');
    expect(at).toBeGreaterThan(-1);
    const fn = WORKER.slice(at, WORKER.indexOf('\n}\n', at));
    expect(fn).toContain("shareImage('creator')");
    expect(fn).toContain('/creator/flow/${flow.id}');
  });
});
