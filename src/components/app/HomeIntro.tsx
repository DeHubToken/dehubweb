/**
 * Signed-out welcome card at the top of the home feed.
 *
 * Two jobs, both SEO:
 *
 * 1. dehub.net 301s into dehub.io/, and a 301 only carries a ranking if the
 *    DESTINATION can hold the query. The old marketing site explained what
 *    DeHub was in prose; the feed it now redirects into gave crawlers ~149
 *    words of nav plus scraped post titles, so the brand term had nothing to
 *    land on. This is the missing prose.
 *
 * 2. "DeHub" is a contested string — DePaul's student portal, deHUB Access,
 *    a diagnostics clinic app and Rowan's DEHub all answer to it. Establishing
 *    the entity ("DeHub is a decentralised social platform…") in crawlable body
 *    copy is how Google learns the token can mean us.
 *
 * Rendered ONLY when signed out, so the existing community's feed is untouched.
 * Googlebot is signed out AND starts with empty localStorage, so it always sees
 * the card — and so does every first-time human visitor. The copy is therefore
 * never bot-only, and there is no bot/browser divergence to defend. Keep the
 * prose in sync with HOME_INTRO_HTML in CLOUDFLARE_WORKER_SEO.js, which mirrors
 * it into the prerendered bot HTML.
 *
 * DELIBERATELY IN-FLOW, not a fixed/absolute overlay. A dismissible card that
 * pushes the feed down is a banner; one that covers the feed on load is an
 * intrusive interstitial, which is a mobile ranking signal against exactly the
 * URL this component exists to rank. Do not convert it to a modal.
 */
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const DISMISS_KEY = 'dehub.homeIntroDismissed';

const LINKS: { to: string; label: string }[] = [
  { to: '/guides/what-is-watch-to-earn', label: 'What is watch-to-earn?' },
  { to: '/guides/tokenized-subscriptions-explained', label: 'Tokenised subscriptions' },
  { to: '/guides/web3-live-streaming-decentralised-twitch-alternative', label: 'Web3 live streaming' },
  { to: '/guides/decentralised-social-media-explained-uk', label: 'Decentralised social media' },
  { to: '/docs/token/overview', label: 'The DHB currency' },
  { to: '/guides/what-is-dehub', label: 'What is DeHub?' },
];

export function HomeIntro() {
  const { isAuthenticated, openLoginModal } = useAuth();
  // Lazy init: read once on mount rather than every render. Wrapped because
  // Safari private mode throws on localStorage access — a welcome card must
  // never be able to break the feed.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* dismissal just won't persist */
    }
  }, []);

  if (isAuthenticated || dismissed) return null;

  return (
    <section
      aria-labelledby="dehub-intro-heading"
      className="relative mx-2 mb-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 sm:mx-3 lg:mx-3"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="mb-3 flex items-center gap-2.5">
          <img
            src="/dehub-icon.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg"
            loading="lazy"
            decoding="async"
          />
          <h2 id="dehub-intro-heading" className="pr-8 text-lg font-semibold text-white">
            Welcome to DeHub
          </h2>
        </div>

        <div className="text-sm leading-relaxed text-zinc-400">
          <p className="mb-3">
            DeHub is a decentralised social network and mobile app where creators own their content,
            their audience and their earnings. Every post is minted on-chain, the feed is chronological
            rather than algorithmic, and nothing you publish can be quietly demonetised or removed by a
            platform owner. It has been in development since 2021 and is free to join — sign in with an
            email or social account and a gas-sponsored wallet is created for you automatically.
          </p>

          <p className="mb-3">
            The platform combines things that usually live in separate apps: a social feed with video,
            shorts, images and music; live streaming with on-chain tipping; end-to-end encrypted
            messaging; user-run communities; a multi-chain wallet; and an AI assistant. Creators monetise
            directly through pay-per-view posts, tokenised subscriptions that holders can resell,
            ad-revenue sharing and watch-to-earn rewards paid in DHB, the platform&rsquo;s own currency.
            Viewers earn for their attention rather than only supplying it.
          </p>

          <p className="mb-4">
            DeHub is built and maintained in the open — the source is on GitHub, contract activity is
            publicly auditable, and holders vote on proposals through on-chain governance. If you arrived
            looking for a different DeHub, this is not DePaul University&rsquo;s student portal, Rowan&rsquo;s DEHub
            or the deHUB Access door-entry app; those are unrelated products that share the name.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openLoginModal}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Join DeHub
          </button>
          <Link
            to="/guide"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Take the tour
          </Link>
        </div>

        <nav
          aria-label="Learn more about DeHub"
          className="flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-800 pt-3 text-sm"
        >
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
      </div>
    </section>
  );
}

export default HomeIntro;
