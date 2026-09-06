/**
 * DAO Page
 * ========
 * The treasury and who funded it. One wallet anyone can send DHB to; the page
 * reads its balance and every transfer into it straight off the chain, and
 * ranks contributors by how much of the pool they put in. That share is the
 * weight their voice carries when the DAO decides how the treasury is spent.
 */

import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Landmark, Copy, Check, Loader2, HeartHandshake, ExternalLink, RefreshCw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { UserAvatar } from '@/components/app/UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { useProfileAvatar } from '@/hooks/use-profile-avatar-cache';
import { useDaoTreasury, useContributeToDao, useOwnDhbBalance } from '@/hooks/use-dao-treasury';
import { getAccountInfo } from '@/lib/api/dehub';
import { DAO_TREASURY_ADDRESS, daoTxUrl, shortAddress, type DaoContributor, type DaoContribution } from '@/lib/dao-treasury';

const QUICK_AMOUNTS = [100, 1_000, 10_000];

function formatDhb(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 10_000) return Math.round(amount).toLocaleString();
  if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return amount.toFixed(4);
}

function formatShare(share: number): string {
  const pct = share * 100;
  if (pct === 0) return '0%';
  if (pct < 0.01) return '<0.01%';
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
}

function useContributorProfile(address: string) {
  const avatar = useProfileAvatar(address);
  const { data: user } = useQuery({
    queryKey: ['dao-contributor-profile', address],
    queryFn: () => getAccountInfo(address).catch(() => null),
    staleTime: 10 * 60_000,
  });
  const username = user?.username || null;
  return {
    avatar,
    name: user?.displayName || username || shortAddress(address),
    handle: username ? `@${username}` : shortAddress(address),
  };
}

