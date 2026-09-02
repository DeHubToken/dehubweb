/**
 * The signed-out welcome panel's MARKUP, with no state and no browser access.
 *
 * Split out of HomeIntro so the same component renders twice from one source:
 * at build time into index.html (scripts/build-home-intro-html.mjs, injected by
 * prerenderHomeIntroPlugin in vite.config.ts), so the panel is on screen from
 * the first HTML paint; and at runtime by HomeIntro, whose first render is
 * pixel-identical and simply takes over. That is what makes it a prerender and
 * not a stand-in: the boot-shell lookalike that preceded it was reverted
 * because it matched the card's box and nothing else.
 *
 * Rules that keep the two renders identical:
 * - Nothing in here may read window, document, localStorage or a hook. Slide
 *   index and every handler come in as props; the prerender passes slide 0 and
 *   no-ops, which is exactly HomeIntro's initial state.
 * - Keep the imports to React, react-router's Link, lucide, the Button and cn.
 *   The prerender bundles this file with esbuild for Node; a browser-only
 *   import fails the prerender (the build then falls back to the grey
 *   skeleton card and warns — check the build log if the panel is missing).
 * - Keep SLIDES, ENTITY_COPY and PRESS in sync with HOME_INTRO_HTML /
 *   HOME_INTRO_PRESS in CLOUDFLARE_WORKER_SEO.js, and LINKS with
 *   HOME_INTRO_LINKS there.
 */
import type { CSSProperties, MouseEventHandler, PointerEventHandler } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Mobile uses 3000ms; web slides carry more text and are read, not swiped. */
export const SLIDE_MS = 5200;

/** Slide copy mirrors SLIDES in dehub-mobile's OnboardingScreen.tsx.
 *  `sub` / `extra` are the `//snake_case` HUD row under the headline. */
export const SLIDES = [
  {
    title: 'The Social Media We',
    subtitle: 'All Deserve',
    sub: 'never_deplatformed',
    extra: '99%_revenue',
    description:
      'Instantly monetize, never get deplatformed, keep up to 99% of revenue and create free from censorship or platform manipulation.',
  },
  {
    title: 'The App',
    subtitle: 'For Everyone',
    sub: 'open_source',
    extra: 'no_algorithm',
    description:
      'No algorithms that favor one side of the argument.\u00a0\nEveryone is amplified equally and fairly.',
  },
  {
    title: 'You Will Own Everything,',
    subtitle: 'And Be Happy',
    sub: 'ownership_economy',
    extra: 'user_owned = true',
    description:
      'The ownership economy means your data, assets and audience are yours forever. Even the DeHub network is owned by its users, you.',
  },
] as const;

const ENTITY_COPY =
  'DeHub is an open-source, user owned entertainment platform offering full feature social media, gaming experiences, streaming services, content creation tools and a plethora of peer-to-peer utilities. Monetize without permission and from your first view, never fearing the algorithm again.';

/* Docs lead, guides follow. The two /docs entries at the front are the pages
   that answer "what is this" outright — the guides are all downstream of that
   question, so leading with a feature explainer asked a visitor to care about
   watch-to-earn before knowing what DeHub is. /docs/faq also emits FAQPage
   JSON-LD at the edge (faqJsonLd in CLOUDFLARE_WORKER_SEO.js), so a home-page
   link into it is worth more than another sibling guide.
   Keep in sync with HOME_INTRO_LINKS in CLOUDFLARE_WORKER_SEO.js. */
const LINKS: { to: string; label: string }[] = [
  { to: '/docs/overview', label: 'DeHub overview' },
  { to: '/docs/faq', label: 'Frequently asked questions' },
  { to: '/guides/what-is-watch-to-earn', label: 'What is watch-to-earn?' },
  { to: '/guides/tokenized-subscriptions-explained', label: 'Tokenised subscriptions' },
];

