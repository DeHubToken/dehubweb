import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { motionModel, searchMotionClips, type MotionCatalog, type MotionClip } from './motionLibrary';

const catalog: MotionCatalog = JSON.parse(readFileSync('public/creator-clips/catalog.json', 'utf8'));
const featured: MotionCatalog = JSON.parse(readFileSync('public/creator-clips/featured.json', 'utf8'));

describe('Creator source clips', () => {
  it('ships original source footage separately from its remake examples', () => {
    expect(catalog.clips.length).toBeGreaterThan(15000);
    expect(new Set(catalog.clips.map(clip => clip.id)).size).toBe(catalog.clips.length);
    expect(new Set(catalog.clips.map(clip => clip.url)).size).toBe(catalog.clips.length);
    for (const clip of catalog.clips) {
      expect(clip.url).toMatch(/^https:\/\//);
      expect(clip.poster).toMatch(/^https:\/\//);
      expect(clip.seconds).toBeGreaterThanOrEqual(3);
      expect(clip.seconds).toBeLessThanOrEqual(30);
      expect(clip.variants.every(variant => variant.url !== clip.url)).toBe(true);
    }
  });
  it('loads a small initial showcase backed by the complete shared library', () => {
    expect(featured.total).toBe(catalog.clips.length);
    expect(featured.clips.length).toBeLessThanOrEqual(32);
    expect(featured.clips.some(clip => clip.category === 'Rap')).toBe(true);
    expect(featured.clips.every(clip => catalog.clips.some(item => item.id === clip.id && item.url === clip.url))).toBe(true);
  });
  it('offers the studio rap clips and matches multi-word searches', () => {
    const rap = searchMotionClips(catalog.clips, 'studio rap', 'Rap');
    expect(rap.length).toBeGreaterThan(10);
    expect(rap.every(clip => clip.category === 'Rap')).toBe(true);
    expect(searchMotionClips(catalog.clips, 'no-such-motion-source')).toHaveLength(0);
  });
  it('routes longer performances to a model that accepts the full source', () => {
    const clip = catalog.clips[0];
    expect(motionModel({ ...clip, seconds: 15 })).toBe('kling-o3-edit');
    expect(motionModel({ ...clip, seconds: 15.01 })).toBe('kling-3-motion');
    expect(motionModel({ ...clip, seconds: 5 } as MotionClip, 'motion')).toBe('kling-3-motion');
  });
});
