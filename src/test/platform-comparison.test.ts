import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FEATURES, PLATFORMS, SOURCES, filterFeatures, entryFor, comparisonCoverage } from '../data/platform-comparison';
import { CATEGORY_FAMILIES, REVIEWED_FEATURE_IDS, REVIEW_SCOPES, RESEARCH_RULES, researchedEntry } from '../data/platform-comparison-research';

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
      for (const source of entry.relatedSources ?? []) expect(SOURCES[source]?.url).toMatch(/^https:\/\//);
    }
  });
  it('never turns a missing competitor entry into an absence claim', () => {
    const feature = FEATURES.find(f => f.id === 'escrow')!;
    expect(entryFor(feature, 'youtube')).toEqual(expect.objectContaining({ status: 'not_documented' }));
    expect(entryFor(feature, 'youtube').note).toContain('not a tested absence');
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
  it('accounts for every feature/platform pair without automatically reviewing future additions', () => {
    expect([...REVIEWED_FEATURE_IDS].sort()).toEqual(FEATURES.map(feature => feature.id).sort());
    for (const feature of FEATURES) for (const platform of PLATFORMS) {
      const scope = REVIEW_SCOPES[platform.id][CATEGORY_FAMILIES[feature.category]];
      expect(scope.sources.length).toBeGreaterThan(0);
      for (const source of scope.sources) expect(SOURCES[source]?.url).toMatch(/^https:\/\//);
      expect(feature.peers[platform.id]?.source, `${platform.id}:${feature.id}`).toBeTruthy();
    }
    for (const rule of RESEARCH_RULES) for (const id of rule.ids.split(' ')) expect(FEATURES.some(feature => feature.id === id), id).toBe(true);
    expect(researchedEntry('future-capability', 'Future', 'Video editing', 'youtube')).toBeUndefined();
    expect(comparisonCoverage('all').reviewed).toBe(524 * 11);
  });
  it('retains competitor matches and explicit current limitations discovered by research', () => {
    const peer = (id: string, platform: typeof PLATFORMS[number]['id']) => entryFor(FEATURES.find(feature => feature.id === id)!, platform);
    expect(peer('encrypted-attachments', 'x').status).toBe('limited');
    expect(peer('accounts', 'x').status).toBe('not_offered');
    expect(peer('wallet', 'x').note).toContain('fiat');
    expect(peer('stage-dub', 'youtube').status).toBe('announced');
    expect(peer('encrypted-text', 'mastodon').status).toBe('not_offered');
    expect(peer('generate-video', 'tiktok').status).toBe('ecosystem');
    expect(peer('boosts', 'rumble').status).toBe('limited');
    expect(peer('drafts', 'bluesky').status).toBe('documented');
  });
});
