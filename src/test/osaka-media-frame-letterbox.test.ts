import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const THEME_CSS = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');
const IMAGE_CARD = readFileSync(resolve(__dirname, '../components/app/cards/ImageCard.tsx'), 'utf8');
const VIDEO_CARD = readFileSync(resolve(__dirname, '../components/app/cards/VideoCard.tsx'), 'utf8');
const LIVE_CARD = readFileSync(resolve(__dirname, '../components/app/cards/LiveStreamCard.tsx'), 'utf8');
const SHORTS = readFileSync(resolve(__dirname, '../components/app/cards/ShortsViewer.tsx'), 'utf8');

describe('Osaka media frames do not letterbox narrow images', () => {
  // An image narrower than the feed column leaves the wrapper's own box exposed
  // beside it. Osaka fills every [data-media-full] with --osaka-void, so that
  // leftover rendered as a black slab in the gutters on Osaka and on no other
  // theme. The wrapper carrying no fill of its own is what the guard below keys
  // off, so that — not the CSS declaration — is the first thing worth pinning.
  it('leaves the image wrapper with no fill of its own to be repainted', () => {
    const frame = IMAGE_CARD.match(/<div[^>]*data-media-full[^>]*>/);
    expect(frame).not.toBeNull();
    expect(frame![0]).not.toMatch(/bg-/);
  });

  // Asserting only that a transparent rule EXISTS is how the post-page
  // regression stayed green through the whole time it was broken. What decides
  // this pixel is that the transparent arm out-specifies the fill arm above it
  // AND that nothing id-scoped repaints the gap afterwards.
  it('guards the void fill so it cannot reach an unfilled wrapper', () => {
    const fill = THEME_CSS.indexOf("html[data-theme='osaka'] [data-media-full] {");
    const guard = THEME_CSS.indexOf(
      "html[data-theme='osaka'] [data-media-full]:not([class*='bg-']) {"
    );
    expect(fill).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(fill);
    expect(THEME_CSS.slice(guard, guard + 260)).toMatch(
      /background-color:\s*transparent\s*!important/
    );
  });

  // The fill net in section 11 carries an id, so it beats any
  // `html[data-theme] [data-hook]` rule even with both marked !important. It
  // exempts [data-media-full] today; if that exemption is ever dropped, the
  // guard above silently stops deciding anything and the slab comes back.
  it('keeps media frames exempt from the id-scoped fill net', () => {
    // Whitespace-tolerant: the selector wraps across lines, and the repo is
    // checked out CRLF on Windows and LF in CI.
    const net = THEME_CSS.search(
      /html\[data-theme='osaka'\]\s+#app-root\s+:is\(\s*\[class\^='bg-zinc-9'\]/
    );
    expect(net).toBeGreaterThan(-1);
    const block = THEME_CSS.slice(net, THEME_CSS.indexOf('}', net));
    expect(block).toMatch(/\[data-media-full\],\s*\[data-media-full\] \*/);
  });

  // The guard is a fill-of-your-own opt-out, so the frames that genuinely are
  // beds have to keep shipping one. Each of these is a video surface where the
  // dark backing is the design, not a leftover: strip the class and Osaka stops
  // painting them, because the guard can no longer tell them apart from the
  // image wrapper.
  it('keeps every deliberate dark bed carrying its own bg class', () => {
    expect(VIDEO_CARD).toMatch(/data-media-full\s+className=\{`relative bg-black/);
    expect(LIVE_CARD).toMatch(/data-media-full className=\{`aspect-video bg-black/);
    // The Shorts viewer's scrim and its video column, in that order.
    expect(SHORTS).toMatch(/data-media-full[\s\S]{0,160}?isMobile \? "bg-black" :/);
    expect(SHORTS).toMatch(/data-media-full[\s\S]{0,260}?bg-zinc-900/);
  });
});
