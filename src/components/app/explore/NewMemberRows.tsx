/**
 * Explore on phones: New members as one line per person, with how long ago
 * each joined. Loaded only when Explore asks for rows.
 *
 * @module components/app/explore/NewMemberRows
 */
import { useTranslation } from 'react-i18next';
import ExploreFollowRows from '@/components/app/explore/ExploreFollowRows';
import { toAccount } from '@/components/app/NewMembersCarousel';
import { joinedAgoLabel, type NewMember } from '@/hooks/use-new-members';
import type { SuggestedAccount } from '@/lib/api/dehub';

export default function NewMemberRows({
  title,
  members,
  isFollowed,
  isRequested,
  onOpen,
  onFollow,
  onLoadMore,
  loadingMore,
}: {
  title: string;
  members: NewMember[];
  isFollowed: (member: NewMember) => boolean;
  isRequested: (member: NewMember) => boolean;
  onOpen: (user: SuggestedAccount) => void;
  onFollow: (user: SuggestedAccount) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  const { t } = useTranslation();
  const items = members.map((member) => {
    const requested = isRequested(member);
    return {
      user: toAccount(member),
      phase: isFollowed(member) || requested ? ('following' as const) : undefined,
      followedLabel: requested ? t('copy.2d9e28289fac', { defaultValue: 'Requested' }) : undefined,
      meta: joinedAgoLabel(member.joinedAt),
    };
  });
  return (
    <ExploreFollowRows
      id="new-members"
      icon="communities"
      title={title}
      items={items}
      onOpen={onOpen}
      onFollow={onFollow}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      data-new-members
    />
  );
}
