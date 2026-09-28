import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Share2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCrossPostStore } from '@/store/crossPostStore';
import { PLATFORM_NAMES, getMultipostStatus } from '@/lib/multipost';
import { creditsFor } from '@/lib/social-pricing';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MULTIPOST_QUERY_KEY, PlatformIcon } from '@/components/app/settings/MultiPostSettings';

/**
 * One icon in the composer's toolbar for posting to other platforms. With no
 * accounts connected it goes straight to setup; otherwise it opens the account
 * picker, and the badge counts how many are switched on for this post.
 */
export function CrossPostPicker({ onNavigateAway }: { onNavigateAway?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { selected, toggle } = useCrossPostStore();
  const [open, setOpen] = useState(false);
  const status = useQuery({ queryKey: MULTIPOST_QUERY_KEY, queryFn: getMultipostStatus, enabled: isAuthenticated, staleTime: 60_000 });

  if (!isAuthenticated || status.isError) return null;
  const accounts = (status.data?.accounts ?? []).filter((a) => !a.pending);
  const chosen = accounts.filter((a) => selected.includes(a.id));
  const active = chosen.reduce((sum, a) => sum + creditsFor(a.platform), 0);

  const openSettings = () => {
    setOpen(false);
    onNavigateAway?.();
    navigate('/app/settings?tab=multipost');
  };

  const label = accounts.length ? t('multiPost.alsoPostTo') : t('multiPost.setUp');
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
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={openSettings} aria-label={label} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn('p-2 hover:bg-white/10 rounded-xl transition-colors', chosen.length > 0 && 'bg-white/20')}
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 bg-zinc-900/90 backdrop-blur-xl border border-white/10 shadow-xl rounded-xl z-[150]"
        align="start"
        side="top"
        sideOffset={8}
      >
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
      </PopoverContent>
    </Popover>
  );
}
