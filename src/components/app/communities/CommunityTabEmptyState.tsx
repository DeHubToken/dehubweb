import { ProfileEmptyState } from '@/components/app/profile/ProfileEmptyState';
import postsIcon from '@/assets/icons/community-posts-3d-icon.png';
import chatIcon from '@/assets/icons/community-chat-3d-icon.png';
import eventsIcon from '@/assets/icons/community-events-3d-icon.png';
import membersIcon from '@/assets/icons/community-members-3d-icon.png';
import aboutIcon from '@/assets/icons/community-about-3d-icon.png';

export type CommunityTab = 'posts' | 'chat' | 'events' | 'members' | 'about';

const TAB_DETAILS: Record<CommunityTab, { iconSrc: string; label: string }> = {
  posts: { iconSrc: postsIcon, label: 'posts' },
  chat: { iconSrc: chatIcon, label: 'chat' },
  events: { iconSrc: eventsIcon, label: 'events' },
  members: { iconSrc: membersIcon, label: 'members' },
  about: { iconSrc: aboutIcon, label: 'community details' },
};

interface CommunityTabEmptyStateProps {
  tab: CommunityTab;
  isPendingApproval: boolean;
}

export function CommunityTabEmptyState({ tab, isPendingApproval }: CommunityTabEmptyStateProps) {
  const details = TAB_DETAILS[tab];

  return (
    <ProfileEmptyState
      iconSrc={details.iconSrc}
      iconAlt={`${details.label} unavailable`}
      title={isPendingApproval ? 'Approval pending' : `Join to view ${details.label}`}
      subtitle={
        isPendingApproval
          ? `You'll see ${details.label} when an admin approves your request`
          : `Become a member to see this community's ${details.label}`
      }
    />
  );
}
