/**
 * Credit lines for reactions to DeHub videos.
 *
 *   ReactionOfChip   on a reaction post: "Reaction to @creator", to the original
 *   ReactionsLink    on an original: "12 reactions", to its reactions page
 *   ReactingToChip   on a live stream: "Reacting to @creator" while it is on screen
 *
 * Each chip that names an original counts as a view of it when it comes into
 * view: the reaction is showing the original, so the original gets the credit.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { MonitorPlay } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFeedViewTrackingCallback } from '@/hooks/use-view-tracking';
import { currentLiveReaction, reactionSummary, type ReactionSummary } from '@/lib/api/remix-links';

function useSummary(tokenId: string | number | undefined) {
  const [summary, setSummary] = useState<ReactionSummary | null>(null);
  useEffect(() => {
    let live = true;
    setSummary(null);
    if (tokenId) void reactionSummary(tokenId).then((s) => { if (live) setSummary(s); });
    return () => { live = false; };
  }, [tokenId]);
  return summary;
}

const chipClass = 'inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md hover:bg-black/70';

function OriginalLink({ tokenId, username, label, className }: { tokenId: number; username: string | null; label: string; className?: string }) {
  // The tracker is typed for the feed's divs; it only observes the element.
  const credit = useFeedViewTrackingCallback(String(tokenId)) as unknown as (element: HTMLAnchorElement | null) => void;
  return (
    <Link ref={credit} to={`/app/post/${tokenId}`} className={cn(chipClass, className)} onClick={(e) => e.stopPropagation()}>
      <MonitorPlay className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{username ? `${label} @${username}` : label}</span>
    </Link>
  );
}

export function ReactionOfChip({ tokenId, className }: { tokenId: string | number | undefined; className?: string }) {
  const { t } = useTranslation();
  const summary = useSummary(tokenId);
  const of = summary?.reactionOf;
  if (!of) return null;
  return <OriginalLink tokenId={of.tokenId} username={of.username} label={t('reactions.reactionTo', 'Reaction to')} className={className} />;
}

export function ReactionsLink({ tokenId, className }: { tokenId: string | number | undefined; className?: string }) {
  const { t } = useTranslation();
  const summary = useSummary(tokenId);
  if (!summary?.reactions) return null;
  return (
    <Link to={`/app/post/${tokenId}/reactions`} className={cn(chipClass, className)} onClick={(e) => e.stopPropagation()}>
      <MonitorPlay className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t('reactions.count', { count: summary.reactions, defaultValue: summary.reactions === 1 ? '1 reaction' : '{{count}} reactions' })}
    </Link>
  );
}

export function ReactingToChip({ streamTokenId, live, className }: { streamTokenId: string | number | undefined; live: boolean; className?: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['live-reaction', String(streamTokenId)],
    queryFn: () => currentLiveReaction(streamTokenId!),
    enabled: !!streamTokenId && live,
    refetchInterval: 20_000,
    staleTime: 15_000,
  });
  if (!live || !data) return null;
  return <OriginalLink tokenId={data.sourceTokenId} username={data.sourceUsername} label={t('reactions.reactingTo', 'Reacting to')} className={className} />;
}
