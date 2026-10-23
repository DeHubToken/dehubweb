import { Link, useNavigate } from "react-router-dom";
import ArrowLeft from "@/components/ui/cut-icons/back";
import Live from "@/components/ui/cut-icons/live";
import Migrate from "@/components/ui/cut-icons/migrate";
import Affiliate from "@/components/ui/cut-icons/affiliate";

import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/contexts/AuthContext";
import { SITE_URL } from "@/lib/seo/route-meta";
import { STREAM_LINKS, STREAM_PAGE, streamFaqLd } from "@/lib/streamer-page.js";
import dehubWordmark from "@/assets/dehub-wordmark-white.png";

const PAGE_URL = `${SITE_URL}${STREAM_PAGE.path}`;
// Shares the creators card, as the edge does for crawlers (`og: 'creators'`).
const OG_IMAGE = `${SITE_URL}/og/creators.jpg`;
const appPath = (url: string) => url.slice(SITE_URL.length);

// Same nodes the edge renders for crawlers (CLOUDFLARE_WORKER_SEO.js), from the
// same module, so the two UA variants describe one page.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: STREAM_PAGE.title,
      description: STREAM_PAGE.description,
      url: PAGE_URL,
      publisher: { "@type": "Organization", name: "DeHub", url: SITE_URL },
    },
    streamFaqLd(),
  ],
};

const CTA_SECONDARY =
  "inline-flex items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-3.5 text-sm font-semibold transition-all duration-200 hover:border-white/40 hover:bg-white/10";

/**
 * /stream — why live streamers should move to DeHub, and the three ways in.
 * Copy lives in src/lib/streamer-page.js, shared with the crawler HTML.
 * Affiliates link here as /r/<CODE>?to=/stream, so the visit is already
 * attributed by the time this page paints.
 */
export default function StreamPage() {
  const { isAuthenticated, openLoginModal } = useAuth();
  const navigate = useNavigate();

  // Signing up happens in the sheet over this page; once signed in, going
  // live starts from the composer in the app.
  const startStreaming = () => (isAuthenticated ? navigate(appPath(STREAM_LINKS.start)) : openLoginModal());

  return (
    <div data-glass-page className="relative min-h-[100dvh] w-full bg-black text-white">
      <SEOHead
        title={STREAM_PAGE.title}
        description={STREAM_PAGE.description}
        url={PAGE_URL}
        image={OG_IMAGE}
        jsonLd={JSON_LD}
      />

      <Link
        to="/"
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 text-xs text-white/50 transition-colors hover:text-white sm:left-6 sm:top-6 sm:text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        DeHub
      </Link>

      <main className="mx-auto flex max-w-3xl flex-col px-5 pb-20 pt-20 sm:pt-24">
        <img src={dehubWordmark} alt="DeHub" className="h-7 w-auto self-start object-contain opacity-90" />

        <div className="mt-8 inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-[10px] tracking-[0.18em] text-white/70 sm:text-[11px]">//FOR_STREAMERS</span>
        </div>

        <h1 className="mt-5 text-4xl font-black italic leading-[0.95] tracking-tight sm:text-6xl">
          {STREAM_PAGE.heading}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">{STREAM_PAGE.intro}</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={startStreaming}
            className="inline-flex items-center justify-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold backdrop-blur-xl transition-all duration-200 hover:border-white/40 hover:bg-white/20 hover:shadow-[0_0_28px_rgba(255,255,255,0.18)]"
          >
            <Live className="h-5 w-5" />
            Start streaming
          </button>
          <Link to={appPath(STREAM_LINKS.migrate)} className={CTA_SECONDARY}>
            <Migrate className="h-5 w-5" />
            Import your YouTube channel
          </Link>
          <Link to={appPath(STREAM_LINKS.affiliate)} className={CTA_SECONDARY}>
            <Affiliate className="h-5 w-5" />
            Get your invite link
          </Link>
        </div>
        <p className="mt-3 text-xs text-white/45">
          Sign up, open the post composer and tap Go live — from your camera, OBS or a capture card.
        </p>

        <ul className="mt-12 grid gap-3 sm:grid-cols-3">
          {STREAM_PAGE.proof.map(({ value, label }) => (
            <li key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-2xl font-semibold tracking-[-0.02em]">{value}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">{label}</p>
            </li>
          ))}
        </ul>

        <h2 className="mt-14 text-xl font-bold">Why stream on DeHub</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {STREAM_PAGE.reasons.map(({ title, body }) => (
            <section key={title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{body}</p>
            </section>
          ))}
        </div>

        <h2 className="mt-14 text-xl font-bold">Frequently asked questions</h2>
        <div className="mt-2 divide-y divide-white/10">
          {STREAM_PAGE.faq.map(({ q, a }) => (
            <div key={q} className="py-5">
              <h3 className="font-semibold">{q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{a}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm leading-relaxed text-white/60">
          Coming from TikTok? Read{" "}
          <Link to={appPath(STREAM_LINKS.tiktokGuide)} className="underline underline-offset-4 hover:text-white">
            the UK creator guide to leaving TikTok
          </Link>{" "}
          and{" "}
          <Link to={appPath(STREAM_LINKS.liveGuide)} className="underline underline-offset-4 hover:text-white">
            Web3 live streaming: a decentralised Twitch alternative
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
