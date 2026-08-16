import type React from 'react';
import {
  AudioLines,
  BarChart3,
  Bookmark,
  CalendarDays,
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
  Gamepad2,
  Lamp,
  Lightbulb,
  LayoutDashboard,
  Lock,
  MessageCircle,
  Megaphone,
  Mic,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
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
  ['arcade.webp', Gamepad2],
  ['stores.webp', Store],
  ['bounties.webp', Briefcase],
  ['events.webp', CalendarDays],
  ['stats.webp', BarChart3],
  ['ads.webp', Megaphone],
  ['command.webp', LayoutDashboard],

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

export type ThemeIconKey =
  | 'home' | 'posts' | 'images' | 'videos' | 'subscriptions' | 'audio'
  | 'live' | 'fractions' | 'pinned' | 'search' | 'messages' | 'bookmarks'
  | 'wand' | 'communities' | 'careers' | 'features' | 'glossary'
  | 'governance' | 'trophy' | 'notifications' | 'settings' | 'stages'
  | 'assistant' | 'lock' | 'profile' | 'arcade' | 'stores' | 'bounties'
  | 'events' | 'stats' | 'ads' | 'command';

/**
 * Raster icon replacements shared by every non-War themed page.
 *
 * Like GLYPHS, matching uses the unhashed part of Vite's asset URL. Keeping
 * this in BrandIcon means a page opts into every themed set once; page
 * components never grow theme branches or import twenty-four variants.
 */
const THEME_ICON_KEYS: ReadonlyArray<readonly [string, ThemeIconKey]> = [
  ['home-3d-icon', 'home'],
  ['comment-3d-icon', 'posts'],
  ['image-frame-3d-icon', 'images'],
  ['filmstrip-3d-icon', 'videos'],
  ['subs-3d-icon', 'subscriptions'],
  ['audio-3d-icon', 'audio'],
  ['live-3d-icon', 'live'],
  ['fractions-3d-icon', 'fractions'],
  ['star-3d-icon', 'pinned'],
  ['search-3d-icon', 'search'],
  ['search-icon', 'search'],
  ['messages-3d-icon', 'messages'],
  ['messages-icon', 'messages'],
  ['chat-bubble', 'messages'],
  ['bookmark-3d-icon', 'bookmarks'],
  ['bookmark-icon', 'bookmarks'],
  ['wand', 'wand'],
  ['communities-title-icon', 'communities'],
  ['careers-briefcase', 'careers'],
  ['features-lightbulb', 'features'],
  ['glossary-icon', 'glossary'],
  ['governance-shield', 'governance'],
  ['trophy-icon', 'trophy'],
  ['notifications-icon', 'notifications'],
  ['settings-icon', 'settings'],
  ['stages-mic-icon', 'stages'],
  ['ai-sparkle-icon', 'assistant'],
  ['ai-star-icon', 'assistant'],
  ['lock-3d', 'lock'],
  ['padlock', 'lock'],
  ['profile-icon', 'profile'],
  ['dehub-originals', 'videos'],
  ['arcade.webp', 'arcade'],
  ['stores.webp', 'stores'],
  ['bounties.webp', 'bounties'],
  ['events.webp', 'events'],
  ['stats.webp', 'stats'],
  ['ads.webp', 'ads'],
  ['command.webp', 'command'],
];

const FULL_RASTER_THEMES = new Set(['hazy', 'swarms', 'winter', 'osaka', 'jungle']);
const SYSTEM_REFRESHED_KEYS = new Set<ThemeIconKey>([
  'home', 'posts', 'images', 'videos', 'subscriptions', 'audio', 'live',
  'fractions', 'pinned', 'search', 'messages', 'bookmarks',
  'wand', 'communities', 'careers', 'features', 'glossary', 'governance',
  'trophy', 'notifications', 'settings', 'stages', 'assistant', 'lock', 'profile',
  'arcade', 'stores', 'bounties', 'events', 'stats', 'ads', 'command',
]);

const THEME_KEY_GLYPHS: Record<ThemeIconKey, LucideIcon> = {
  home: Home,
  posts: MessageSquare,
  images: ImageIcon,
  videos: Film,
  subscriptions: Users,
  audio: AudioLines,
  live: Radio,
  fractions: Layers,
  pinned: Star,
  search: Crosshair,
  messages: Mail,
  bookmarks: Bookmark,
  wand: Wand2,
  communities: Users,
  careers: Briefcase,
  features: Lightbulb,
  glossary: BookOpen,
  governance: ShieldCheck,
  trophy: Trophy,
  notifications: Bell,
  settings: Settings,
  stages: Mic,
  assistant: Sparkles,
  lock: Lock,
  profile: User,
  arcade: Gamepad2,
  stores: Store,
  bounties: Briefcase,
  events: CalendarDays,
  stats: BarChart3,
  ads: Megaphone,
  command: LayoutDashboard,
};

export function resolveThemeIconKey(src: string): ThemeIconKey | null {
  for (const [stem, key] of THEME_ICON_KEYS) {
    if (src.includes(stem)) return key;
  }
  return null;
}

/** Return a public, cacheable WebP URL when this theme owns the icon. */
export function resolveThemeIconAsset(src: string, theme: string): string | null {
  const key = resolveThemeIconKey(src);
  if (!key) return null;
  if (FULL_RASTER_THEMES.has(theme)) return `/theme-icons/${theme}/${key}.webp`;
  if (theme === 'system' && SYSTEM_REFRESHED_KEYS.has(key)) {
    return `/theme-icons/system/${key}.webp`;
  }
  return null;
}

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

  const themedSrc = resolveThemeIconAsset(src, theme) ?? src;
  return <img src={themedSrc} alt={alt} className={className} {...imgProps} />;
}

type ThemedIconProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  icon: ThemeIconKey;
};

/**
 * Semantic icon for empty, error and not-found states.
 *
 * Unlike BrandIcon, callers name the meaning instead of importing a legacy
 * source asset. Full raster themes receive their own artwork, the themes that
 * deliberately keep the normal icon set use the optimized System WebP, and
 * War keeps its tactical HUD glyph.
 */
export function ThemedIcon({ icon, alt = '', className, ...imgProps }: ThemedIconProps) {
  const { theme } = useAppTheme();

  if (theme === 'war') {
    const Glyph = THEME_KEY_GLYPHS[icon];
    return (
      <span
        data-war-hud-icon
        className={className?.replace(/\bobject-(contain|cover)\b/g, '').trim()}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        <Glyph strokeWidth={1.5} aria-hidden="true" />
      </span>
    );
  }

  const rasterTheme = FULL_RASTER_THEMES.has(theme) ? theme : 'system';
  return (
    <img
      src={`/theme-icons/${rasterTheme}/${icon}.webp`}
      alt={alt}
      className={className}
      {...imgProps}
    />
  );
}

export default WarHudIcon;
