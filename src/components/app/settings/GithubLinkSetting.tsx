import { useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AuthContext } from '@/contexts/AuthContext';
import { GithubMark } from '@/components/app/profile/GithubMark';
import { githubLink, githubProfileUrl, type GithubLinkResult } from '@/lib/github-link';
import { SETTINGS_INLINE_ACTION_CLASS, SETTINGS_LABEL_CLASS } from './SettingsRow';

const RESULTS: readonly GithubLinkResult[] = ['connected', 'taken', 'cancelled', 'failed'];

/**
 * GitHub in Settings → Profile → Links. Unlike the rows around it there is no
 * box to type in: the account is proven by signing in to GitHub, so the
 * profile can only ever show a GitHub its owner controls.
 */
export function GithubLinkSetting({ address }: { address?: string } = {}) {
  const { t } = useTranslation();
  // Read softly so the state gallery, which has no AuthProvider, can show it.
  const auth = useContext(AuthContext);
  const owner = address ?? auth?.user?.address;
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ['github-link', owner],
    queryFn: githubLink.status,
    enabled: !!owner,
    staleTime: 30_000,
  });

  // Coming back from GitHub: say how it went once, then tidy the address bar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('github') as GithubLinkResult | null;
    if (!result || !RESULTS.includes(result)) return;
    params.delete('github');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    if (result === 'connected') toast.success(t('githubLink.connected'));
    else if (result === 'taken') toast.error(t('githubLink.taken'));
    else if (result === 'failed') toast.error(t('githubLink.failed'));
    void status.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      window.location.assign(await githubLink.connect());
    } catch {
      toast.error(t('githubLink.failed'));
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await githubLink.disconnect();
      await status.refetch();
      toast.success(t('githubLink.disconnected'));
    } catch {
      toast.error(t('githubLink.failed'));
    } finally {
      setBusy(false);
    }
  };

  const data = status.data;
  return (
    <div id="github-link" data-setting-anchor="github-link">
      <span className={SETTINGS_LABEL_CLASS}>GitHub</span>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-5 shrink-0 items-center justify-center text-zinc-500">
          <GithubMark className="size-5" />
        </div>
        {status.isPending ? (
          <div className="h-8 w-28 animate-pulse rounded-lg theme-skeleton" />
        ) : data?.connected && data.login ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <a
              href={githubProfileUrl(data.login)}
              target="_blank"
              rel="noopener noreferrer me"
              className="flex min-w-0 items-center gap-1.5 text-sm text-white hover:underline"
            >
              <span className="truncate">@{data.login}</span>
              <BadgeCheck className="size-4 shrink-0 text-emerald-400" aria-label={t('githubLink.verifiedAria')} />
            </a>
            <Button
              type="button"
              variant="outline"
              className={`${SETTINGS_INLINE_ACTION_CLASS} ml-auto`}
              disabled={busy}
              onClick={() => void disconnect()}
            >
              {t('githubLink.disconnect')}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className={SETTINGS_INLINE_ACTION_CLASS}
            disabled={busy || (data ? !data.available : status.isError)}
            onClick={() => void connect()}
          >
            {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            {t('githubLink.connect')}
          </Button>
        )}
      </div>
      {!data?.connected && !status.isPending ? (
        <p className="mt-2 pl-8 text-xs text-zinc-500">
          {data && !data.available ? t('githubLink.unavailable') : t('githubLink.hint')}
        </p>
      ) : null}
    </div>
  );
}
