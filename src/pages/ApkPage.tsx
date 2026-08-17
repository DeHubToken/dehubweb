import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Download, Link2, Send, Facebook } from "lucide-react";
import { NebulaParticlesBg } from "@/components/ui/nebula-particles-bg";
import { SEOHead } from "@/components/SEOHead";
import dehubWordmark from "@/assets/dehub-wordmark-white.png";

const PAGE_URL = "https://dehub.io/apk";
const OG_IMAGE = "https://dehub.io/og/apk.jpg";
const PLAY_URL = "https://play.google.com/store/apps/details?id=io.dehub.mobile";

// The build is published as a GitHub release asset rather than shipped in
// public/: at ~205 MB it is far past the 25 MiB per-file ceiling on Cloudflare
// Workers static assets, so it could never survive the deploy. The
// `releases/latest/download/<asset>` form always resolves to the newest release
// carrying that filename, so publishing a new build needs no change here — keep
// the asset named exactly `dehub.apk` and this link follows it.
const RELEASE_REPO = "DeHubToken/dehub-mobile";
const DOWNLOAD_URL = `https://github.com/${RELEASE_REPO}/releases/latest/download/dehub.apk`;
const RELEASE_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;

// What the page shows before the live release lookup answers — and permanently
// if it never does. The API 404s while the repo has no release at all and rate
// limits unauthenticated callers at 60/hour per visitor IP, so the button is
// never allowed to depend on it.
const FALLBACK_VERSION = "1.14.1";
const FALLBACK_SIZE = "194 MB";
const FALLBACK_DATE = "17 Aug 2026";
const FALLBACK_ISO = "2026-08-17";

interface ReleaseInfo {
  version: string;
  size: string;
  /** Human-readable, for the meta line. */
  date: string;
  /** The same day as `date`, in ISO form, for the structured data. */
  iso: string;
  url: string;
}

