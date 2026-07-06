import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Copy, ArrowRight, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isValidAffiliateCode, setAffiliateRef } from "@/lib/affiliateRef";
import { getAffiliateShareImageUrl } from "@/lib/affiliateShareImage";
import { getBadgeUrl, getBadgeName } from "@/lib/staking-badges";


const SITE = typeof window !== "undefined" ? window.location.origin : "https://dehub.io";

export default function ReferralLanding() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = (rawCode || "").trim().toUpperCase();
  const valid = isValidAffiliateCode(code);
  const [inviter, setInviter] = useState<string | null>(null);
  const [inviterUsername, setInviterUsername] = useState<string | null>(null);
  const [inviterBadgeBalance, setInviterBadgeBalance] = useState<number | null>(null);
  const [inviterLoaded, setInviterLoaded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgRetry, setImgRetry] = useState(0);

  // PNG for OG/social meta (cached cross-platform), SVG for the fast in-page preview.
  const ogImage = getAffiliateShareImageUrl(code, 1200, 630, "png");
  const baseShareImage = getAffiliateShareImageUrl(code, 1200, 630, "svg");
  const shareImage = imgRetry > 0 ? `${baseShareImage}&r=${imgRetry}` : baseShareImage;
  const pageUrl = `${SITE}/r/${code}`;
  const ctaUrl = `/app?ref=${code}`;

  useEffect(() => {
    if (!valid) return;
    setAffiliateRef(code);
    let cancelled = false;
    (async () => {
      // @ts-ignore - new table not in generated types
      const { data } = await supabase
        .from("affiliate_codes" as never)
        .select("share_name,owner_address")
        .eq("code", code)
        .eq("active", true)
        .maybeSingle() as unknown as { data: { share_name: string | null; owner_address: string } | null };
      if (cancelled) return;
      let resolved: string | null = null;
      if (data?.owner_address) {
        try {
          const r = await fetch(`https://api.dehub.io/api/account_info/${data.owner_address}`);
          if (r.ok) {
            const j = await r.json();
            const u = j?.result || j;
            const apiDisplay = (u?.displayName || "").trim();
            const apiUser = (u?.username || "").trim();
            resolved = apiDisplay || apiUser || null;
            if (!cancelled) {
              setInviterUsername(apiUser || null);
              const bb = Number(u?.badgeBalance);
              setInviterBadgeBalance(Number.isFinite(bb) ? bb : null);
            }
          }
        } catch { /* ignore */ }
      }
      if (!resolved) {
        const sn = data?.share_name?.trim();
        if (sn) resolved = sn;
        else if (data?.owner_address) resolved = `${data.owner_address.slice(0, 6)}…${data.owner_address.slice(-4)}`;
      }
      if (!cancelled) {
        if (resolved) setInviter(resolved);
        setInviterLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [code, valid]);

  const title = useMemo(
    () => (valid && inviter ? `${inviter} invited you to DeHub — earn, post & build on-chain` : "DeHub — the decentralised creator network"),
    [inviter, valid],
  );
  const description = valid
    ? `Use invite code ${code} to join DeHub. The decentralised creator network for video, music, social, jobs and Web3.`
    : "The decentralised creator network.";

  const copy = async (txt: string) => {
    try { await navigator.clipboard.writeText(txt); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1216" />
        <meta property="og:image:height" content="640" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        
      </Helmet>

      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-16">
        <div className="max-w-3xl w-full text-center space-y-8">
          {valid ? (
            <>
              <p className="text-sm uppercase tracking-[0.3em] text-white/50">You've been invited</p>
              <h1 className="text-4xl md:text-6xl font-bold leading-tight flex flex-col items-center gap-4">
                {inviterLoaded ? (
                  <span className="inline-flex items-center justify-center gap-3 flex-wrap">
                    {inviter ? (() => {
                      const badgeUrl = getBadgeUrl(inviterBadgeBalance ?? undefined, inviterUsername);
                      const badgeName = getBadgeName(inviterBadgeBalance ?? undefined, inviterUsername);
                      return (
                        <>
                          <span className="relative inline-block">
                            <span>{inviter}</span>
                            {badgeUrl && (
                              <img
                                src={badgeUrl}
                                alt={badgeName || "Badge"}
                                width={16}
                                height={16}
                                className="absolute -top-1 -right-3 md:-top-2 md:-right-4 w-3 h-3 md:w-4 md:h-4 brightness-0 invert pointer-events-none select-none"
                              />
                            )}
                          </span>
                          <span>invited you to</span>
                        </>
                      );
                    })() : (
                      <span>You've been invited to</span>
                    )}
                  </span>
                ) : (
                  <span className="inline-block h-10 md:h-14 w-64 md:w-96 rounded-xl bg-white/[0.06] relative overflow-hidden">
                    <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />
                    <span
                      className="absolute inset-y-0 -left-full w-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                      style={{ animation: "shimmer-sweep 1.6s linear infinite" }}
                    />
                  </span>
                )}

                <span className="text-white">DeHub</span>
              </h1>
              <p className="text-lg text-white/70">
                Join with code <span className="font-mono font-bold tracking-[0.3em] text-white">{code}</span>
              </p>
              <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] aspect-[1200/630] relative">
                {inviterLoaded && (
                  <img
                    src={shareImage}
                    alt={inviter ? `${inviter} invited you to DeHub` : "DeHub invite"}
                    width={1200}
                    height={630}
                    onLoad={() => setImgLoaded(true)}
                    onError={() => {
                      if (imgRetry < 3) {
                        setTimeout(() => setImgRetry((n) => n + 1), 600 * (imgRetry + 1));
                      }
                    }}
                    className={`absolute inset-0 w-full h-full block transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                  />
                )}
                {(!inviterLoaded || !imgLoaded) && (
                  <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
                    <div className="absolute inset-0 bg-white/[0.04] animate-pulse" />
                    <div
                      className="absolute inset-y-0 -left-full w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                      style={{ animation: "shimmer-sweep 1.6s linear infinite" }}
                    />
                    <span className="relative text-sm md:text-base text-white/80 font-medium tracking-wide">Checking for updates…</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button asChild size="lg">
                  <Link to={ctaUrl}>Continue to DeHub <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Button size="lg" variant="outline" onClick={() => copy(pageUrl)}>
                  <Copy className="mr-2 h-4 w-4" /> Copy invite link
                </Button>
                {typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share && (
                  <Button size="lg" variant="ghost" onClick={() => {
                    (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
                      title, text: description, url: pageUrl,
                    }).catch(() => undefined);
                  }}>
                    <Share2 className="mr-2 h-4 w-4" /> Share
                  </Button>
                )}
              </div>
              
              
            </>
          ) : (
            <>
              <h1 className="text-4xl font-bold">Invalid invite</h1>
              <p className="text-white/70">That referral code doesn't look right.</p>
              <Button asChild size="lg"><Link to="/app">Go to DeHub</Link></Button>
            </>
          )}
        </div>
      </main>
    </>
  );
}
