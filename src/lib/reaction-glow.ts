/**
 * Reaction Glow
 * =============
 * The colour each of the nine reactions lights up in once it is *yours* — in
 * the picker tray, and on the like/dislike button of the card you set it from.
 *
 * Lives here rather than in `lib/reactions`: that file is a line-for-line
 * mirror of the API's `config/reactions.ts`, and a web-only paint value has no
 * business in the copy the backend and mobile have to match.
 *
 * @module lib/reaction-glow
 */

import type { CSSProperties } from 'react';
import type { PostReaction } from '@/lib/reactions';

/**
 * The colour each emoji glows in when it is the viewer's reaction, as the
 * space-separated `r g b` channels of CSS Color 4's `rgb(R G B / A)` — the
 * legacy `rgba()` form can't take space-separated channels, and a browser
 * drops the whole declaration rather than complaining.
 *
 * Taken from the dominant colour of the glyph itself, so the highlight always
 * looks like it came off the emoji rather than being painted on top of it.
 * The three yellow faces are the exception: 😢 and 😭 glow in their tear blue,
 * since a yellow bloom would make them indistinguishable from 😂 — the tear is
 * the only part of those two that carries the meaning.
 */
export const REACTION_GLOW: Record<PostReaction, string> = {
  like:    '255 204 77',  // 👍 yellow hand
  love:    '221 46 68',   // ❤️ red
  respect: '255 204 77',  // ✊ yellow hand
  hot:     '244 144 12',  // 🔥 flame orange
  lol:     '255 204 77',  // 😂 yellow face
  sad:     '93 173 236',  // 😢 tear blue
  cry:     '93 173 236',  // 😭 tear blue
  dislike: '255 204 77',  // 👎 yellow hand
  poo:     '193 105 79',  // 💩 brown
};

/**
 * Props for a card's like or dislike button, marking it as carrying the
 * viewer's own reaction and handing the stylesheet that reaction's colour.
 *
 * Only the colour rides inline, because only the colour is per-reaction data —
 * the paint itself is one rule on `[data-reaction-glow]` in `index.css`, where
 * a theme that owns the engaged state (Osaka animates its own neon cycle over
 * these glyphs) can outrank it the ordinary way. An inline `filter` could not
 * be overridden by anything short of `!important`.
 *
 * Returns nothing when the viewer holds no reaction of that polarity, so the
 * button renders exactly as it did before they touched it.
 */
export function reactionGlowProps(
  reaction: PostReaction | null | undefined,
): { 'data-reaction-glow'?: string; style?: CSSProperties } {
  if (!reaction) return {};
  return {
    'data-reaction-glow': '',
    style: { '--reaction-glow': REACTION_GLOW[reaction] } as CSSProperties,
  };
}