/** GitHub reports asset sizes in bytes; the page wants one decimal of MB. */
function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/**
 * A build is only trustworthy if you can see how old it is, so the release date
 * sits on the same line as the version. GitHub stamps `published_at` in UTC and
 * the reader may be anywhere, so the format is pinned to UTC rather than the
 * visitor's zone — otherwise the same release reads as two different days either
 * side of midnight.
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return FALLBACK_DATE;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

const SHARE_TEXT = "Skip the stores — grab the latest DeHub Android build direct.";

export default function ApkPage() {
  const [release, setRelease] = useState<ReleaseInfo>({
    version: FALLBACK_VERSION,
    size: FALLBACK_SIZE,
    date: FALLBACK_DATE,
    iso: FALLBACK_ISO,
    url: DOWNLOAD_URL,
  });
  const [copied, setCopied] = useState(false);

  // Read the version, size, date and direct URL off the latest release so a new
  // upload updates the page on its own. Any failure keeps the fallback.
  useEffect(() => {
    let cancelled = false;
    fetch(RELEASE_API, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        const asset = (data.assets ?? []).find((a: { name?: string }) =>
          a.name?.toLowerCase().endsWith(".apk"),
        );
        setRelease({
          version: String(data.tag_name ?? FALLBACK_VERSION).replace(/^v/i, ""),
          size: asset?.size ? formatSize(asset.size) : FALLBACK_SIZE,
          // `published_at` is when the release went public; `created_at` only
          // tracks the tag, which can predate the upload by days.
          date: data.published_at ? formatDate(data.published_at) : FALLBACK_DATE,
          iso: data.published_at
            ? String(data.published_at).slice(0, 10)
            : FALLBACK_ISO,
          url: asset?.browser_download_url ?? DOWNLOAD_URL,
        });
      })
      .catch(() => {
        /* keep the fallback — a stale version string beats a dead button */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const openShare = (url: string) =>
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=460");

  const encodedUrl = encodeURIComponent(PAGE_URL);
  const encodedText = encodeURIComponent(SHARE_TEXT);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "DeHub for Android",
    alternateName: "DeHub APK",
    description:
      "The DeHub Android app as a direct APK download. Open source, user-owned social media — no store account needed.",
    url: PAGE_URL,
    installUrl: PAGE_URL,
    downloadUrl: DOWNLOAD_URL,
    softwareVersion: release.version,
    fileSize: release.size,
    datePublished: release.iso,
    dateModified: release.iso,
    applicationCategory: "SocialNetworkingApplication",
    operatingSystem: "Android 8.0 and up",
    image: OG_IMAGE,
    screenshot: OG_IMAGE,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: {
      "@type": "Organization",
      name: "DeHub",
      url: "https://dehub.io",
      sameAs: [
        "https://x.com/dehub_official",
        "https://t.me/dehub_dhb",
        "https://github.com/DeHubToken",
        PLAY_URL,
      ],
    },
  };

  // One screen, no scroll — but `overflow-hidden` on a fixed 100dvh box CLIPS
  // rather than scrolls, and a phone in landscape is only ~290px tall, where
  // even the tightest layout overruns by a few px and the download button is
  // what disappears. Below 600px of height the box therefore grows and scrolls
  // instead. The shortest phone still sold in portrait is 667px tall, so in
  // practice only landscape ever crosses that line.
  return (
    <div
      data-glass-page
      className="relative h-[100dvh] w-full overflow-hidden bg-black text-white [@media(max-height:600px)]:h-auto [@media(max-height:600px)]:min-h-[100dvh] [@media(max-height:600px)]:overflow-y-auto"
    >
      <SEOHead
        title="Download the DeHub APK — Latest Android Build"
        description="Skip the stores and get the latest version of DeHub right here. Direct APK download for Android — open source, user-owned social media, no store account needed."
        url={PAGE_URL}
        image={OG_IMAGE}
        jsonLd={jsonLd}
      />

      <NebulaParticlesBg />

      {/* Floor wash — lifts the copy off the particle field without a panel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_35%,rgba(0,0,0,0.75)_100%)]"
      />

      <Link
        to="/app"
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 text-xs text-white/50 transition-colors hover:text-white sm:left-6 sm:top-6 sm:text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to DeHub
      </Link>

      {/* Every vertical gap and the headline itself are clamped against vh, not
          fixed — the brief is one screen with no scroll at all, and a phone held
          in landscape (~390px of height) would otherwise clip the button clean
          off the bottom of an overflow-hidden viewport. */}
      <main className="relative z-10 flex h-full flex-col items-center justify-center px-5 pb-[clamp(3rem,9vh,4.5rem)] text-center">
        <img
          src={dehubWordmark}
          alt="DeHub"
          className="h-[clamp(1.25rem,3.2vh,2rem)] w-auto object-contain opacity-90"
        />

        <div className="mt-[clamp(1rem,3.5vh,2rem)] inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 backdrop-blur-xl">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="font-mono text-[10px] tracking-[0.18em] text-white/70 sm:text-[11px]">
            //ANDROID_APK
          </span>
        </div>

        <h1 className="mt-[clamp(0.75rem,3vh,1.75rem)] max-w-[15ch] text-[clamp(2.25rem,min(9vw,8vh),4.5rem)] font-black italic leading-[0.95] tracking-tight">
          Skip the stores.
        </h1>

        <p className="mt-[clamp(0.75rem,2.2vh,1.25rem)] max-w-[38ch] text-balance text-sm leading-relaxed text-white/60 sm:max-w-[46ch] sm:text-base">
          Get the latest version of DeHub right here — straight from us, no
          store account, no waiting on a review queue.
        </p>

        <a
          href={release.url}
          className="group mt-[clamp(1.25rem,4vh,2.5rem)] inline-flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-7 py-4 text-base font-bold backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:border-white/40 hover:bg-white/20 hover:shadow-[0_0_28px_rgba(255,255,255,0.22)] sm:px-9 sm:py-5 sm:text-lg"
        >
          <Download className="h-5 w-5 transition-transform duration-200 group-hover:translate-y-0.5" />
          Download now
        </a>

        <p className="mt-[clamp(0.75rem,2.2vh,1.25rem)] font-mono text-[11px] tracking-wider text-white/45 sm:text-xs">
          v{release.version} · {release.size} · {release.date} · Android 8+
        </p>
        <p className="mt-1.5 max-w-[40ch] text-[11px] leading-relaxed text-white/35 sm:text-xs">
          Allow installs from your browser when Android asks.
        </p>

        <a
          href={PLAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-[clamp(1rem,3vh,1.75rem)] text-xs text-white/40 underline-offset-4 transition-colors hover:text-white/70 hover:underline"
        >
          Prefer Google Play? Get it there instead.
        </a>
      </main>

      {/* Share row. Sits on the floor of the viewport so it never pushes the
          hero into a scroll on short phones. */}
      <div className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-2 sm:bottom-7 sm:gap-2.5">
        <span className="mr-1 font-mono text-[10px] tracking-[0.16em] text-white/30 sm:text-[11px]">
          //SHARE
        </span>
        <button
          type="button"
          onClick={() =>
            openShare(`https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`)
          }
          aria-label="Share on X"
          className="rounded-xl border border-white/15 bg-white/5 p-2.5 backdrop-blur-xl transition-all duration-200 hover:border-white/40 hover:bg-white/15"
        >
          {/* lucide ships the retired bird mark, so the X glyph is inline. */}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() =>
            openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)
          }
          aria-label="Share on Facebook"
          className="rounded-xl border border-white/15 bg-white/5 p-2.5 backdrop-blur-xl transition-all duration-200 hover:border-white/40 hover:bg-white/15"
        >
          <Facebook className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            openShare(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`)
          }
          aria-label="Share on Telegram"
          className="rounded-xl border border-white/15 bg-white/5 p-2.5 backdrop-blur-xl transition-all duration-200 hover:border-white/40 hover:bg-white/15"
        >
          <Send className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(PAGE_URL);
            setCopied(true);
          }}
          aria-label="Copy link"
          className="rounded-xl border border-white/15 bg-white/5 p-2.5 backdrop-blur-xl transition-all duration-200 hover:border-white/40 hover:bg-white/15"
        >
          {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
