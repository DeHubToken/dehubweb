import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Copy, ArrowRight, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isValidAffiliateCode, setAffiliateRef } from "@/lib/affiliateRef";
import { getAffiliateShareImageUrl } from "@/lib/affiliateShareImage";


const SITE = typeof window !== "undefined" ? window.location.origin : "https://dehub.io";

export default function ReferralLanding() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = (rawCode || "").trim().toUpperCase();
  const valid = isValidAffiliateCode(code);
  const [inviter, setInviter] = useState<string>("A creator");

  const shareImage = getAffiliateShareImageUrl(code, 1200, 630);
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
      if (cancelled || !data) return;
      const name = data.share_name?.trim();
      if (name) setInviter(name);
      else if (data.owner_address) {
        setInviter(`${data.owner_address.slice(0, 6)}…${data.owner_address.slice(-4)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [code, valid]);

  const title = useMemo(
    () => (valid ? `${inviter} invited you to DeHub — earn, post & build on-chain` : "DeHub — the decentralised creator network"),
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
        <meta property="og:image" content={shareImage} />
        <meta property="og:image:width" content="1216" />
        <meta property="og:image:height" content="640" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={shareImage} />
        
      </Helmet>

      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-16">
        <div className="max-w-3xl w-full text-center space-y-8">
          {valid ? (
            <>
              <p className="text-sm uppercase tracking-[0.3em] text-white/50">You've been invited</p>
              <h1 className="text-4xl md:text-6xl font-bold leading-tight flex flex-col items-center gap-4">
                <span>{inviter} invited you to</span>
                <span className="text-white">DeHub</span>
              </h1>
              <p className="text-lg text-white/70">
                Join with code <span className="font-mono font-bold tracking-[0.3em] text-white">{code}</span>
              </p>
              <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                <img
                  src={shareImage}
                  alt={`${inviter} invited you to DeHub`}
                  width={1200}
                  height={630}
                  className="w-full h-auto block"
                />
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
