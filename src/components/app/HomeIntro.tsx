/**
 * Signed-out welcome panel on the home feed.
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
 * and ENTITY_COPY in sync with HOME_INTRO_HTML in CLOUDFLARE_WORKER_SEO.js,
 * which mirrors them into the prerendered bot HTML.
 *
 * Every slide's text stays mounted in the DOM at all times — slides are stacked
 * in one grid cell and cross-faded with opacity, never conditionally rendered.
 * That keeps all three indexable regardless of which one is showing, and means
 * the panel's height is the tallest slide's height, so rotating never shifts
 * layout (CLS).
 *
 * DELIBERATELY IN-FLOW, not a fixed/absolute overlay. A dismissible panel that
 * pushes the feed down is a banner; one that covers the feed on load is an
 * intrusive interstitial, which is a mobile ranking signal against exactly the
 * URL this component exists to rank. Do not convert it to a modal.
 *
 * Visual language is the DeHub design system (.agents/skills/dehub-poster):
 * machined graphite canvas + blueprint dot grid, chrome-gradient display type,
 * `//` mono annotation stamps, live-green as the only permitted colour. The
 * story-slide structure (progress pills, 3 slides, auto-advance, cross-fade +
 * rise) mirrors the mobile app's OnboardingScreen so first-time web visitors
 * meet the same intro as first-time app downloaders.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import dehubWordmark from '@/assets/dehub-logo-white.png';

const DISMISS_KEY = 'dehub.homeIntroDismissed';
/** Mobile uses 3000ms; web slides carry more text and are read, not swiped. */
const SLIDE_MS = 5200;

/** Mirrors SLIDES in the mobile app's screens/auth/OnboardingScreen.tsx. */
const SLIDES = [
  {
    title: 'The Social Media We',
    subtitle: 'All Deserve',
    description:
      'Instantly monetize, never get deplatformed, keep up to 99% of revenue and create free from censorship or platform manipulation.',
  },
  {
    title: 'The App',
    subtitle: 'For Everyone',
    description:
      'No algorithms that favor one side of the argument. Everyone is amplified equally and fairly with open source code.',
  },
  {
    title: 'You Will Own Everything,',
    subtitle: 'And Be Happy',
    description:
      'The ownership economy means your data, assets and audience are yours forever. Even the DeHub network is owned by its users, you.',
  },
] as const;

const ENTITY_COPY =
  'DeHub is a decentralised social network and mobile app, in development since 2021, where every post is minted on-chain and creators keep their audience, their content and their revenue. It combines a chronological feed, live streaming, end-to-end encrypted messaging, user-run communities, a multi-chain wallet and watch-to-earn rewards paid in DHB. If you arrived looking for a different DeHub, this is not DePaul University’s student portal, Rowan’s DEHub or the deHUB Access door-entry app.';

const LINKS: { to: string; label: string }[] = [
  { to: '/guides/what-is-watch-to-earn', label: 'What is watch-to-earn?' },
  { to: '/guides/tokenized-subscriptions-explained', label: 'Tokenised subscriptions' },
  { to: '/guides/web3-live-streaming-decentralised-twitch-alternative', label: 'Web3 live streaming' },
  { to: '/guides/decentralised-social-media-explained-uk', label: 'Decentralised social media' },
  { to: '/docs/token/overview', label: 'The DHB currency' },
  { to: '/guides/what-is-dehub', label: 'What is DeHub?' },
];

/** Design-system tokens — matched against the reference boards in
 *  .agents/skills/dehub-poster/assets/reference/, not just the SKILL.md prose. */
const CANVAS = 'radial-gradient(120% 90% at 50% -10%, #15181e, #0a0b0d 55%, #060708)';
/** Blueprint grid: ruled lines with brighter dots at the intersections. */
const GRID_LINES =
  'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)';
const GRID_DOTS = 'radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1.4px)';
/** Soft off-axis key light — the drapery/light-shaft wash on the boards. */
const KEY_LIGHT =
  'radial-gradient(90% 120% at 12% 0%, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 38%, transparent 68%)';
/** Brushed-metal display fill. Angled with a bright hotspot past the midpoint,
 *  so the headline reads as lit steel rather than a flat vertical ramp. */
