import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Share2 from "@/components/ui/cut-icons/feedshare";


import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCrossPostStore } from '@/store/crossPostStore';
import { PLATFORM_NAMES, getMultipostStatus } from '@/lib/multipost';
import { creditsFor } from '@/lib/social-pricing';
import { MULTIPOST_QUERY_KEY, PlatformIcon } from '@/components/app/settings/MultiPostSettings';

export function useCrossPostAccountCount(enabled: boolean) {
  const { isAuthenticated } = useAuth();
  const selected = useCrossPostStore(state => state.selected);
  const status = useQuery({ queryKey: MULTIPOST_QUERY_KEY, queryFn: getMultipostStatus, enabled: enabled && isAuthenticated, staleTime: 60_000 });
  if (!enabled || !isAuthenticated || status.isError) return 0;
  return (status.data?.accounts ?? []).filter(account => !account.pending && selected.includes(account.id)).length;
}

/**
 * Multi-post controls inside the shared composer options sheet. Connected
 * accounts stay selectable without stacking another overlay over the sheet.
 */
export function CrossPostPicker({ onNavigateAway }: { onNavigateAway?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { selected, toggle } = useCrossPostStore();
  const status = useQuery({ queryKey: MULTIPOST_QUERY_KEY, queryFn: getMultipostStatus, enabled: isAuthenticated, staleTime: 60_000 });

  if (!isAuthenticated) return null;
  const accounts = status.isError ? [] : (status.data?.accounts ?? []).filter((a) => !a.pending);
  const chosen = accounts.filter((a) => selected.includes(a.id));
  const active = chosen.reduce((sum, a) => sum + creditsFor(a.platform), 0);

  const openSettings = () => {
    onNavigateAway?.();
    navigate('/app/settings?tab=multipost');
  };

  const label = t('multiPost.title');
  const icon = (
    <span className="relative flex">
      <Share2 className="w-5 h-5 text-white" />
      {chosen.length > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold leading-none text-black">
          {chosen.length}
        </span>
      )}
    </span>
  );

  if (!accounts.length) {
    return (
      <button type="button" onClick={openSettings} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-white hover:bg-white/10">
        {icon}
        <span>{label}{status.isError && <span className="block text-xs text-white/60">{t('multiPost.loadFailed')}</span>}</span>
      </button>
    );
  }

  return (
    <section className="px-4 py-3" aria-label={label}>
        <div className="mb-3 flex items-center gap-3 text-sm text-white">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/60">
          <span>{t('multiPost.alsoPostTo')}</span>
          {active > 0 && <span>{t('multiPost.creditsUsed', { count: active, balance: status.data?.credits ?? 0 })}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {accounts.map((account) => {
            const on = selected.includes(account.id);
            return (
              <button
                key={account.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(account.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  on ? 'border-white/60 bg-white/15 text-white' : 'border-white/15 text-white/60 hover:border-white/30',
                )}
              >
                <PlatformIcon platform={account.platform} />
                {account.username || PLATFORM_NAMES[account.platform]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={openSettings}
            className="rounded-full border border-dashed border-white/20 px-2.5 py-1 text-xs text-white/60 hover:border-white/40"
          >
            {t('multiPost.manage')}
          </button>
        </div>
    </section>
  );
}
