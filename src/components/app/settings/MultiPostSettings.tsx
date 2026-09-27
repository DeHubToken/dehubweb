import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Coins, Link2, Plus, Share2, Unlink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useAuth } from '@/contexts/AuthContext';
import { SOCIAL_CONFIGS } from '@/components/app/profile/ProfileSocialLinks';
import { SETTINGS_CONTROL_CLASS, SETTINGS_HEADING_CLASS, SettingsRow } from '@/components/app/settings/SettingsRow';
import { BUNDLE_STOPS, PRICE_PER_POST_USD, bundleDiscount, bundlePriceUsd } from '@/lib/social-pricing';
import {
  MULTIPOST_PLATFORMS, PLATFORM_NAMES, buyCredits, disconnectAccount, getMultipostStatus, startConnect,
} from '@/lib/multipost';

const ICON_KEY: Record<string, string> = {
  twitter: 'twitterLink', instagram: 'instagramLink', tiktok: 'tiktokLink',
  youtube: 'youtubeLink', discord: 'discordLink', facebook: 'facebookLink',
};

export function PlatformIcon({ platform }: { platform: string }) {
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
  const [stopIndex, setStopIndex] = useState(3);
  const [buying, setBuying] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const status = useQuery({
    queryKey: MULTIPOST_QUERY_KEY,
    queryFn: getMultipostStatus,
    enabled: isAuthenticated,
    staleTime: 30_000,
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

  const posts = BUNDLE_STOPS[stopIndex];
  const discount = bundleDiscount(posts);
  const total = bundlePriceUsd(posts);
  const accounts = status.data?.accounts ?? [];
  const connectedPlatforms = new Set(accounts.map((a) => a.platform));

  const handleConnect = async (platform: string) => {
    setConnecting(platform);
    try {
      const redirect = `${window.location.origin}/app/settings?tab=multipost`;
      window.location.href = await startConnect(platform, redirect);
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
      await buyCredits(posts, walletAddress ?? null);
      toast.success(t('multiPost.bought', { count: posts }));
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
              {t('multiPost.creditExplainer')}{' '}
              {t('multiPost.payAsYouGo', { price: PRICE_PER_POST_USD.toFixed(2) })}
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
            aria-valuetext={t('multiPost.topUpPosts', { count: posts })}
          />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
            {BUNDLE_STOPS.map((s) => <span key={s}>{s}</span>)}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-white">{t('multiPost.topUpPosts', { count: posts })}</div>
              <div className="text-xs text-zinc-400">
                {t('multiPost.total', { usd: total.toFixed(2) })} · {t('multiPost.perPost', { price: (total / posts).toFixed(3) })}
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
              description={account.username ? `@${account.username.replace(/^@/, '')}` : undefined}
              action={
                <Button className={SETTINGS_CONTROL_CLASS} onClick={() => handleDisconnect(account.id)}>
                  <Unlink className="mr-1.5 h-3.5 w-3.5" />{t('multiPost.disconnect')}
                </Button>
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
        <p className="mt-3 text-xs text-zinc-500">{t('multiPost.platformNotes')}</p>
      </section>
    </div>
  );
}
