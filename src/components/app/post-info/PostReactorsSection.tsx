/**
 * Who reacted, on the author's own Post Info page.
 *
 * Same data and the same author-only gate as ReactionInfoDrawer (the ⓘ in the
 * reaction tray): /api/post-likers only sends person rows to the post owner,
 * so this card renders nothing when `canViewLikers` comes back false. It shows
 * the first few people inline and hands the full grouped list to the drawer.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { getPostLikers, type PostLiker } from '@/lib/api/dehub';
import { REACTION_LIST } from '@/lib/reactions';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { engagementWeight, NO_BADGE_ENGAGEMENT_WEIGHT } from '@/lib/engagement-weight';
import { ReactionInfoDrawer } from '@/components/app/cards/ReactionInfoDrawer';

const PREVIEW_COUNT = 5;
const EMOJI = new Map(REACTION_LIST.map((meta) => [meta.key, meta.emoji]));

export function PostReactorsSection({ tokenId }: { tokenId: string | number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['post-info-reactors', String(tokenId)],
    queryFn: () => getPostLikers(tokenId, 0, PREVIEW_COUNT),
    staleTime: 1000 * 30,
  });

  if (!isLoading && data?.canViewLikers === false) return null;

  const people = data?.data ?? [];
  const anonymousCount = data?.anonymousBadgeHolderCount ?? 0;
  const totalCount = data?.weightedTotalCount ?? data?.pagination?.totalCount ?? 0;
  const hasMore = !!data?.pagination?.hasMore || anonymousCount > 0;

  const goToProfile = (person: PostLiker) => {
    if (person.username) navigate(`/${person.username.replace('@', '')}`);
    else if (person.address) navigate(`/app/profile?id=${person.address}`);
  };

  return (
    <section data-post-reactors className="bg-white/5 rounded-xl p-4 border border-white/10">
      <h2 className="text-sm font-medium text-white/60 mb-3">
        {t('reactionInfo.title')}
        {totalCount > 0 && <span className="text-white/40 font-normal"> · {totalCount}</span>}
      </h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      ) : people.length === 0 && anonymousCount === 0 ? (
        <p className="text-sm text-white/60">{t('reactionInfo.empty')}</p>
      ) : (
        <div className="space-y-2">
          {people.map((person) => {
            const displayName = person.displayName || person.username || person.address?.slice(0, 8) || '?';
            const avatarUrl = buildAvatarUrl(person.address, extractAvatarPath(person));
            const hasBadge = engagementWeight(person.badgeBalance, person.username) > NO_BADGE_ENGAGEMENT_WEIGHT;
            return (
              // A div, not a button, so themes paint it like the Engagement
              // tiles above rather than as a control.
              <div
                key={person.address}
                role="button"
                tabIndex={0}
                onClick={() => goToProfile(person)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToProfile(person);
                  }
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left cursor-pointer"
              >
                <Avatar className="w-9 h-9 rounded-lg">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                  <AvatarFallback className="bg-zinc-800 text-white rounded-lg text-sm">
                    {displayName[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 font-semibold text-white text-sm">
                    <span className="truncate">{displayName}</span>
                    {hasBadge && (
                      <BadgeIcon badgeBalance={person.badgeBalance} username={person.username} className="w-[1em] h-[1em] shrink-0" />
                    )}
                  </span>
                  {person.username && (
                    <span className="text-white/50 text-xs truncate block">@{person.username.replace('@', '')}</span>
                  )}
                </div>
                <span aria-hidden="true" className="text-lg leading-none shrink-0">
                  {EMOJI.get(person.reaction ?? 'like') ?? EMOJI.get('like')}
                </span>
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              {t('reactionInfo.seeWhoReacted')}
            </button>
          )}
        </div>
      )}

      <ReactionInfoDrawer open={showAll} onOpenChange={setShowAll} tokenId={tokenId} />
    </section>
  );
}