/* Press strip under the entity copy. Four outlets, set as WORDMARKS rather than
   logo images on purpose:

   - There are no publisher logo files in this repo, and there should not be.
     Shipping four third-party trademarks as raster assets means hosting other
     people's marks, at every DPR, forever, and re-cutting them whenever an
     outlet rebrands. Type we already load costs nothing and never goes stale.
   - The panel is monochrome. Real press logos arrive in four different brand
     colours and would be the only colour on the plate; greyscaling them just
     makes them look broken rather than deliberate.

   Every item links INTERNALLY to /docs/featured-in, not out to the article.
   This panel exists to rank the signed-out home page, and four external
   dofollow links on it would bleed the exact equity it is here to gather —
   /docs/featured-in already carries the real article links, so a wordmark is
   one hop from the piece and the crawl stays in-site.

   `reach` is title-attribute text only. It is on /docs/featured-in already and
   the strip is far too small to carry it visually. */
const PRESS = [
  { outlet: 'US Weekly', reach: '50M+ readers' },
  { outlet: 'Yahoo Finance', reach: "World's largest business news platform" },
  { outlet: 'Entrepreneur', reach: '20M+ monthly users' },
  { outlet: 'Investing.com', reach: '46M+ monthly users' },
] as const;

/* --- design tokens, lifted verbatim from kit/compose.mjs ------------------ */
const MONO = "'Cascadia Mono','Consolas','DejaVu Sans Mono','Menlo',monospace";
const HEAD_FILL = 'linear-gradient(180deg,#fff 4%,#dcdcdf 38%,#8b8b92 78%,#6f6f76 100%)';
const SUB_FILL = 'linear-gradient(180deg,#e8e8ea,#9a9aa1)';
/** Keeps the left column readable over the hero art. */
const SCRIM =
  'linear-gradient(90deg,rgba(0,0,0,.74) 0%,rgba(0,0,0,.6) 32%,rgba(0,0,0,.12) 58%,transparent 72%)';
const VIGNETTE = 'radial-gradient(120% 130% at 50% 40%, transparent 40%, rgba(0,0,0,.72) 100%)';
const DOTS = 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.4px)';
const GLOW = 'radial-gradient(closest-side,rgba(255,255,255,.17),transparent 70%)';
const clipText = (fill: string) => ({
  backgroundImage: fill,
  WebkitBackgroundClip: 'text' as const,
  backgroundClip: 'text' as const,
  color: 'transparent',
});

/** Scattered ✕ / + / · marks — deterministic positions from compose.mjs marks(). */
const MARKS = [[6, 16], [22, 8], [47, 12], [70, 9], [88, 18], [9, 52], [90, 48], [14, 84], [38, 90], [63, 86], [84, 80], [52, 46]] as const;
const SEED = 4;

