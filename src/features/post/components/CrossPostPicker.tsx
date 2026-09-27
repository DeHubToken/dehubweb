import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Share2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCrossPostStore } from '@/store/crossPostStore';
import { PLATFORM_NAMES, getMultipostStatus } from '@/lib/multipost';
import { creditsFor } from '@/lib/social-pricing';
import { MULTIPOST_QUERY_KEY, PlatformIcon } from '@/components/app/settings/MultiPostSettings';

export function CrossPostPicker({ onNavigateAway }: { onNavigateAway?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { selected, toggle } = useCrossPostStore();
  const status = useQuery({ queryKey: MULTIPOST_QUERY_KEY, queryFn: getMultipostStatus, enabled: isAuthenticated, staleTime: 60_000 });

  if (!isAuthenticated || status.isError) return null;
  const accounts = (status.data?.accounts ?? []).filter((a) => !a.pending);
  const active = accounts.filter((a) => selected.includes(a.id)).reduce((sum, a) => sum + creditsFor(a.platform), 0);

  const openSettings = () => {
    onNavigateAway?.();
    navigate('/app/settings?tab=multipost');
  };

  return (
    <div className="px-4 pb-3">
      <div className="mb-2 flex items-center justify-between text-xs text-white/60">
        <span className="flex items-center gap-1.5"><Share2 className="h-3.5 w-3.5" />{t('multiPost.alsoPostTo')}</span>
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
          {accounts.length ? t('multiPost.manage') : t('multiPost.setUp')}
        </button>
      </div>
    </div>
  );
}