const CHROME_TEXT =
  'linear-gradient(100deg, #6f747c 0%, #9aa0a9 26%, #ffffff 52%, #eef1f4 63%, #a8aeb7 82%, #7b818a 100%)';

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
  // Restart the pill fill on every slide change, including manual jumps.
  const [runId, setRunId] = useState(0);
  const paused = useRef(false);

  const show = isAuthenticated || dismissed ? false : true;

  useEffect(() => {
    if (!show) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // no auto-advance; pills stay operable by click
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
      className="relative mx-2 mb-3 overflow-hidden rounded-2xl border border-white/10 sm:mx-3 lg:mx-3"
      style={{ background: CANVAS }}
    >
      {/* Blueprint grid: ruled lines on a 28px pitch with brighter intersection
          dots, as on the reference boards — not dots alone. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `${GRID_DOTS}, ${GRID_LINES}`,
          backgroundSize: '28px 28px, 28px 28px, 28px 28px',
        }}
      />
      {/* Off-axis key light. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: KEY_LIGHT }} />
      {/* Brand grain plate (240px tile) — every DeHub surface carries it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay"
        style={{ backgroundImage: 'url(/brand-kit/brand/grain.png)', backgroundSize: '240px 240px' }}
      />
      {/* Thin inset frame, 18px radius per the statement template. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[10px] rounded-[18px] border border-white/[0.07] sm:inset-[14px]"
      />

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute right-2.5 top-2.5 z-20 rounded-xl p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative z-10 px-5 py-5 sm:px-8 sm:py-7">
        {/* Eyebrow: `//` mono stamp + live-green status pill (the one colour
            the design system permits on the monochrome base). */}
        <div className="mb-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          <span>// welcome</span>
          <span className="flex items-center gap-1.5 text-[#34e0a1]">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#34e0a1]"
              style={{ boxShadow: '0 0 12px rgba(52,224,161,0.55)' }}
            />
            live
          </span>
        </div>

        <h2 id="dehub-intro-heading" className="sr-only">
          Welcome to DeHub — the open-source, user-owned social platform
        </h2>

        {/* Progress pills — 47x8, track white/25, fill white (mobile ProgressPill). */}
        <div className="mb-5 flex gap-1.5">
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
                className={cn(
                  'block h-full rounded-full bg-white',
                  i === active && 'motion-safe:animate-[dehub-pill_var(--pill-ms)_linear_forwards]'
                )}
                style={{
                  '--pill-ms': `${SLIDE_MS}ms`,
                  // Active resolves to 100% so a reduced-motion viewer (who gets
                  // no animation and no auto-advance) still sees which slide is
                  // current; the animation drives 0 -> 100 when motion is allowed.
                  width: i > active ? '0%' : '100%',
                } as React.CSSProperties}
              />
            </button>
          ))}
        </div>

        {/* Slide stage: all three stacked in one grid cell so the tallest sets
            the height once and rotation never shifts layout. */}
        <div className="grid">
          {SLIDES.map((s, i) => (
            <div
              key={s.title}
              aria-hidden={i === active ? undefined : 'true'}
              className={cn(
                'col-start-1 row-start-1 transition-[opacity,transform] duration-300 ease-out',
                i === active ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-5'
              )}
            >
              {/* Oversized chrome headline, then the subtitle a step down in
                  size and weight — the AFFILIATES / LIVE NOW IN BETA lockup. */}
              <p
                className="font-exo text-[32px] font-black uppercase leading-[0.95] tracking-[0.02em] sm:text-[54px]"
                style={{
                  backgroundImage: CHROME_TEXT,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {s.title}
              </p>
              <p
                className="font-exo mt-1 text-[22px] font-medium uppercase leading-[1.05] tracking-[0.06em] sm:text-[34px]"
                style={{
                  backgroundImage: CHROME_TEXT,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {s.subtitle}
              </p>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/55">{s.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openLoginModal}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Join DeHub
          </button>
          <Link
            to="/guide"
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/40 hover:text-white"
          >
            Take the tour
          </Link>
        </div>

        {/* Entity + disambiguation copy. Clamped on mobile only — at full height
            the panel pushed the feed and both CTAs below the fold on a 390x844
            viewport. Height clamp rather than conditional rendering, so every
            word stays in the DOM in both states and matches the worker's HTML. */}
        <div className="mt-6 border-t border-white/10 pt-4">
          <div
            className={cn(
              'relative overflow-hidden text-[13px] leading-relaxed text-zinc-500 sm:max-h-none',
              expanded ? 'max-h-none' : 'max-h-16'
            )}
          >
            {!expanded && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0a0b0d] to-transparent sm:hidden"
              />
            )}
            <p>{ENTITY_COPY}</p>
          </div>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400 hover:text-white sm:hidden"
            >
              // read more
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <nav aria-label="Learn more about DeHub" className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-zinc-400 underline underline-offset-2 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          {/* Footer lockup — on both reference boards these are BOXED chips
              (glass fill, 1px border, 12px radius), not bare text: wordmark
              plate, //dehub.io chip, and a `// type = "…"` stamp. Real asset,
              never redrawn. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-white/15 bg-white/[0.07] px-3 py-1.5 backdrop-blur-sm">
              <img src={dehubWordmark} alt="DeHub" width={70} height={17} className="h-[17px] w-auto" loading="lazy" decoding="async" />
            </span>
            <span className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] text-zinc-400">
              //dehub.io
            </span>
            <span className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] text-zinc-400">
              // type = &ldquo;welcome&rdquo;
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HomeIntro;
