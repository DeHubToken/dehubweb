import type React from 'react';
import {
  AudioLines,
  Bookmark,
  Crosshair,
  Film,
  Home,
  Image as ImageIcon,
  Layers,
  Mail,
  MessageSquare,
  Radio,
  Star,
  Users,
  Wand2,
  Bell,
  BookOpen,
  Briefcase,
  Clapperboard,
  Flame,
  Lamp,
  Lightbulb,
  Lock,
  MessageCircle,
  Mic,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * War theme replacement for the generated "shiny metal" page and tab artwork.
 * ==========================================================================
 * The app ships twelve bespoke raster icons (`*-3d-icon.png`) used as page
 * titles and profile tab empty states. They are glossy 3D renders, which is
 * the opposite of a flat tactical readout, so under War they are swapped for a
 * stroked glyph inside a HUD bracket frame.
 *
 * WHY SVG AND NOT A WEBGL CANVAS
 * ------------------------------
 * A canvas per icon means a GPU context per icon. Browsers keep roughly 16
 * live contexts on desktop and often only about 8 on mobile Safari, and when
 * the cap is passed the oldest context is dropped: a profile tab with a few of
 * these would knock out the tactical background or the logo hologram. War can
 * already hold four contexts (background, logo, boot sequence, game). Icons are
 * the one thing that must never take one, because there are many of them, they
 * are small, and there is nothing a shader buys at 64px that a stroke does not.
 *
 * Stroked SVG is also the format the reference art actually is: thin lines with
 * a glow. `drop-shadow` on a stroke traces the stroke, so the glow follows the
 * glyph rather than boxing it, which is the mistake the first logo pass made.
 *
 * Glyphs come from lucide, already this project's icon family, rather than
 * being hand drawn. The bracket frame around them is chrome, not an icon, and
 * is drawn in CSS.
 */

/**
 * Maps a bundled asset URL to its replacement glyph.
 *
 * Matching is on the filename stem because Vite fingerprints these imports
 * (`home-3d-icon.png` becomes `/assets/home-3d-icon-a1b2c3.png`), so the call
 * sites can keep passing the imported URL and need no changes at all.
 */
const GLYPHS: ReadonlyArray<readonly [string, LucideIcon]> = [
  // Feed and profile tabs
  ['home-3d-icon', Home],
  ['image-frame-3d-icon', ImageIcon],
  ['filmstrip-3d-icon', Film],
  ['audio-3d-icon', AudioLines],
  ['live-3d-icon', Radio],
  ['fractions-3d-icon', Layers],
  ['comment-3d-icon', MessageSquare],
  ['star-3d-icon', Star],
  ['subs-3d-icon', Users],
  ['lock-3d', Lock],
  ['padlock', Lock],

  // Page titles
  ['bookmark-3d-icon', Bookmark],
  ['bookmark-icon', Bookmark],
  ['messages-3d-icon', Mail],
  ['messages-icon', Mail],
  ['chat-bubble', MessageCircle],
  ['notifications-icon', Bell],
  ['settings-icon', Settings],
  ['profile-icon', User],
  ['communities-title-icon', Users],
  ['glossary-icon', BookOpen],
  ['governance-shield', ShieldCheck],
  ['trophy-icon', Trophy],
  ['stages-mic-icon', Mic],
  ['careers-briefcase', Briefcase],
  ['features-lightbulb', Lightbulb],
  ['trending-fire-icon', Flame],
  ['ppv-ticket-icon', Ticket],
  ['lava-lamp-icon', Lamp],
  ['dehub-originals', Clapperboard],

  // Crosshair rather than a magnifier: on a tactical readout, search reads as
  // acquiring a target. Both search assets map to it.
  ['search-3d-icon', Crosshair],
  ['search-icon', Crosshair],

  // Assistant. Sparkles is the closest stroked equivalent to the glossy star.
  ['ai-sparkle-icon', Sparkles],
  ['ai-star-icon', Sparkles],

  // The prompt landing's wand. Not a "-3d-icon" asset, but the same glossy
  // treatment and the same problem under War.
  ['wand', Wand2],
];

/*
 * DELIBERATELY NOT MAPPED, even though they are images of a similar size:
 *
 *   dehub-coin, and the token logos (eth, btc, usdc, usdt, bnb, base, solana)
 *     Currency marks. A stroked glyph would misrepresent which asset is being
 *     shown, and a glowing coin reads as a status light.
 *   medal-1 through medal-10
 *     Leaderboard ranks. The artwork encodes the placing; a single glyph would
 *     erase the distinction between first and tenth.
 *   ai-logos/*, logo-*, and the game category art
 *     Third party brands and cover art. Substituting someone else's mark for a
 *     generic glyph misrepresents them.
 *   dehub-logo-compact / dehub-logo-white
 *     The brand mark, handled by WarLogo as a hologram instead.
 */

/** Resolve the glyph for an asset URL, or null when it is not one of ours. */
export function resolveWarGlyph(src: string): LucideIcon | null {
  for (const [stem, Glyph] of GLYPHS) {
    if (src.includes(stem)) return Glyph;
  }
  return null;
}

interface WarHudIconProps {
  /** The original asset URL. Used only to pick the replacement glyph. */
  src: string;
  alt: string;
  /** Sizing classes from the call site, applied to the frame. */
  className?: string;
}

/**
 * Renders the HUD glyph, or null when the source is not a mapped asset so the
 * caller can fall back to its original image rather than showing a blank.
 */
export function WarHudIcon({ src, alt, className }: WarHudIconProps) {
  const Glyph = resolveWarGlyph(src);
  if (!Glyph) return null;

  return (
    <span
      data-war-hud-icon
      className={className}
      role="img"
      aria-label={alt}
    >
      <Glyph strokeWidth={1.5} aria-hidden="true" />
    </span>
  );
}

type BrandIconProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
};

/**
 * Drop-in replacement for the `<img>` tags that render the glossy page and tab
 * artwork.
 *
 * Accepts and forwards every img attribute, so adopting it at a call site is a
 * pure tag rename with the attributes untouched. That matters: there are around
 * thirty of these, and a rename cannot silently change layout the way
 * rewriting each one by hand could.
 *
 * Under War, when the asset has a mapped glyph, it renders the HUD icon and the
 * img-only attributes (loading, fetchPriority, width) are simply not relevant.
 * Everywhere else, and for any unmapped asset, it renders exactly the image the
 * call site asked for.
 *
 * `object-contain` is dropped on the HUD path deliberately: it is meaningless
 * for an inline-flex glyph and would not apply anyway.
 */
export function BrandIcon({ src, alt = '', className, ...imgProps }: BrandIconProps) {
  const { theme } = useAppTheme();

  if (theme === 'war' && resolveWarGlyph(src)) {
    return (
      <WarHudIcon
        src={src}
        alt={alt}
        className={className?.replace(/\bobject-(contain|cover)\b/g, '').trim()}
      />
    );
  }

  return <img src={src} alt={alt} className={className} {...imgProps} />;
}

export default WarHudIcon;
