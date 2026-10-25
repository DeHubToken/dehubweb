import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth as useAuthContext } from '@/contexts/AuthContext';
import { socialReachQueryKey, useSocialReach } from '@/hooks/use-social-reach';
import { formatCount } from '@/lib/feed-utils';
import { startConnect } from '@/lib/multipost';
import {
  SOCIAL_REACH_PLATFORMS,
  isReachPlatform,
  syncSocialReach,
  type SocialPlatform,
  type VerifiedSocialAccount,
} from '@/lib/social-reach';
import { SETTINGS_INLINE_ACTION_CLASS } from './SettingsRow';

// Same key as MultiPostSettings, which lists the same connections.
const MULTIPOST_QUERY_KEY = ['multipost', 'status'];

// Query params the connect provider appends on the way back.
const RETURN_PARAMS = ['connected', 'error', 'error_message', 'platform', 'profileId', 'accountId', 'username', 'request_id', 'stage', 'is_user_fixable', 'error_reason', 'reach'];

/**
 * The signed-in creator's connected accounts, plus the return leg of a
 * Connect: re-reads the counts straight away and hands the new account to
 * `onConnected` so the settings form can fill an empty link from it.
 */
export function useOwnSocialReach(onConnected?: (account: VerifiedSocialAccount) => void) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { walletAddress } = useAuthContext();
  const query = useSocialReach(walletAddress);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reach') !== '1') return;
    const connected = params.get('connected');
    const failed = params.get('error');
    const platform = connected || params.get('platform') || '';
    const label = SOCIAL_REACH_PLATFORMS.find((p) => p.platform === platform)?.label ?? platform;
    RETURN_PARAMS.forEach((k) => params.delete(k));
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    if (!connected) {
      if (failed) toast.error(t('settings.socialConnectFailed', { platform: label }));
      return;
    }
    qc.invalidateQueries({ queryKey: MULTIPOST_QUERY_KEY });
    syncSocialReach()
      .then((accounts) => {
        if (walletAddress) qc.setQueryData(socialReachQueryKey(walletAddress), accounts);
        const account = accounts.find((a) => a.platform === connected);
        if (account) onConnectedRef.current?.(account);
        toast.success(t('settings.socialConnected', { platform: label }));
      })
      .catch(() => toast.success(t('settings.socialConnected', { platform: label })));
  }, [qc, t, walletAddress]);

  return query;
}

/**
 * Under a social link in Settings: the connected account and its verified
 * follower count, or a Connect button that signs in to the platform.
 */
export function SocialConnectControl({
  platform,
  account,
  loading,
}: {
  platform: SocialPlatform;
  account?: VerifiedSocialAccount;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const label = SOCIAL_REACH_PLATFORMS.find((p) => p.platform === platform)?.label ?? platform;

  const connect = async () => {
    setBusy(true);
    try {
      const redirect = `${window.location.origin}/app/settings?tab=profile&reach=1`;
      const url = await startConnect(platform, redirect);
      if (url) {
        window.location.href = url;
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.socialConnectFailed', { platform: label }));
    }
    setBusy(false);
  };

  if (loading) return <div className="h-8 w-28 animate-pulse rounded-lg theme-skeleton" />;

  if (account && isReachPlatform(account.platform)) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-400">
        <BadgeCheck className="size-4 shrink-0 text-emerald-400" aria-hidden />
        <span className="truncate">
          {account.username ? `@${account.username.replace(/^@/, '')}` : t('settings.socialConnectedShort')}
        </span>
        <span className="shrink-0 text-zinc-500">·</span>
        <span className="shrink-0">
          {account.followers != null
            ? t('settings.socialVerifiedFollowers', { value: formatCount(account.followers) })
            : t('settings.socialFollowersPending')}
        </span>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={SETTINGS_INLINE_ACTION_CLASS}
      disabled={busy}
      onClick={() => void connect()}
      aria-label={t('settings.socialConnectAria', { platform: label })}
    >
      {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
      {t('settings.socialConnect')}
    </Button>
  );
}
