import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SOCIAL_CONFIGS } from '@/components/app/profile/ProfileSocialLinks';
import { formatCount } from '@/lib/feed-utils';
import { cn } from '@/lib/utils';
import { computeSocialReach, hasSocialReach } from '@/lib/social-reach';

interface TotalReachPillProps {
  /** The profile's merged customs blob: social links plus self-reported counts. */
  customs?: Record<string, unknown> | null;
  /** DeHub followers as counted by DeHub. */
  followers?: number | null;
  className?: string;
}

/**
 * "Total reach" beside the follower count: DeHub followers plus what the
 * creator reports for each linked social. Renders nothing until at least one
 * social carries a count, so a profile with links alone looks as it always
 * did. Hover opens the breakdown on a pointer device; a tap toggles it.
 */
export function TotalReachPill({ customs, followers, className }: TotalReachPillProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  const reach = computeSocialReach(customs, followers);
  if (!hasSocialReach(reach)) return null;

  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  // The content is portaled, so the pointer leaves the trigger on its way to
  // the card. A short grace period keeps the card open across that gap.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  const total = formatCount(reach.total);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => {
            cancelClose();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          aria-label={`${total} ${t('profile.reach.total')}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-xs text-zinc-400 transition-colors hover:bg-white/20 hover:text-zinc-200',
            className,
          )}
        >
          <span className="font-bold text-white">{total}</span>
          <span>{t('profile.reach.total')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 p-3"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <p className="text-xs font-medium text-zinc-400">{t('profile.reach.breakdownTitle')}</p>
        <ul className="mt-2 space-y-1.5">
          <li className="flex items-center gap-2 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center text-zinc-400">
              <Users className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-zinc-300">{t('profile.reach.dehubFollowers')}</span>
            <span className="font-semibold tabular-nums text-white">{formatCount(reach.dehub)}</span>
          </li>
          {reach.socials.map((entry) => {
            const config = SOCIAL_CONFIGS.find((c) => c.key === `${entry.platform}Link`);
            return (
              <li key={entry.platform} className="flex items-center gap-2 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center text-zinc-400">
                  {config?.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-zinc-300">{entry.label}</span>
                <span className="font-semibold tabular-nums text-white">{formatCount(entry.count)}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-sm">
          <span className="text-zinc-300">{t('profile.reach.total')}</span>
          <span className="font-bold tabular-nums text-white">{total}</span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-zinc-500">{t('profile.reach.selfReported')}</p>
      </PopoverContent>
    </Popover>
  );
}
