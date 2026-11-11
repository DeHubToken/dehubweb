/**
 * Explore on phones: Follow suggestions as one line per person. Loaded only
 * when Explore asks for rows.
 *
 * @module components/app/explore/SuggestionRows
 */
import { useTranslation } from 'react-i18next';
import ExploreFollowRows from '@/components/app/explore/ExploreFollowRows';
import type { SuggestedAccount } from '@/lib/api/dehub';

export default function SuggestionRows({
  users,
  phases,
  onOpen,
  onFollow,
}: {
  users: SuggestedAccount[];
  phases: ReadonlyMap<string, 'following' | 'leaving'>;
  onOpen: (user: SuggestedAccount) => void;
  onFollow: (user: SuggestedAccount) => void;
}) {
  const { t } = useTranslation();
  return (
    <ExploreFollowRows
      icon="subscriptions"
      title={t('copy.a94bfc8a15e8', { defaultValue: 'Follow suggestions' })}
      items={users.map((user) => ({ user, phase: phases.get(user.address) }))}
      onOpen={onOpen}
      onFollow={onFollow}
      data-who-to-follow
    />
  );
}
