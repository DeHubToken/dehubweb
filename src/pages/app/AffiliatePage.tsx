import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Share2, Users, Wallet, Sparkles, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGate } from "@/components/app/AuthGate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LiquidGlassBubble2 } from "@/components/ui/liquid-glass-bubble-2";
import { SEOHead } from "@/components/SEOHead";
import { BadgeIcon } from "@/components/app/BadgeIcon";
import { VerifiedBadge } from "@/components/app/VerifiedBadge";
import { useDeHubProfile } from "@/hooks/use-dehub-profile";
import { AFFILIATE_COMMISSION_PCT, AFFILIATE_L1_COMMISSION_PCT, AFFILIATE_L2_COMMISSION_PCT, loadAffiliateStats, type AffiliateStats, type AffiliateReferralEntry } from "@/lib/affiliate";
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
    ?.displayName ?? (user as { username?: string | null } | null)?.username ?? null;
  const username = (user as { username?: string | null } | null)?.username ?? null;
  const badgeBalance = (user as { badgeBalance?: number | null } | null)?.badgeBalance ?? null;

  // Hydrate instantly from the last known stats for this wallet; the real
  // numbers refresh in the background (stale-while-revalidate).
  const [stats, setStats] = useState<AffiliateStats | null>(() => {
    if (typeof window === "undefined" || !wallet) return null;
    try {
      const cached = window.localStorage.getItem(`affiliate-stats:${wallet.toLowerCase()}`);
      return cached ? (JSON.parse(cached) as AffiliateStats) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(!stats);
  const [refreshing, setRefreshing] = useState(false);
  const statsRef = useRef(stats);
  useEffect(() => { statsRef.current = stats; }, [stats]);
  // Stable per-code version stored in localStorage. Only bumped when user clicks Refresh,
  // so the browser HTTP cache hits instantly on revisits.
  const versionKey = stats?.code ? `affiliate-img-v:${stats.code}` : null;
  const [imgVersion, setImgVersion] = useState<string>(() => {
    if (typeof window === "undefined") return "1";
    return "1";
  });
  const [imgLoaded, setImgLoaded] = useState(false);

  // Bump this whenever the share-image renderer changes so all users pick up the new look.
  const RENDERER_VERSION = "4";
  useEffect(() => {
    if (!versionKey) return;
    try {
      const stored = window.localStorage.getItem(versionKey);
      if (stored && stored.startsWith(`${RENDERER_VERSION}:`)) {
        setImgVersion(stored);
      } else {
        const fresh = `${RENDERER_VERSION}:${Date.now()}`;
        window.localStorage.setItem(versionKey, fresh);
        setImgVersion(fresh);
      }
    } catch { /* ignore */ }
  }, [versionKey]);

  useEffect(() => { setImgLoaded(false); }, [stats?.code, imgVersion]);

  const load = useCallback(async (opts?: { refreshImage?: boolean }) => {
    if (!wallet) { setLoading(false); return; }
    // Only show skeletons when there's nothing to show — cached stats stay
    // visible while fresh numbers load in the background.
    if (!statsRef.current) setLoading(true);
    try {
      const fallbackName = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : null;
      const s = await loadAffiliateStats(wallet, displayName ?? fallbackName);
      setStats(s);
      try { window.localStorage.setItem(`affiliate-stats:${wallet.toLowerCase()}`, JSON.stringify(s)); } catch { /* ignore */ }
      if (opts?.refreshImage && s?.code) {
        const next = String(Date.now());
        setImgVersion(next);
        try { window.localStorage.setItem(`affiliate-img-v:${s.code}`, next); } catch { /* ignore */ }
      }
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
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_18px_70px_rgba(255,255,255,0.08)] aspect-[1200/630]">
            {stats?.code ? (
              <img
                src={shareImageUrl}
                alt={`${displayName || ""} invited you to DeHub`}
                width={1200}
                height={630}
                loading="eager"
                onLoad={() => setImgLoaded(true)}
                className={`absolute inset-0 w-full h-full block transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              />
            ) : null}
            {(!stats?.code || !imgLoaded) && (
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
              label="Direct"
              value={loading ? null : String(stats?.referrals ?? 0)}
              hint={`${AFFILIATE_L1_COMMISSION_PCT}%`}
            />
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Secondary"
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

          {/* Who your affiliates are */}
          <AffiliatesList
            l1={stats?.l1List ?? []}
            l2={stats?.l2List ?? []}
            l1Count={stats?.referrals ?? 0}
            l2Count={stats?.l2Referrals ?? 0}
            viewerWallet={wallet}
            loading={loading}
          />

          {/* Share section */}
          <Card className="border-white/10 bg-white/[0.03] backdrop-blur">
            <CardContent className="p-5 md:p-6 space-y-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-white">Your invite link</h2>
                  <p className="text-sm text-white/60">
                    Share anywhere. You earn {AFFILIATE_L1_COMMISSION_PCT}% of every dollar your invites ever spend on DeHub, plus {AFFILIATE_L2_COMMISSION_PCT}% from everyone <em>they</em> invite.
                  </p>
                </div>
              </div>

              {loading ? (
                <Skeleton className="h-12 w-full" />
              ) : stats?.code ? (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm min-w-0">
                    <Link
                      to={`/r/${stats.code}`}
                      className="px-3 py-1.5 rounded-md bg-white/10 text-white font-mono truncate hover:bg-white/15 inline-flex items-center gap-2"
                    >
                      {`${typeof window !== "undefined" ? window.location.origin : "https://dehub.io"}/r/${stats.code}`}
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRefreshing(true);
                        void load({ refreshImage: true }).finally(() => setRefreshing(false));
                      }}
                      disabled={loading || refreshing}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${loading || refreshing ? "animate-spin" : ""}`} /> Refresh
                    </Button>
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
            <p className="text-xs text-white/40 inline-flex items-center gap-1.5 flex-wrap">
              <span>Affiliate wallet:&nbsp;</span>
              <code className="font-mono">{wallet.slice(0, 6)}…{wallet.slice(-4)}</code>
              {displayName ? (
                <span className="inline-flex items-center gap-1.5">
                  <span>· {displayName}</span>
                  <BadgeIcon badgeBalance={badgeBalance ?? undefined} username={username} className="w-3 h-3" />
                </span>
              ) : null}
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

const truncateAddress = (address: string) =>
  address.length <= 10 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;

function formatReferralDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

const AFFILIATES_PAGE_SIZE = 12;

/**
 * Lists the actual accounts behind the referral counters. Direct (L1) are the
 * people you invited; Secondary (L2) are the people they invited. Each row
 * resolves its own profile so the list paints instantly from addresses and
 * enriches with names/avatars as they load.
 */
function AffiliatesList({
  l1,
  l2,
  l1Count,
  l2Count,
  viewerWallet,
  loading,
}: {
  l1: AffiliateReferralEntry[];
  l2: AffiliateReferralEntry[];
  l1Count: number;
  l2Count: number;
  viewerWallet: string | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<"direct" | "secondary">("direct");
  const [visible, setVisible] = useState(AFFILIATES_PAGE_SIZE);
  const hasSecondary = l2.length > 0 || l2Count > 0;
  const list = tab === "direct" ? l1 : l2;

  useEffect(() => { setVisible(AFFILIATES_PAGE_SIZE); }, [tab]);

  const shown = list.slice(0, visible);
  // A positive count with no rows means the list is still hydrating (fresh load
  // or a pre-upgrade cached stats blob) — show skeletons, not an empty state.
  const activeCount = tab === "direct" ? l1Count : l2Count;
  const hydrating = list.length === 0 && (loading || activeCount > 0);

  return (
    <Card className="border-white/10 bg-white/[0.03] backdrop-blur">
      <CardContent className="p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
              <Users className="w-4 h-4" /> Your affiliates
            </h2>
            <p className="text-sm text-white/60">The accounts you’ve referred to DeHub.</p>
          </div>
          {hasSecondary && (
            <div className="inline-flex rounded-full bg-white/[0.06] p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setTab("direct")}
                className={`px-3 py-1.5 rounded-full transition-colors ${tab === "direct" ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
              >
                Direct ({l1Count})
              </button>
              <button
                type="button"
                onClick={() => setTab("secondary")}
                className={`px-3 py-1.5 rounded-full transition-colors ${tab === "secondary" ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
              >
                Secondary ({l2Count})
              </button>
            </div>
          )}
        </div>

        {hydrating ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Users className="w-10 h-10 text-white/25 mb-3" />
            <p className="text-white/70 font-medium">
              {tab === "direct" ? "No affiliates yet" : "No secondary affiliates yet"}
            </p>
            <p className="text-white/40 text-sm mt-1">
              {tab === "direct"
                ? "Share your invite link — everyone who joins through it shows up here."
                : "When your affiliates invite their own friends, they’ll appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {shown.map((entry) => (
              <AffiliateRow key={entry.address} entry={entry} viewerWallet={viewerWallet} />
            ))}
            {visible < list.length && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-white/70 hover:text-white"
                onClick={() => setVisible((v) => v + AFFILIATES_PAGE_SIZE)}
              >
                Show more ({list.length - visible})
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AffiliateRow({ entry, viewerWallet }: { entry: AffiliateReferralEntry; viewerWallet: string | null }) {
  const { data: profile, isLoading } = useDeHubProfile({
    userId: entry.address,
    address: viewerWallet || undefined,
  });

  const username = profile?.handle && profile.handle !== "@unknown"
    ? profile.handle.replace(/^@/, "")
    : null;
  const name = profile?.name && profile.name !== "Unknown User" ? profile.name : truncateAddress(entry.address);
  const to = username ? `/${username}` : `/profile?id=${entry.address}`;
  const joined = formatReferralDate(entry.createdAt);

  return (
    <Link
      to={to}
      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors"
    >
      <Avatar className="w-10 h-10 rounded-full shrink-0">
        {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt={name} /> : null}
        <AvatarFallback className="bg-white/10 text-white text-sm">
          {(name || "?")[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isLoading && !profile ? (
            <Skeleton className="h-4 w-28" />
          ) : (
            <span className="font-medium text-white truncate">{name}</span>
          )}
          {profile?.verified && <VerifiedBadge className="w-3.5 h-3.5 shrink-0" />}
          <BadgeIcon badgeBalance={profile?.badgeBalance ?? undefined} username={username} className="w-3 h-3" />
        </div>
        <div className="text-xs text-white/45 truncate">
          {username ? `@${username}` : truncateAddress(entry.address)}
          {joined ? <span className="text-white/30"> · joined {joined}</span> : null}
        </div>
      </div>

      <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
    </Link>
  );
}
