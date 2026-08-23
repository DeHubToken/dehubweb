/**
 * Signed-out welcome panel on the home feed, in the "SM Template 2.0" banner
 * style (the dehub-banner skill's kit/compose.mjs — same design language as the
 * live blog banners and per-route OG cards).
 *
 * Two jobs, both SEO:
 *
 * 1. dehub.net 301s into dehub.io/, and a 301 only carries a ranking if the
 *    DESTINATION can hold the query. The old marketing site explained what
 *    DeHub was in prose; the feed it now redirects into gave crawlers ~149
 *    words of nav plus scraped post titles, so the brand term had nothing to
 *    land on. This is the missing copy.
 *
 * 2. "DeHub" is a contested string — DePaul's student portal, deHUB Access,
 *    a diagnostics clinic app and Rowan's DEHub all answer to it. Establishing
 *    the entity in crawlable body copy is how Google learns the token can mean
 *    us, so the disambiguation sentence is load-bearing, not filler.
 *
 * Rendered ONLY when signed out, so the existing community's feed is untouched.
 * Googlebot is signed out AND starts with empty localStorage, so it always sees
 * the panel — and so does every first-time human visitor. The copy is therefore
 * never bot-only, and there is no bot/browser divergence to defend. Keep SLIDES
 * and ENTITY_COPY in sync with HOME_INTRO_HTML in CLOUDFLARE_WORKER_SEO.js.
 *
 * Every slide's text stays mounted — slides are stacked in one grid cell and
 * cross-faded, never conditionally rendered. All three stay indexable whichever
 * is showing, and the panel is sized by the tallest, so rotation causes no CLS.
 *
 * DELIBERATELY IN-FLOW, not a fixed overlay. A dismissible panel that pushes the
 * feed down is a banner; one that covers the feed on load is an intrusive
 * interstitial — a mobile ranking signal against the very URL this exists to
 * rank. Do not convert it to a modal.
 *
 * The HUD chrome (the two mono boxes and the QR) is rounded here even though
 * compose.mjs draws it hard-square: this panel sits in the feed next to rounded
 * cards, not on a standalone poster. Do NOT branch on theme to square it again
 * for minimal/light — index.css already forces border-radius:0 on everything
 * except [data-keep-round] under those two, so they square themselves.
 *
 * Story structure (progress pills, 3 auto-advancing slides, cross-fade + rise)
 * mirrors dehub-mobile's screens/auth/OnboardingScreen.tsx, so first-time web
 * visitors meet the same intro as first-time app downloaders.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'dehub.homeIntroDismissed';
/** Mobile uses 3000ms; web slides carry more text and are read, not swiped. */
const SLIDE_MS = 5200;

/** Slide copy mirrors SLIDES in dehub-mobile's OnboardingScreen.tsx.
 *  `sub` / `extra` are the `//snake_case` HUD row under the headline. */
const SLIDES = [
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

const LINKS: { to: string; label: string }[] = [
  { to: '/guides/what-is-watch-to-earn', label: 'What is watch-to-earn?' },
  { to: '/guides/tokenized-subscriptions-explained', label: 'Tokenised subscriptions' },
  { to: '/guides/web3-live-streaming-decentralised-twitch-alternative', label: 'Web3 live streaming' },
  { to: '/guides/decentralised-social-media-explained-uk', label: 'Decentralised social media' },
  { to: '/docs/token/overview', label: 'The DHB currency' },
  { to: '/guides/what-is-dehub', label: 'What is DeHub?' },
];

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

/** NO motion blur on the trailing characters. compose.mjs smears the last few
 *  glyphs of the headline and the sub row, which works on a 106–164px still
 *  rendered by resvg. Scaled down to this panel's ~50px headline the same effect
 *  just reads as badly rendered text — the "py" of HAPPY looks like a font bug,
 *  not motion. Kept deliberately out of sync with the banner kit. */

export function HomeIntro() {
  const { isAuthenticated, openLoginModal } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  const [runId, setRunId] = useState(0);
  const paused = useRef(false);

  const show = !(isAuthenticated || dismissed);

  useEffect(() => {
    if (!show) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => {
      if (paused.current) return;
      setActive((i) => (i + 1) % SLIDES.length);
      setRunId((r) => r + 1);
    }, SLIDE_MS);
    return () => window.clearInterval(t);
  }, [show]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* dismissal just won't persist */
    }
  }, []);

  const goTo = useCallback((i: number) => {
    setActive(i);
    setRunId((r) => r + 1);
  }, []);

  if (!show) return null;

  return (
    <section
      aria-labelledby="dehub-intro-heading"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
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
          alt=""
          width={480}
          height={471}
          loading="lazy"
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
        style={{ backgroundImage: 'url(/brand-kit/brand/grain.png)', backgroundSize: '240px 240px' }}
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
            <img src="/brand-kit/brand/wordmark-black.png" alt="DeHub" width={74} height={18} className="h-[18px] w-auto" />
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
              onClick={dismiss}
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
              onClick={() => goTo(i)}
              aria-label={`Show slide ${i + 1}: ${s.title} ${s.subtitle}`}
              aria-current={i === active ? 'true' : undefined}
              className="h-2 w-[47px] overflow-hidden rounded-full bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
            >
              <span
                key={`${i}-${runId}`}
                className={cn('block h-full rounded-full bg-white', i === active && 'motion-safe:animate-[dehub-pill_var(--pill-ms)_linear_forwards]')}
                style={{ '--pill-ms': `${SLIDE_MS}ms`, width: i > active ? '0%' : '100%' } as React.CSSProperties}
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
          <Button type="button" variant="glass" size="lg" onClick={() => openLoginModal()}>
            Join DeHub
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/guide">Take the tour</Link>
          </Button>
        </div>

        {/* Entity + disambiguation copy. Clamped on mobile only — unclamped the
            panel pushed the feed and both CTAs off a 390x844 screen. Height
            clamp, not conditional rendering, so every word stays in the DOM. */}
        <div className="mt-6 border-t border-white/10 pt-4">
          {/* line-clamp, not a height clamp with a fade: the plate is a silk
              texture, so a to-black fade rendered as a grey bar across it.
              Clamping to whole lines cuts cleanly and needs no scrim. Still a
              clamp rather than conditional rendering — every word stays in the
              DOM in both states, matching the worker's HTML. */}
          <div className="text-[13px] leading-relaxed text-zinc-300">
            <p className={cn(expanded ? '' : 'dehub-intro-clamp')}>{ENTITY_COPY}</p>
          </div>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="dehub-intro-readmore mt-2 text-[11px] uppercase tracking-[0.12em] text-zinc-400 hover:text-white"
              style={{ fontFamily: MONO }}
            >
              // read_more
            </button>
          )}
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
            <span style={{ color: 'rgba(255,255,255,.38)' }}>//</span>dehub.io
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

export default HomeIntro;