function ContributorRow({ row, rank, isSelf }: { row: DaoContributor; rank: number; isSelf: boolean }) {
  const { t } = useTranslation();
  const profile = useContributorProfile(row.address);
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-3 ${isSelf ? 'bg-white/10' : 'bg-white/[0.03]'}`}>
      <span className="w-6 text-center text-xs font-semibold text-zinc-500 tabular-nums">{rank}</span>
      <UserAvatar name={profile.name} handle={profile.handle} avatarUrl={profile.avatar} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-white truncate">{profile.name}</span>
          {isSelf && <span className="text-[10px] uppercase tracking-wide text-zinc-400">{t('dao.you')}</span>}
        </div>
        <div className="text-xs text-zinc-500 truncate">
          {profile.handle} · {t('dao.transferCount', { count: row.txCount })}
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-white/70 rounded-full" style={{ width: `${Math.max(1, row.share * 100)}%` }} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-white tabular-nums">{formatDhb(row.amount)} DHB</div>
        <div className="text-xs text-zinc-400 tabular-nums">{formatShare(row.share)} {t('dao.power')}</div>
      </div>
    </div>
  );
}

function RecentRow({ item }: { item: DaoContribution }) {
  const profile = useContributorProfile(item.from);
  const when = item.timestamp ? new Date(item.timestamp * 1000).toLocaleDateString() : '';
  return (
    <a
      href={daoTxUrl(item.chainId, item.txHash)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
    >
      <span className="text-sm text-zinc-300 truncate">{profile.name}</span>
      <span className="text-xs text-zinc-500 shrink-0">{when}</span>
      <span className="text-sm font-medium text-white tabular-nums shrink-0">+{formatDhb(item.amount)}</span>
      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
    </a>
  );
}

function ContributeDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [amount, setAmount] = useState('');
  const contribute = useContributeToDao();
  const { data: held } = useOwnDhbBalance(open && isAuthenticated);

  const parsed = Math.floor(Number(amount));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const handleSend = () => {
    if (!valid) return;
    contribute.mutate(parsed, {
      onSuccess: (result) => {
        toast.success(t('dao.sentTitle'), {
          description: t('dao.sentDesc', { amount: parsed.toLocaleString(), chain: result.chain }),
          action: {
            label: t('dao.viewTx'),
            onClick: () => window.open(daoTxUrl(result.chainId, result.txHash), '_blank', 'noopener'),
          },
        });
        setAmount('');
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(t('dao.sendFailed'), { description: err instanceof Error ? err.message : undefined });
      },
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column className="bg-black/60 backdrop-blur-[24px] border-white/10 max-h-[85dvh]">
        <DrawerHeader>
          <DrawerTitle className="text-white text-lg font-bold">{t('dao.contribute')}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4">
          <p className="text-sm text-zinc-400">{t('dao.contributeIntro')}</p>

          <div>
            <label className="text-zinc-400 text-xs font-medium mb-1 block">{t('dao.amountLabel')}</label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 rounded-xl"
            />
            <div className="flex items-center justify-between mt-2 gap-2">
              <div className="flex gap-1.5">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(String(q))}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300 transition-colors"
                  >
                    {q.toLocaleString()}
                  </button>
                ))}
              </div>
              {typeof held === 'number' && (
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.floor(held)))}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  {t('dao.youHold', { amount: formatDhb(held) })}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-zinc-500">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{t('dao.irreversible')}</span>
          </div>

          <Button
            onClick={handleSend}
            disabled={!valid || contribute.isPending}
            variant="glass"
            className="w-full rounded-xl font-semibold"
          >
            {contribute.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <HeartHandshake className="w-4 h-4" />
                {valid ? t('dao.sendAmount', { amount: parsed.toLocaleString() }) : t('dao.contribute')}
              </>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default function DaoPage() {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();
  const { data, isLoading, isFetching, refetch, isError } = useDaoTreasury();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  const self = walletAddress?.toLowerCase() ?? null;
  const ownRow = useMemo(
    () => (self ? data?.contributors.find((c) => c.address === self) ?? null : null),
    [data, self],
  );

  const copyAddress = () => {
    navigator.clipboard.writeText(DAO_TREASURY_ADDRESS);
    setCopied(true);
    toast.success(t('dao.addressCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContribute = () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    setDrawerOpen(true);
  };

  return (
    <div className="min-h-screen">
      <SEOHead
        title="DAO Treasury — Fund DeHub and Earn a Say"
        description="The DeHub DAO treasury: one wallet anyone can send DHB to. See its live balance, who has contributed, and the share of the pool each contributor holds when the DAO decides how it is spent."
        url="https://dehub.io/dao"
        image="https://dehub.io/og/dao.jpg"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'DeHub DAO Treasury',
          url: 'https://dehub.io/dao',
          description: 'The DeHub DAO treasury — live balance, contributors and their decision-making share.',
          isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' },
        }}
      />
      <h1 className="sr-only">DeHub DAO Treasury — Decentralised, User Owned Social Media</h1>

      {/* Sticky nav pill */}
      <div data-feed-nav-outer className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2">
        <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                <Landmark className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-white">{t('dao.title')}</h1>
                <p className="text-zinc-500 text-sm truncate">{t('dao.subtitle')}</p>
              </div>
            </div>
            <Button onClick={handleContribute} variant="glass" className="rounded-xl font-semibold text-sm shrink-0" size="sm">
              <HeartHandshake className="w-4 h-4" />
              <span className="hidden sm:inline">{t('dao.contribute')}</span>
            </Button>
          </div>
        </div>
      </div>

      <div ref={contentRef} className="px-2 sm:px-3 pb-24 pt-3 space-y-3">
        {/* Balance */}
        <section className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">{t('dao.treasuryBalance')}</div>
              <div className="text-3xl sm:text-4xl font-bold text-white tabular-nums mt-1">
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-zinc-500" /> : `${formatDhb(data?.totalBalance ?? 0)} DHB`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label={t('dao.refresh')}
              className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {data && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {data.balances.map((b) => (
                <a
                  key={b.chainId}
                  href={`${b.explorerUrl}/address/${DAO_TREASURY_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2 transition-colors"
                >
                  <div className="text-[11px] text-zinc-500">{b.name}</div>
                  <div className="text-sm font-semibold text-white tabular-nums">{formatDhb(b.amount)}</div>
                </a>
              ))}
            </div>
          )}

          <div className="mt-4">
            <div className="text-xs text-zinc-500 mb-1">{t('dao.treasuryAddress')}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 font-mono text-xs sm:text-sm text-zinc-300 bg-black/40 rounded-lg px-3 py-2 break-all">
                {DAO_TREASURY_ADDRESS}
              </code>
              <Button variant="outline" size="sm" onClick={copyAddress} className="shrink-0 rounded-lg" aria-label={t('dao.copyAddress')}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">{t('dao.sendAnyWallet')}</p>
          </div>

          {isError && !data && (
            <p className="text-sm text-red-400 mt-3">{t('dao.loadFailed')}</p>
          )}
        </section>

        {/* Your share */}
        {isAuthenticated && data && (
          <section className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{t('dao.yourPower')}</div>
            {ownRow ? (
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold text-white tabular-nums">{formatShare(ownRow.share)}</div>
                  <div className="text-sm text-zinc-400">{t('dao.yourContribution', { amount: formatDhb(ownRow.amount) })}</div>
                </div>
                <Button onClick={handleContribute} variant="glass" size="sm" className="rounded-xl">
                  {t('dao.addMore')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-400">{t('dao.noContributionYet')}</p>
                <Button onClick={handleContribute} variant="glass" size="sm" className="rounded-xl shrink-0">
                  {t('dao.contribute')}
                </Button>
              </div>
            )}
          </section>
        )}

        {/* How power works */}
        <section className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-white mb-1">{t('dao.howItWorksTitle')}</h2>
          <p className="text-sm text-zinc-400">{t('dao.howItWorksBody')}</p>
        </section>

        {/* Contributors */}
        <section className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">{t('dao.contributors')}</h2>
            {data && (
              <span className="text-xs text-zinc-500">
                {t('dao.pooledTotal', { amount: formatDhb(data.totalContributed) })}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
            </div>
          ) : data && data.contributors.length > 0 ? (
            <div className="space-y-2">
              {data.contributors.map((row, i) => (
                <ContributorRow key={row.address} row={row} rank={i + 1} isSelf={row.address === self} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">{t('dao.noContributors')}</p>
          )}
        </section>

        {/* Recent */}
        {data && data.recent.length > 0 && (
          <section className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-white mb-3">{t('dao.recent')}</h2>
            <div className="space-y-1.5">
              {data.recent.map((item) => <RecentRow key={`${item.chainId}-${item.txHash}`} item={item} />)}
            </div>
          </section>
        )}
      </div>

      <ContributeDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
