import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Coins, Link2, Plus, Share2, Unlink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useAuth } from '@/contexts/AuthContext';
import { SOCIAL_CONFIGS } from '@/components/app/profile/ProfileSocialLinks';
import { SETTINGS_CONTROL_CLASS, SETTINGS_HEADING_CLASS, SettingsRow } from '@/components/app/settings/SettingsRow';
import {
  BUNDLE_STOPS, CREDIT_PRICE_USD, DEFAULT_PLATFORM_CREDITS, bundleDiscount, bundlePriceUsd, creditsFor,
} from '@/lib/social-pricing';
import {
  MULTIPOST_PLATFORMS, PLATFORM_NAMES, buyCredits, disconnectAccount, getMultipostStatus, startConnect,
} from '@/lib/multipost';

const ICON_KEY: Record<string, string> = {
  twitter: 'twitterLink', instagram: 'instagramLink', tiktok: 'tiktokLink',
  youtube: 'youtubeLink', discord: 'discordLink', facebook: 'facebookLink',
};

const FARCASTER_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 3h16v3h-1.5v14H20v1h-5.5v-1H16v-6.2a4 4 0 0 0-8 0V20h1.5v1H4v-1h1.5V6H4V3Z" />
  </svg>
);

export function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'farcaster') return <span className="[&_svg]:h-4 [&_svg]:w-4">{FARCASTER_ICON}</span>;
  const config = SOCIAL_CONFIGS.find((c) => c.key === ICON_KEY[platform]);
  if (config) return <span className="[&_svg]:h-4 [&_svg]:w-4">{config.icon}</span>;
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded bg-white/15 text-[10px] font-bold uppercase">
      {(PLATFORM_NAMES[platform] ?? platform).charAt(0)}
    </span>
  );
}

export const MULTIPOST_QUERY_KEY = ['multipost', 'status'];

