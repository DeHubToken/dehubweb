import { Link } from "react-router-dom";
import Download from "@/components/ui/cut-icons/download";
import ArrowLeft from "@/components/ui/cut-icons/back";

import { SEOHead } from "@/components/SEOHead";
import { SHARE_IMAGE, SITE_URL } from "@/lib/seo/route-meta";
import {
  DEHUB_APP_LINKS,
  DEHUB_APP_PAGE,
  dehubAppFaqLd,
} from "@/lib/dehub-app-page.js";
import dehubWordmark from "@/assets/dehub-wordmark-white.png";

const PAGE_URL = `${SITE_URL}${DEHUB_APP_PAGE.path}`;

// Same nodes the edge renders for crawlers (CLOUDFLARE_WORKER_SEO.js), from the
// same module, so the two UA variants describe one entity.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: DEHUB_APP_PAGE.title,
      description: DEHUB_APP_PAGE.description,
      url: PAGE_URL,
      about: { "@type": "Thing", name: "DeHub", sameAs: [DEHUB_APP_LINKS.googlePlay, DEHUB_APP_LINKS.appStore] },
      publisher: { "@type": "Organization", name: "DeHub", url: SITE_URL },
    },
    dehubAppFaqLd(),
  ],
};

const STORES = [
  { href: DEHUB_APP_LINKS.googlePlay, label: "Get it on Google Play", note: "Android", external: true },
  { href: DEHUB_APP_LINKS.appStore, label: "Download on the App Store", note: "iPhone", external: true },
];

/**
 * /dehub-app — the landing page for people searching for the app by name.
 * Copy lives in src/lib/dehub-app-page.js, shared with the crawler HTML.
 */
export default function DehubAppPage() {
  return (
    <div data-glass-page className="relative min-h-[100dvh] w-full bg-black text-white">
      <SEOHead
        title={DEHUB_APP_PAGE.title}
        description={DEHUB_APP_PAGE.description}
        url={PAGE_URL}
        image={SHARE_IMAGE}
        jsonLd={JSON_LD}
      />

      <Link
        to="/"
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 text-xs text-white/50 transition-colors hover:text-white sm:left-6 sm:top-6 sm:text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        DeHub
      </Link>

      <main className="mx-auto flex max-w-2xl flex-col px-5 pb-20 pt-20 sm:pt-24">
        <img src={dehubWordmark} alt="DeHub" className="h-7 w-auto self-start object-contain opacity-90" />

        <h1 className="mt-8 text-4xl font-black italic leading-[0.95] tracking-tight sm:text-5xl">
          {DEHUB_APP_PAGE.heading}
        </h1>

        {DEHUB_APP_PAGE.intro.map((p) => (
          <p key={p} className="mt-5 text-base leading-relaxed text-white/70">
            {p}
          </p>
        ))}

        <h2 className="mt-12 text-xl font-bold">Download DeHub</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {STORES.map((s) => (
            <a
              key={s.href}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-5 py-4 font-bold backdrop-blur-xl transition-all duration-200 hover:border-white/40 hover:bg-white/20"
            >
              <Download className="h-5 w-5 shrink-0" />
              <span className="flex flex-col">
                <span>{s.label}</span>
                <span className="text-xs font-normal text-white/50">{s.note}</span>
              </span>
            </a>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link to="/" className="text-white/70 underline underline-offset-4 hover:text-white">
            Open DeHub in your browser
          </Link>
          <Link to="/apk" className="text-white/70 underline underline-offset-4 hover:text-white">
            Download the APK (Android without Google Play)
          </Link>
        </div>

        <h2 className="mt-14 text-xl font-bold">Frequently asked questions</h2>
        <div className="mt-2 divide-y divide-white/10">
          {DEHUB_APP_PAGE.faq.map(({ q, a }) => (
            <div key={q} className="py-5">
              <h3 className="font-semibold">{q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{a}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm leading-relaxed text-white/60">
          Still not sure which DeHub you need?{" "}
          <Link to="/guides/dehub-vs-depaul-dehub-vs-rowan-dehub" className="underline underline-offset-4 hover:text-white">
            DeHub vs DePaul DeHUB vs Rowan DEHub
          </Link>{" "}
          sorts it out, and{" "}
          <Link to="/guides/what-is-dehub" className="underline underline-offset-4 hover:text-white">
            What is DeHub?
          </Link>{" "}
          covers the platform in depth.
        </p>
      </main>
    </div>
  );
}
