import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const VIDEO_CARD = readFileSync(
  resolve(__dirname, '../components/app/cards/VideoCard.tsx'),
  'utf8'
);

/**
 * The single post page's immersive wrapper painted a slab that covered the video
 * and its title block and then stopped dead, leaving a seam partway down the
 * page on every theme whose canvas is not black — theme material on Osaka and
 * Jungle, flat black over the canvas on Cosmic, Hazy and War.
 *
 * It carried `bg-black lg:bg-transparent`. Every untagged-slab net matches
 * `[class*='bg-black']` and every one of them is scoped under #app-root, so they
 * carry an id and outrank a plain `lg:` utility at desktop widths as readily as
 * they outrank a re-declaration. Assert the class is GONE, never that some rule
 * declares the element transparent — a declaration is exactly what lost here.
 */
describe('immersive video card — the wrapper draws no surface of its own', () => {
  it('ships the immersive wrapper with no colour utility at all', () => {
    const wrapper = VIDEO_CARD.match(
      /data-video-card[\s\S]{0,400}?className=\{isImmersive([\s\S]{0,300}?)\n\s*\}/
    );
    expect(wrapper).not.toBeNull();
    // Any `bg-*` here is reachable by the nets again, whatever it is set to and
    // whatever breakpoint it is behind.
    expect(wrapper![1]).not.toMatch(/bg-/);
  });

  it('rounds the immersive frame at desktop widths, where it sits inset', () => {
    // On mobile the media runs edge-to-edge and must stay square. On desktop it
    // sits inside the post shell's `rounded-2xl` bento with 12px of padding, so
    // a square frame is the only hard rectangle in the column — ImageCard, which
    // fills that same slot for image posts, has always rounded there.
    expect(VIDEO_CARD).toMatch(/isImmersive\s*\?\s*'rounded-none lg:rounded-2xl'/);
  });

  it('keeps a fullscreen frame square without relying on utility order', () => {
    // The radius is one token, not two competing utilities: with `rounded-none`
    // in the fullscreen branch AND `lg:rounded-2xl` in the immersive one, the
    // responsive variant wins at desktop widths and rounds a fullscreen video.
    expect(VIDEO_CARD).toMatch(/const mediaRadius = isFullscreen\s*\?\s*'rounded-none'/);
    const fullscreenBranch = VIDEO_CARD.match(/isFullscreen \? 'fixed inset-0[^']*'/);
    expect(fullscreenBranch).not.toBeNull();
    expect(fullscreenBranch![0]).not.toContain('rounded');
  });

  it('leaves the media frame its own letterbox fill', () => {
    // [data-media-full] is exempted by name from every net precisely so it can
    // keep a dark surround behind a video that does not fill the frame. Only the
    // wrapper around it lost its fill.
    expect(VIDEO_CARD).toMatch(/data-media-full\s+className=\{`relative bg-black/);
  });
});
