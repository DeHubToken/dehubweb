import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { ProfileEmptyState } from '@/components/app/profile/ProfileEmptyState';
import postsIcon from '@/assets/icons/community-posts-3d-icon.webp';
import chatIcon from '@/assets/icons/community-chat-3d-icon.webp';
import eventsIcon from '@/assets/icons/community-events-3d-icon.webp';
import membersIcon from '@/assets/icons/community-members-3d-icon.webp';
import aboutIcon from '@/assets/icons/community-about-3d-icon.webp';
import { useAppTheme } from '@/contexts/ThemeContext';

export type CommunityTab = 'posts' | 'chat' | 'events' | 'members' | 'about';

const TAB_DETAILS: Record<CommunityTab, { iconSrc: string; label: string }> = {
  posts: { iconSrc: postsIcon, get label() { return _translateCopy("copy.a44f1b975171", { defaultValue: "posts" }); } },
  chat: { iconSrc: chatIcon, get label() { return _translateCopy("copy.31e06f7d89fe", { defaultValue: "chat" }); } },
  events: { iconSrc: eventsIcon, get label() { return _translateCopy("copy.862417b9e7c3", { defaultValue: "events" }); } },
  members: { iconSrc: membersIcon, get label() { return _translateCopy("copy.17373ca1c763", { defaultValue: "members" }); } },
  about: { iconSrc: aboutIcon, get label() { return _translateCopy("copy.e959c16ac2ec", { defaultValue: "community details" }); } },
};

interface CommunityTabEmptyStateProps {
  tab: CommunityTab;
  isPendingApproval: boolean;
}

export function CommunityTabEmptyState({ tab, isPendingApproval }: CommunityTabEmptyStateProps) {
  const { t: _copy } = _useCopy();
  const details = TAB_DETAILS[tab];
  const { theme } = useAppTheme();
  // The files share a 256px canvas, but not a common visible-art box. Normalize
  // the transparent padding so every tab sits centred at the same visual size.
  const roomyPack = ['system', 'immersive', 'cosmic', 'lavalamp', 'light', 'minimal'].includes(theme);
  const scale = tab === 'events'
    ? (roomyPack ? 1.2 : 1.06)
    : tab === 'members'
      ? (theme === 'jungle' ? 1.12 : theme === 'osaka' ? 1.08 : 1)
      : 1;
  const scaleClass = scale >= 1.2 ? 'scale-[1.2]' : scale >= 1.12 ? 'scale-[1.12]' : scale >= 1.08 ? 'scale-[1.08]' : scale > 1 ? 'scale-[1.06]' : '';

  return (
    <ProfileEmptyState
      iconSrc={details.iconSrc}
      iconAlt={`${details.label} unavailable`}
      title={isPendingApproval ? _copy("copy.e16b1a168ac5", { defaultValue: "Approval pending" }) : _copy("copy.a96b0564be6e", { defaultValue: "Join to view {{value1}}", value1: details.label })}
      subtitle={
        isPendingApproval
          ? _copy("copy.7ec672cd3bc9", { defaultValue: "You'll see {{value1}} when an admin approves your request", value1: details.label })
          : _copy("copy.1746d8e72cbb", { defaultValue: "Become a member to see this community's {{value1}}", value1: details.label })
      }
      iconClassName={`origin-center object-center ${scaleClass}`}
    />
  );
}
