import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Share2, Users, Wallet, Sparkles, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGate } from "@/components/app/AuthGate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LiquidGlassBubble2 } from "@/components/ui/liquid-glass-bubble-2";
import { SEOHead } from "@/components/SEOHead";
import { AFFILIATE_COMMISSION_PCT, AFFILIATE_L1_COMMISSION_PCT, AFFILIATE_L2_COMMISSION_PCT, loadAffiliateStats, type AffiliateStats } from "@/lib/affiliate";
import { getAffiliateShareImageUrl } from "@/lib/affiliateShareImage";

const SITE = typeof window !== "undefined" ? window.location.origin : "https://dehub.io";

function formatMoney(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export default function AffiliatePage() {
  const { user } = useAuth();
  const wallet = (user as { walletAddress?: string | null; address?: string | null } | null)
    ?.walletAddress
    ?? (user as { address?: string | null } | null)?.address
    ?? null;
  const displayName = (user as { username?: string | null; displayName?: string | null } | null)
    ?.username ?? (user as { displayName?: string | null } | null)?.displayName ?? null;

  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgVersion, setImgVersion] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!wallet) { setLoading(false); return; }
    setLoading(true);
    try {
      const fallbackName = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : null;
      const s = await loadAffiliateStats(wallet, displayName ?? fallbackName);
      setStats(s);
      setImgVersion(Date.now());
    } catch (e) {
      toast.error("Could not load affiliate stats");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [displayName, wallet]);

  useEffect(() => { void load(); }, [load]);

  const shareUrl = useMemo(
    () => (stats?.code ? `${SITE}/r/${stats.code}` : ""),
    [stats?.code],
  );
  const shareImageUrl = useMemo(
    () => `${getAffiliateShareImageUrl(stats?.code, 1200, 630, "svg")}&v=${imgVersion}`,
    [stats?.code, imgVersion],
  );

  const copy = async (txt: string, label = "Copied") => {
    try { await navigator.clipboard.writeText(txt); toast.success(label); }
    catch { toast.error("Copy failed"); }
  };

  const nativeShare = () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      nav.share({ title: "DeHub", text: "Join me on DeHub.", url: shareUrl }).catch(() => undefined);
    } else {
      void copy(shareUrl, "Invite link copied");
    }
  };

  return (
    <>
      <SEOHead
        title="DeHub Affiliate — Earn 20% + 5% Recurring"
        description={`Invite anyone to DeHub and earn ${AFFILIATE_L1_COMMISSION_PCT}% of all revenue they generate, plus ${AFFILIATE_L2_COMMISSION_PCT}% from everyone they invite. Forever.`}
      />
      {!wallet ? (
        <AuthGate description="You need a DeHub account to access the affiliate programme." />
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-10 space-y-6">
          {/* Custom per-user share image */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_18px_70px_rgba(255,255,255,0.08)]">
            <img
              src={shareImageUrl}
              alt={`${displayName || "A creator"} invited you to DeHub`}
              width={1200}
              height={630}
              loading="eager"
              className="w-full h-auto block"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-white">
                Earn {AFFILIATE_L1_COMMISSION_PCT}% from everyone you invite — and {AFFILIATE_L2_COMMISSION_PCT}% from everyone <em>they</em> invite.
              </h1>
              <p className="mt-2 text-sm md:text-base text-white/60 max-w-3xl">
                Every time someone uses any DeHub revenue-generating feature, you earn residually and perpetually.
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Tier 1 referrals"
              value={loading ? null : String(stats?.referrals ?? 0)}
              hint={`${AFFILIATE_L1_COMMISSION_PCT}%`}
            />
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Tier 2 referrals"
              value={loading ? null : String(stats?.l2Referrals ?? 0)}
              hint={`${AFFILIATE_L2_COMMISSION_PCT}%`}
            />
            <StatCard
              icon={<Wallet className="w-4 h-4" />}
              label="Total earned"
              value={loading ? null : formatMoney(stats?.totalEarnedCents ?? 0, stats?.currency || "USD")}
              hint={loading || !stats ? undefined : `T1 ${formatMoney(stats.l1EarnedCents, stats.currency || "USD")} · T2 ${formatMoney(stats.l2EarnedCents, stats.currency || "USD")}`}
            />
            <StatCard
              icon={<Sparkles className="w-4 h-4" />}
              label="Commission"
              value={`${AFFILIATE_L1_COMMISSION_PCT}% + ${AFFILIATE_L2_COMMISSION_PCT}%`}
              hint="residual · perpetual"
            />
          </div>

          {/* Share section */}
          <Card className="border-white/10 bg-white/[0.03] backdrop-blur">
            <CardContent className="p-5 md:p-6 space-y-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-white">Your invite link</h2>
                  <p className="text-sm text-white/60">
                    Share anywhere. You earn {AFFILIATE_L1_COMMISSION_PCT}% of every dollar your invites ever spend on DeHub, plus {AFFILIATE_L2_COMMISSION_PCT}% from everyone <em>they</em> invite.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>

              {loading ? (
                <Skeleton className="h-12 w-full" />
              ) : stats?.code ? (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-white/60">Your code:</span>
                    <code className="px-3 py-1.5 rounded-md bg-white/10 text-white font-mono tracking-[0.25em]">
                      {stats.code}
                    </code>
                    <Link to={`/r/${stats.code}`} className="text-white/70 hover:text-white inline-flex items-center gap-1">
                      Preview landing <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <LiquidGlassBubble2
                    label="Share"
                    icon={<Share2 className="w-4 h-4" />}
                    width="140px"
                    onClick={nativeShare}
                  />
                </div>
              ) : (
                <p className="text-sm text-white/60">Could not generate a code. Try refreshing.</p>
              )}
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="border-white/10 bg-white/[0.03]">
            <CardContent className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <Step n={1} title="Share your link" body="Drop your invite link into Discord, X, YouTube, your stream — anywhere." />
              <Step n={2} title="They join DeHub" body="Anyone who lands via your link is permanently attributed to you (first-touch wins, 90-day cookie)." />
              <Step n={3} title={`Earn ${AFFILIATE_L1_COMMISSION_PCT}% direct`} body={`You receive ${AFFILIATE_L1_COMMISSION_PCT}% of every dollar of revenue your invites ever generate on DeHub.`} />
              <Step n={4} title={`Earn ${AFFILIATE_L2_COMMISSION_PCT}% secondary`} body={`When your invites invite their friends, you also earn ${AFFILIATE_L2_COMMISSION_PCT}% of their revenue. Recurring, lifetime.`} />
            </CardContent>
          </Card>


          {wallet && (
            <p className="text-xs text-white/40">
              Affiliate wallet:&nbsp;
              <code className="font-mono">{wallet.slice(0, 6)}…{wallet.slice(-4)}</code>
              {displayName ? <> · {displayName}</> : null}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string | null; hint?: string }) {
  return (
    <Card className="border-white/10 bg-white/[0.03] backdrop-blur">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60">
          {icon} {label}
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {value === null ? <Skeleton className="h-7 w-24" /> : value}
        </div>
        {hint ? <div className="mt-1 text-[11px] text-white/40">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="space-y-2">
      <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 text-white text-sm font-semibold">{n}</div>
      <h3 className="text-white font-medium">{title}</h3>
      <p className="text-sm text-white/60">{body}</p>
    </div>
  );
}