export interface HomeIntroPanelProps {
  /** Index of the visible slide. The prerender passes 0. */
  active: number;
  /** Bumped on every slide change so the active pill's fill animation restarts. */
  runId: number;
  onDismiss: () => void;
  onGoTo: (index: number) => void;
  onJoin: () => void;
  /** Warms the login sheet chunk on hover / pointer-down of the primary CTA. */
  onWarmLogin?: PointerEventHandler<HTMLButtonElement> & MouseEventHandler<HTMLButtonElement>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function HomeIntroPanel({
  active,
  runId,
  onDismiss,
  onGoTo,
  onJoin,
  onWarmLogin,
  onMouseEnter,
  onMouseLeave,
}: HomeIntroPanelProps) {
  return (
    <section
      aria-labelledby="dehub-intro-heading"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="dehub-intro relative mx-2 mb-3 overflow-hidden rounded-2xl border border-white/10 bg-black sm:mx-3 lg:mx-3"
    >
      {/* --- plate: silk texture, vignette, dot grid, marks, scrim, grain --- */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-90"
        style={{ backgroundImage: 'url(/brand-kit/bg/bg-16.jpg)' }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: VIGNETTE }} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ backgroundImage: DOTS, backgroundSize: '26px 26px' }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(255,255,255,.28)' }}>
        {MARKS.map(([x, y], i) => (
          <span
            key={`${x}-${y}`}
            className="absolute"
            style={{ left: `${x}%`, top: `${y}%`, opacity: 0.14 + ((i * 7 + SEED * 13) % 10) / 45 }}
          >
            {(i + SEED) % 3 === 0 ? '✕' : (i + SEED) % 3 === 1 ? '+' : '·'}
          </span>
        ))}
      </div>
      {/* Hero art, right. Rendered at EVERY width — phones used to get no art
          at all, which left the panel as a wall of text. On a narrow column it
          shrinks and dims, sitting inside the panel level with the headline;
          sizing lives in .dehub-intro-hero (index.css), keyed
          to the panel's own width, not the viewport's. 46KB, lazy — cheap
          enough for a phone. Anchored to the headline band rather than the
          panel's vertical centre — the banner template is pure art, but this
          panel carries body copy underneath and a centred hero sits straight
          on top of it. */}
      <div aria-hidden="true" className="dehub-intro-hero pointer-events-none absolute">
        <div className="absolute inset-0" style={{ background: GLOW, borderRadius: '50%' }} />
        <img
          src="/brand-kit/icons/globe-480.webp"
          /* The hero renders at 96–260 CSS px (see .dehub-intro-hero); a phone
             was pulling the 480 for a 112 px slot. */
          srcSet="/brand-kit/icons/globe-240.webp 240w, /brand-kit/icons/globe-480.webp 480w"
          sizes="(max-width: 519px) 112px, (max-width: 759px) 180px, 260px"
          alt=""
          width={480}
          height={471}
          /* NOT loading="lazy". This panel is the first thing on the signed-out
             home page, so the hero is always above the fold — lazy told the
             browser to defer the largest piece of the only card on screen, and
             the sidebars (text + inline SVG, zero requests) beat it every time.
             Deferring an above-the-fold image delays the thing it decorates. */
          /* Lowercase on purpose: React 18 drops the camelCase fetchPriority prop
             with a warning (it only learnt it in 19), so the hint never reached
             the DOM. A lowercase unknown attribute is passed through as-is, by
             the client and by the prerender alike. */
          {...({ fetchpriority: 'high' } as Record<string, string>)}
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain"
          style={{ filter: 'drop-shadow(0 34px 60px rgba(0,0,0,.85))' }}
        />
      </div>
      {/* Scrim over the hero so the left column stays readable, plus a bottom
          fade so the art never competes with the entity paragraph. Now at every
          width, because the art is at every width — this is what stops the
          headline fighting the globe in a squeezed column. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />
      {/* All breakpoints, not just desktop: the body copy sits over the
          brightest part of the silk plate and needs the falloff to stay legible. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.82) 58%, #000 100%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.16] mix-blend-overlay"
        /* -web.webp, not the kit's grain.png: that one is a 240x240 32-bit PNG
           of pure noise — the worst case for any codec — at 43 KB, for a
           texture drawn at 0.16 opacity under mix-blend-overlay. A 120 tile in
           WebP is 10.7 KB and, at that opacity, indistinguishable; it also
           repeats less visibly. The PNG stays put for the poster kit, which
           renders at print size and does want the full-resolution grain. */
        style={{ backgroundImage: 'url(/brand-kit/brand/grain-web.webp)', backgroundSize: '120px 120px' }}
      />
      {/* Card inset frame — ~14px, faint 1px white border. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-[10px] rounded-[14px] border border-white/[0.10] sm:inset-[14px]" />

      {/* --- HUD chrome ---------------------------------------------------- */}
      <div className="relative z-10 px-5 py-5 sm:px-8 sm:py-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          {/* White DEHUB pill, ALWAYS top-left (blog cards crop object-bottom). */}
          <span
            className="inline-flex items-center rounded-[14px] bg-[#f4f4f2] px-4 py-2"
            style={{ boxShadow: '0 0 34px rgba(255,255,255,.38), 0 0 90px rgba(255,255,255,.14)' }}
          >
            {/* -web.webp: the kit's wordmark-black.png is 1752x417 for a logo
                drawn 18px tall — a 23x linear oversample, 45 KB. This is 222x53
                (3x, covering every DPR that exists) at 3 KB. The PNG stays: it
                is byte-identical to /brand/wordmark-black.png, which the brand
                assets page offers as a download. */}
            <img src="/brand-kit/brand/wordmark-black-web.webp" alt="DeHub" width={74} height={18} className="h-[18px] w-auto" />
          </span>
          <div className="flex items-center gap-2">
            <span
              className="dehub-intro-wide rounded-xl border border-white/[0.22] bg-[rgba(10,10,12,.35)] px-3 py-1.5 text-[13px] tracking-[0.02em]"
              style={{ fontFamily: MONO, color: 'rgba(255,255,255,.66)' }}
            >
              <span style={{ color: 'rgba(255,255,255,.38)' }}>{'// type ='}</span> &ldquo;welcome&rdquo;
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss welcome"
              className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <h2 id="dehub-intro-heading" className="sr-only">
          Welcome to DeHub — the open-source, user-owned social platform
        </h2>

        {/* Progress pills — 47x8, white on white/25 (mobile ProgressPill). */}
        <div className="mb-4 flex gap-1.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => onGoTo(i)}
              aria-label={`Show slide ${i + 1}: ${s.title} ${s.subtitle}`}
              aria-current={i === active ? 'true' : undefined}
              className="h-2 w-[47px] overflow-hidden rounded-full bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
            >
              <span
                key={`${i}-${runId}`}
                className={cn('block h-full rounded-full bg-white', i === active && 'motion-safe:animate-[dehub-pill_var(--pill-ms)_linear_forwards]')}
                style={{ '--pill-ms': `${SLIDE_MS}ms`, width: i > active ? '0%' : '100%' } as CSSProperties}
              />
            </button>
          ))}
        </div>

        {/* Slide stage — all three stacked in one grid cell (no CLS on rotate).
            Right padding on desktop reserves the hero's column so the headline
            never runs underneath it (compose.mjs: hero must not collide). */}
        <div className="dehub-intro-stage grid">
          {SLIDES.map((s, i) => (
            <div
              key={s.title}
              aria-hidden={i === active ? undefined : 'true'}
              className={cn(
                'col-start-1 row-start-1 transition-[opacity,transform] duration-300 ease-out',
                i === active ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-5 opacity-0'
              )}
            >
              <p
                className="dehub-intro-head font-exo font-bold uppercase leading-[0.92] tracking-[-0.015em]"
                style={{ ...clipText(HEAD_FILL), filter: 'drop-shadow(0 2px 24px rgba(255,255,255,.09))' }}
              >
                {s.title}
                <br />
                {s.subtitle}
              </p>

              {/* Sub row: //snake_case + mono extra + ✕. */}
              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 sm:gap-x-8">
                <span
                  className="font-exo text-base font-semibold uppercase tracking-[0.01em] sm:text-xl"
                  style={clipText(SUB_FILL)}
                >
                  <span style={{ color: 'rgba(255,255,255,.45)', WebkitTextFillColor: 'rgba(255,255,255,.45)' }}>//</span>
                  {s.sub}
                </span>
                <span className="dehub-intro-wide text-[12px] tracking-[0.04em]" style={{ fontFamily: MONO, color: 'rgba(255,255,255,.66)' }}>
                  {s.extra}
                </span>
                <span className="text-sm font-light" style={{ color: 'rgba(255,255,255,.55)' }}>✕</span>
              </div>

              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/55">{s.description}</p>
            </div>
          ))}
        </div>

        {/* The app's own liquid-glass buttons — monochrome, and consistent with
            every other CTA in the product. The earlier solid white/black pair
            was invented here and matched nothing else. */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="glass"
            size="lg"
            onClick={onJoin}
            onPointerDown={onWarmLogin}
            onMouseEnter={onWarmLogin}
          >
            Join DeHub
          </Button>
          {/* Secondary CTA points at the docs home, not /guide. Relabelled with
              it: a button promising a "tour" that lands on documentation is a
              broken promise, and the honest label is the cheap half of the
              change. Temporary — restoring /guide means restoring both the
              href and the label here and in CLOUDFLARE_WORKER_SEO.js. */}
          <Button asChild variant="outline" size="lg">
            <Link to="/docs">Read the docs</Link>
          </Button>
        </div>

        {/* Entity + disambiguation copy. Clamped on narrow containers only —
            unclamped, the panel pushed the feed and both CTAs off a 390x844
            screen. A line clamp rather than conditional rendering, so every
            word stays in the DOM at every width and matches the worker's HTML.

            There is deliberately NO expander. The `// read_more` button that
            used to sit here was dead weight: on a wide container the copy is
            already unclamped and index.css hid the button outright, and on a
            narrow one it bought three more lines of text nobody was asking for
            while pushing the CTAs further down the very screen the clamp exists
            to protect. Removing it also drops the panel's last piece of local
            state. If the truncation ever needs undoing, unclamp — don't
            reintroduce a toggle. */}
        <div className="mt-6 border-t border-white/10 pt-4">
          {/* line-clamp, not a height clamp with a fade: the plate is a silk
              texture, so a to-black fade rendered as a grey bar across it.
              Clamping to whole lines cuts cleanly and needs no scrim. */}
          <div className="text-[13px] leading-relaxed text-zinc-300">
            <p className="dehub-intro-clamp">{ENTITY_COPY}</p>
          </div>
        </div>

        {/* --- featured in --------------------------------------------------
            A marquee, not a static row. Four wordmarks at a legible size
            overflow the narrow column this panel is built for — it is
            container-queried down to ~320px — and letting them wrap turned a
            one-line credential strip into a three-line block that pushed both
            CTAs further off a small screen. Scrolling keeps it one line at
            every width.

            The track holds the list TWICE and translates exactly -50%, which is
            what makes the loop seamless. The second copy is aria-hidden and
            untabbable so each outlet is announced and focused once, not twice.

            Motion is CSS-only and pauses on hover; prefers-reduced-motion turns
            it off entirely and hands the strip back as a normal scroller (see
            index.css) — a permanently moving element is exactly what that
            setting is for. */}
        <div className="dehub-press mt-4">
          <span
            className="text-[11px] uppercase tracking-[0.12em] text-zinc-500"
            style={{ fontFamily: MONO }}
          >
            // featured_in
          </span>
          {/* <nav>, not a div: this is a labelled set of links, and aria-label
              on a generic element is ignored by most screen readers. */}
          <nav className="dehub-press-viewport mt-2" aria-label="DeHub in the press">
            <div className="dehub-press-track">
              {[0, 1].map((copy) => (
                <div
                  key={copy}
                  className="dehub-press-set"
                  aria-hidden={copy === 1 ? 'true' : undefined}
                >
                  {PRESS.map((p) => (
                    <Link
                      key={p.outlet}
                      to="/docs/featured-in"
                      title={`${p.outlet} — ${p.reach}`}
                      tabIndex={copy === 1 ? -1 : undefined}
                      className="font-exo text-sm font-semibold uppercase tracking-[0.06em] text-white/50 transition-colors hover:text-white/85"
                    >
                      {p.outlet}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </nav>
        </div>

        <nav aria-label="Learn more about DeHub" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="text-zinc-400 underline underline-offset-2 hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Footer HUD: //dehub.io box bottom-left, QR bottom-right. */}
        <div className="mt-5 flex items-end justify-between gap-4">
          <span
            className="rounded-xl border border-white/[0.22] bg-[rgba(10,10,12,.35)] px-3 py-1.5 text-[13px] tracking-[0.02em]"
            style={{ fontFamily: MONO, color: 'rgba(255,255,255,.66)' }}
          >
            <span style={{ color: 'rgba(255,255,255,.5)' }}>//</span>dehub.io
          </span>
          <img
            src="/brand-kit/brand/qr-dehub-io.png"
            alt="QR code linking to dehub.io"
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
            className="h-14 w-14 rounded-xl border border-white/[0.22] bg-[rgba(10,10,12,.35)] p-1.5"
          />
        </div>
      </div>
    </section>
  );
}
