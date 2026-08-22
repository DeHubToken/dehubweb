/**
 * One line under the composer telling the user how many main-feed posts they
 * have left today, and what the next badge tier would give them.
 *
 * Silent while the count is loading and for anyone signed out — the login
 * prompt is the thing to show there, not a quota.
 */
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyPostQuotaState } from '@/hooks/use-daily-post-quota';

interface PostQuotaNoticeProps {
  quota: DailyPostQuotaState;
  className?: string;
}

export function PostQuotaNotice({ quota, className }: PostQuotaNoticeProps) {
  // Nothing to say before the server's count lands — and a signed-out visitor
  // never gets a count at all, so this also keeps the quota off the login path.
  if (!quota.isCounted) return null;

  const { allowance, remaining, exhausted, resetsIn } = quota;

  const message = exhausted
    ? `No posts left today — your next one lands in ${resetsIn}.`
    : `${remaining} of ${allowance.postsPerDay} ${allowance.postsPerDay === 1 ? 'post' : 'posts'} left today.`;

  const upsell = allowance.nextTierName
    ? ` ${allowance.nextTierName} unlocks ${allowance.nextTierPosts} a day.`
    : '';

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-4 pb-1 text-[11px] leading-tight',
        exhausted ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
      data-post-quota
      data-exhausted={exhausted ? 'true' : 'false'}
    >
      <Info className="w-3 h-3 shrink-0" aria-hidden />
      <span className="truncate">
        {message}
        {upsell && <span className="opacity-70">{upsell}</span>}
      </span>
    </div>
  );
}

export default PostQuotaNotice;
