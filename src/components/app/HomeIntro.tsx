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
 * never bot-only, and there is no bot/browser divergence to defend. The markup
 * and copy live in home-intro/HomeIntroPanel.tsx, which index.html also carries
 * prerendered at build time (see that file). Keep SLIDES,
 * ENTITY_COPY and PRESS in sync with HOME_INTRO_HTML / HOME_INTRO_PRESS in
 * CLOUDFLARE_WORKER_SEO.js.
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
import { useAuth } from '@/contexts/AuthContext';
import { warmLoginSheet } from '@/components/app/LoginModal';
import { HomeIntroPanel, SLIDES, SLIDE_MS } from '@/components/app/home-intro/HomeIntroPanel';

const DISMISS_KEY = 'dehub.homeIntroDismissed';

export function HomeIntro() {
  const { isAuthenticated, openLoginModal } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
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
    /* Lift the first-visit frost too. The sheet (#root::after, driven by
       data-feed-loading on <html> from the boot script in index.html) exists to
       point a brand-new visitor at THIS panel, so closing the panel is as clear
       a "seen it" as scrolling down. Same teardown as the boot script's own
       unfrost: flip to 'off' for the 1.2s transition in index.css, then remove
       the attribute — the sheet is a full-viewport backdrop-filter, so it has
       to stop existing rather than merely go clear. */
    const root = document.documentElement;
    if (root.dataset.feedLoading === 'on') {
      root.dataset.feedLoading = 'off';
      window.setTimeout(() => {
        if (root.dataset.feedLoading === 'off') delete root.dataset.feedLoading;
      }, 1300);
    }
  }, []);

  const goTo = useCallback((i: number) => {
    setActive(i);
    setRunId((r) => r + 1);
  }, []);

  const pause = useCallback(() => { paused.current = true; }, []);
  const resume = useCallback(() => { paused.current = false; }, []);
  const join = useCallback(() => openLoginModal(), [openLoginModal]);

  if (!show) return null;

  return (
    <HomeIntroPanel
      active={active}
      runId={runId}
      onDismiss={dismiss}
      onGoTo={goTo}
      onJoin={join}
      onWarmLogin={warmLoginSheet}
      onMouseEnter={pause}
      onMouseLeave={resume}
    />
  );
}

export default HomeIntro;