export function MultiPostSettings() {
  const { t } = useTranslation();
  const { isAuthenticated, walletAddress } = useAuth();
  const qc = useQueryClient();
  const [stopIndex, setStopIndex] = useState(2);
  const [buying, setBuying] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const status = useQuery({
    queryKey: MULTIPOST_QUERY_KEY,
    queryFn: getMultipostStatus,
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Farcaster approval happens in another app, so keep checking while it's pending.
    refetchInterval: (query) => (query.state.data?.accounts.some((a) => a.pending) ? 5000 : false),
  });

  // Back from a platform's sign-in page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    if (!connected && !error) return;
    const platform = PLATFORM_NAMES[connected || params.get('platform') || ''] ?? connected ?? '';
    if (connected) toast.success(t('multiPost.connectedToast', { platform }));
    else toast.error(t('multiPost.connectFailed', { platform }));
    ['connected', 'error', 'error_message', 'platform', 'profileId', 'accountId', 'username', 'request_id', 'stage', 'is_user_fixable', 'error_reason']
      .forEach((k) => params.delete(k));
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    qc.invalidateQueries({ queryKey: MULTIPOST_QUERY_KEY });
  }, [qc, t]);

  if (!isAuthenticated) {
    return <p className="text-sm text-zinc-400">{t('multiPost.signIn')}</p>;
  }

  const credits = BUNDLE_STOPS[stopIndex];
  const discount = bundleDiscount(credits);
  const total = bundlePriceUsd(credits);
  const accounts = status.data?.accounts ?? [];
  const connectedPlatforms = new Set(accounts.filter((a) => !a.pending).map((a) => a.platform));

  const handleConnect = async (platform: string) => {
    setConnecting(platform);
    try {
      const redirect = `${window.location.origin}/app/settings?tab=multipost`;
      const url = await startConnect(platform, redirect);
      if (!url) {
        qc.invalidateQueries({ queryKey: MULTIPOST_QUERY_KEY });
        setConnecting(null);
        return;
      }
      if (platform === 'farcaster') {
        // Approval happens in the Farcaster app; stay here and watch for it.
        window.open(url, '_blank', 'noopener');
        qc.invalidateQueries({ queryKey: MULTIPOST_QUERY_KEY });
        setConnecting(null);
        return;
      }
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('multiPost.connectFailed', { platform: PLATFORM_NAMES[platform] }));
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      await disconnectAccount(accountId);
      toast.success(t('multiPost.disconnected'));
      qc.invalidateQueries({ queryKey: MULTIPOST_QUERY_KEY });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBuy = async () => {
    setBuying(true);
    try {
      await buyCredits(credits, walletAddress ?? null);
      toast.success(t('multiPost.bought', { count: credits }));
      qc.invalidateQueries({ queryKey: MULTIPOST_QUERY_KEY });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="space-y-8" data-setting-anchor="multipost">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-white">{t('multiPost.title')}</h2>
        <p className="text-sm text-zinc-400">{t('multiPost.intro')}</p>
      </div>

      <section>
        <h3 className={SETTINGS_HEADING_CLASS}><Coins className="h-4 w-4" />{t('multiPost.creditsHeading')}</h3>
        <SettingsRow
          icon={<Coins />}
          title={t('multiPost.credits', { count: status.data?.credits ?? 0 })}
          description={
            <>
              {t('multiPost.creditRules', { x: creditsFor('twitter'), farcaster: creditsFor('farcaster'), other: DEFAULT_PLATFORM_CREDITS })}{' '}
              {t('multiPost.payAsYouGoCredits', { price: CREDIT_PRICE_USD.toFixed(2) })}
            </>
          }
        />
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-800/40 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-medium text-white">{t('multiPost.topUpTitle')}</span>
            <span className="text-sm text-emerald-400">
              {discount > 0 ? t('multiPost.discount', { percent: Math.round(discount * 100) }) : t('multiPost.noDiscount')}
            </span>
          </div>
          <Slider
            min={0}
            max={BUNDLE_STOPS.length - 1}
            step={1}
            value={[stopIndex]}
            onValueChange={([v]) => setStopIndex(v)}
            aria-label={t('multiPost.topUpTitle')}
            aria-valuetext={t('multiPost.topUpCredits', { count: credits })}
          />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
            {BUNDLE_STOPS.map((s) => <span key={s}>{s >= 1000 ? `${s / 1000}k` : s}</span>)}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-white">{t('multiPost.topUpCredits', { count: credits })}</div>
              <div className="text-xs text-zinc-400">
                {t('multiPost.total', { usd: total.toFixed(2) })} · {t('multiPost.perCredit', { price: (total / credits).toFixed(3) })}
              </div>
            </div>
            <Button className={SETTINGS_CONTROL_CLASS} onClick={handleBuy} disabled={buying}>
              {buying ? t('multiPost.buying') : t('multiPost.buy')}
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h3 className={SETTINGS_HEADING_CLASS}><Link2 className="h-4 w-4" />{t('multiPost.connectedHeading')}</h3>
        {status.isLoading ? (
          <p className="text-sm text-zinc-500">…</p>
        ) : status.isError ? (
          <p className="text-sm text-red-400">{t('multiPost.loadFailed')}</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('multiPost.noAccounts')}</p>
        ) : (
          accounts.map((account) => (
            <SettingsRow
              key={account.id}
              icon={<PlatformIcon platform={account.platform} />}
              title={PLATFORM_NAMES[account.platform] ?? account.platform}
              description={
                account.pending
                  ? t('multiPost.pendingApproval')
                  : account.username ? `@${account.username.replace(/^@/, '')}` : undefined
              }
              action={
                <div className="flex gap-2">
                  {account.pending && account.approvalUrl && (
                    <Button className={SETTINGS_CONTROL_CLASS} onClick={() => window.open(account.approvalUrl, '_blank', 'noopener')}>
                      <Clock className="mr-1.5 h-3.5 w-3.5" />{t('multiPost.approve')}
                    </Button>
                  )}
                  <Button className={SETTINGS_CONTROL_CLASS} onClick={() => handleDisconnect(account.id)}>
                    <Unlink className="mr-1.5 h-3.5 w-3.5" />{t('multiPost.disconnect')}
                  </Button>
                </div>
              }
            />
          ))
        )}
      </section>

      <section>
        <h3 className={SETTINGS_HEADING_CLASS}><Plus className="h-4 w-4" />{t('multiPost.connectMore')}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MULTIPOST_PLATFORMS.map((platform) => (
            <button
              key={platform}
              type="button"
              onClick={() => handleConnect(platform)}
              disabled={connecting !== null}
              className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              <PlatformIcon platform={platform} />
              <span className="flex-1 truncate">{PLATFORM_NAMES[platform]}</span>
              {connectedPlatforms.has(platform)
                ? <Share2 className="h-3.5 w-3.5 text-emerald-400" aria-label={t('multiPost.connectedLabel')} />
                : <span className="text-xs text-zinc-400">{connecting === platform ? '…' : t('multiPost.connect')}</span>}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">{t('multiPost.platformNotes')} {t('multiPost.farcasterNote')}</p>
      </section>
    </div>
  );
}
