import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FEATURES, PLATFORMS, SOURCES, filterFeatures, entryFor, comparisonCoverage } from '../data/platform-comparison';

describe('public platform comparison', () => {
  it('covers exactly the eleven requested competitors without duplicating Kick', () => {
    expect(PLATFORMS.map(p => p.id)).toEqual(['youtube', 'x', 'kick', 'twitch', 'facebook', 'instagram', 'tiktok', 'rumble', 'mastodon', 'bluesky', 'farcaster']);
    expect(new Set(FEATURES.map(f => f.id)).size).toBe(FEATURES.length);
    expect(FEATURES.length).toBeGreaterThan(500);
  });
  it('requires a first-party source for every asserted capability', () => {
    for (const feature of FEATURES) for (const entry of [feature.dehub, ...Object.values(feature.peers)]) {
      expect(entry.note.length).toBeGreaterThan(5);
      expect(SOURCES[entry.source!]?.url).toMatch(/^https:\/\//);
      expect(entry.status).not.toBe('unverified');
    }
  });
  it('never turns a missing competitor entry into an absence claim', () => {
    const feature = FEATURES.find(f => f.id === 'escrow')!;
    expect(entryFor(feature, 'youtube')).toEqual(expect.objectContaining({ status: 'unverified' }));
    expect(entryFor(feature, 'youtube').note).toContain('does not mean');
  });
  it('combines search words and categories and handles empty results', () => {
    expect(filterFeatures('  live   audio ', 'Live video and audio').some(f => f.id === 'stages')).toBe(true);
    expect(filterFeatures('stablecoin', 'Creator income').some(f => f.id === 'stablecoins')).toBe(true);
    expect(filterFeatures('unmatchable-phrase', 'all')).toEqual([]);
    expect(filterFeatures('', 'all')).toHaveLength(FEATURES.length);
  });
  it('keeps iOS payment restrictions and encryption limitations explicit', () => {
    for (const id of ['tips', 'subs', 'ppv', 'stablecoins', 'paid-dm', 'staking', 'generate-video']) {
      expect(FEATURES.find(f => f.id === id)?.iosRestricted).toBe(true);
    }
    expect(FEATURES.find(f => f.id === 'encrypted-text')?.dehub.note).toContain('plaintext');
    expect(FEATURES.find(f => f.id === 'encrypted-attachments')?.dehub.note).toContain('fallback');
    expect(FEATURES.find(f => f.id === 'encrypted-attachments')?.dehub.status).toBe('limited');
  });
  it('pins source ownership to real web files and discloses peer evidence gaps', () => {
    for (const feature of FEATURES) if (feature.implementation) {
      expect(existsSync(resolve(process.cwd(), feature.implementation.web)), feature.id).toBe(true);
      expect(SOURCES[feature.dehub.source!].url).toContain('/blob/');
      expect(feature.dehub.relatedSources?.some(source => SOURCES[source]?.url.startsWith('https://github.com/DeHubToken/dehub-mobile/blob/'))).toBe(true);
    }
    const all = comparisonCoverage('all');
    expect(all.total).toBe(FEATURES.length * PLATFORMS.length);
    expect(all.verified).toBeGreaterThan(0);
    expect(all.verified).toBeLessThan(all.total);
  });
  it('accounts for every capability in the editor guide', () => {
    const coverage = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/comparison-editor-coverage.json'), 'utf8')) as Record<string, string>;
    const guide = readFileSync(resolve(process.cwd(), 'src/lib/editor/editorGuide.ts'), 'utf8');
    const ids = [...guide.matchAll(/\{ id: "([^"]+)", title:/g)].map(match => match[1]);
    expect(Object.keys(coverage).sort()).toEqual(ids.sort());
    for (const id of Object.values(coverage)) expect(FEATURES.some(feature => feature.id === id), id).toBe(true);
  });
});
