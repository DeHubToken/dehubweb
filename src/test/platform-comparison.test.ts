import { describe, it, expect } from 'vitest';
import { FEATURES, PLATFORMS, SOURCES, filterFeatures, entryFor } from '../data/platform-comparison';

describe('public platform comparison', () => {
  it('covers exactly the eleven requested competitors without duplicating Kick', () => {
    expect(PLATFORMS.map(p => p.id)).toEqual(['youtube', 'x', 'kick', 'twitch', 'facebook', 'instagram', 'tiktok', 'rumble', 'mastodon', 'bluesky', 'farcaster']);
    expect(new Set(FEATURES.map(f => f.id)).size).toBe(FEATURES.length);
    expect(FEATURES.length).toBeGreaterThan(100);
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
    expect(FEATURES.find(f => f.id === 'encrypted-text')?.dehub.note).toContain('attachments');
  });
});
