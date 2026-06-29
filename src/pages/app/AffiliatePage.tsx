import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Share2, Users, Wallet, Sparkles, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGate } from "@/components/app/AuthGate";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LiquidGlassBubble2 } from "@/components/ui/liquid-glass-bubble-2";
import { SEOHead } from "@/components/SEOHead";
import { AFFILIATE_COMMISSION_PCT, loadAffiliateStats, type AffiliateStats } from "@/lib/affiliate";
import affiliateShareCard from "@/assets/affiliate-share-card.jpg";

const SITE = typeof window !== "undefined" ? window.location.origin : "https://dehub.io";

function formatMoney(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);
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

  const load = useCallback(async () => {
    if (!wallet) { setLoading(false); return; }
    setLoading(true);
    try {
      const s = await loadAffiliateStats(wallet);
      setStats(s);
    } catch (e) {
      toast.error("Could not load affiliate stats");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { void load(); }, [load]);

  const shareUrl = useMemo(
    () => (stats?.code ? `${SITE}/r/${stats.code}` : ""),
    [stats?.code],
  );
  const inviteUrl = useMemo(
    () => (stats?.code ? `${SITE}/app?ref=${stats.code}` : ""),
    [stats?.code],
  );
  const shareText = useMemo(
    () => (stats?.code
      ? `Join me on DeHub — the decentralised creator network. Use my link for an instant invite: ${shareUrl}`
      : ""),
    [shareUrl, stats?.code],
  );

  const copy = async (txt: string, label = "Copied") => {
    try { await navigator.clipboard.writeText(txt); toast.success(label); }
    catch { toast.error("Copy failed"); }
  };

  const nativeShare = () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      nav.share({ title: "DeHub", text: shareText, url: shareUrl }).catch(() => undefined);
    } else {
      void copy(shareText, "Share text copied");
    }
  };

  return (
    <>
      <SEOHead
        title="DeHub Affiliate — Earn 20% Recurring"
        description="Invite anyone to DeHub and earn 20% of all revenue they generate, forever."
      />
      {!wallet ? (
        <AuthGate description="You need a DeHub account to access the affiliate programme." />
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-10 space-y-6">
          {/* Hero / brand card */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black">
            <img
              src={affiliateShareCard}
              alt="DeHub Affiliate — Earn 20%"
              width={1216}
              height={640}
              loading="eager"
              className="w-full h-auto block opacity-90"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute left-4 right-4 bottom-4 md:left-8 md:bottom-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <Badge className="rounded-full bg-white/10 text-white border border-white/15 backdrop-blur-md">
                  <Sparkles className="w-3 h-3 mr-1" /> {AFFILIATE_COMMISSION_PCT}% recurring
                </Badge>
                <h1 className="mt-2 text-2xl md:text-4xl font-bold text-white drop-shadow-md">
                  Earn {AFFILIATE_COMMISSION_PCT}% of every invite's revenue, forever
                </h1>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Referrals"
              value={loading ? null : String(stats?.referrals ?? 0)}
            />
            <StatCard
              icon={<Wallet className="w-4 h-4" />}
              label="Total earned"
              value={loading ? null : formatMoney(stats?.totalEarnedCents ?? 0, stats?.currency || "USD")}
            />
            <StatCard
              icon={<Sparkles className="w-4 h-4" />}
              label="Commission rate"
              value={`${AFFILIATE_COMMISSION_PCT}%`}
            />
          </div>

          {/* Share section */}
          <Card className="border-white/10 bg-white/[0.03] backdrop-blur">
            <CardContent className="p-5 md:p-6 space-y-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-white">Your invite link</h2>
                  <p className="text-sm text-white/60">
                    Share this anywhere. Anyone who signs up via your link earns you {AFFILIATE_COMMISSION_PCT}% of
                    every dollar they ever spend on DeHub.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>

              {loading ? (
                <Skeleton className="h-12 w-full" />
              ) : stats?.code ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
                    <Input readOnly value={shareUrl} className="font-mono text-sm bg-black/40 border-white/10" />
                    <LiquidGlassBubble2
                      label="Copy link"
                      icon={<Copy className="w-4 h-4" />}
                      width="140px"
                      onClick={() => void copy(shareUrl, "Invite link copied")}
                    />
                    <LiquidGlassBubble2
                      label="Share"
                      icon={<Share2 className="w-4 h-4" />}
                      width="120px"
                      onClick={nativeShare}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-white/60">Your code:</span>
                    <code className="px-2 py-1 rounded-md bg-white/10 text-white font-mono tracking-[0.25em]">
                      {stats.code}
                    </code>
                    <Button variant="ghost" size="sm" onClick={() => void copy(stats.code!, "Code copied")}>
                      <Copy className="w-3 h-3 mr-1" /> Copy
                    </Button>
                    <span className="text-white/40">·</span>
                    <Link to={`/r/${stats.code}`} className="text-white/70 hover:text-white inline-flex items-center gap-1">
                      Preview landing <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      readOnly
                      value={inviteUrl}
                      onClick={() => void copy(inviteUrl, "Direct app link copied")}
                      className="font-mono text-xs bg-black/40 border-white/10 cursor-pointer"
                    />
                    <Input
                      readOnly
                      value={shareText}
                      onClick={() => void copy(shareText, "Share text copied")}
                      className="text-xs bg-black/40 border-white/10 cursor-pointer"
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-white/60">Could not generate a code. Try refreshing.</p>
              )}
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="border-white/10 bg-white/[0.03]">
            <CardContent className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Step n={1} title="Share your link" body="Drop your invite link into Discord, X, YouTube, your stream — anywhere." />
              <Step n={2} title="They join DeHub" body="Anyone who lands via your link is permanently attributed to you (first-touch wins, 90 days)." />
              <Step n={3} title={`Earn ${AFFILIATE_COMMISSION_PCT}% forever`} body={`You receive ${AFFILIATE_COMMISSION_PCT}% of every dollar of revenue they ever generate on DeHub. Recurring, lifetime.`} />
            </CardContent>
          </Card>

          {wallet && (
            <p className="text-xs text-white/40">
              Affiliate wallet:&nbsp;
              <code className="font-mono">{wallet.slice(0, 6)}…{wallet.slice(-4)}</code>
              {displayName ? <> · {displayName}</> : null}
            </p>
        </div>
      )}
    </>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <Card className="border-white/10 bg-white/[0.03] backdrop-blur">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60">
          {icon} {label}
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {value === null ? <Skeleton className="h-7 w-24" /> : value}
        </div>
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
