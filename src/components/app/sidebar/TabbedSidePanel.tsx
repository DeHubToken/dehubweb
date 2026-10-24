import { useTranslation as _useCopy } from 'react-i18next';
import { useState, useRef, useCallback, memo, useMemo } from 'react';
import SquareUserRound from "@/components/ui/cut-icons/growing";
import MessagesSquare from "@/components/ui/cut-icons/message-envelope";
import Star from "@/components/ui/cut-icons/new-members";
import Trophy from "@/components/ui/cut-icons/leaderboard";

import { WhoToFollow } from '../WhoToFollow';
import { SidebarLeaderboard, type SidebarLeaderboardHandle } from './SidebarLeaderboard';
import { SidebarChat } from './SidebarChat';
import { SidebarNewMembers } from './SidebarNewMembers';
import { useAuth } from '@/contexts/AuthContext';
import { usePublicChatUnreadCount } from '@/hooks/use-public-chat-unread';

type TabType = 'leaderboard' | 'follow' | 'newMembers' | 'chat';

// Persist tab state across remounts so layout changes don't reset it
let persistedTab: TabType = 'chat';

export const TabbedSidePanel = memo(function TabbedSidePanel() {
  const { t: _copy } = _useCopy();
  const { isAuthenticated } = useAuth();
  const publicUnread = usePublicChatUnreadCount();
  const [activeTab, setActiveTab] = useState<TabType>(persistedTab);
  const leaderboardRef = useRef<SidebarLeaderboardHandle>(null);
  // Chat opens on the first desktop visit. After switching panels, keep it
  // mounted for this session so its messages and scroll position survive.
  const [chatOpened, setChatOpened] = useState(persistedTab === 'chat');
  // Same reasoning as chat: the other panels are CSS-hidden rather than
  // unmounted, so anything mounted here queries at boot whether or not it is on
  // screen. The new-members roster is not worth a request the feed is waiting
  // behind.
  const [newMembersOpened, setNewMembersOpened] = useState(persistedTab === 'newMembers');
  const [leaderboardOpened, setLeaderboardOpened] = useState(persistedTab === 'leaderboard');
  const [followOpened, setFollowOpened] = useState(persistedTab === 'follow');

  const tabs = useMemo(() => {
    const base: { id: TabType; icon: typeof SquareUserRound; label: string }[] = [
      { id: 'leaderboard', icon: Trophy, label: _copy("copy.d05e07b7c14e", { defaultValue: "Balance" }) },
    ];
    if (isAuthenticated) {
      base.push({ id: 'follow', icon: SquareUserRound, label: _copy("copy.52c8c11f7fa2", { defaultValue: "Growing" }) });
    }
    base.push({ id: 'newMembers', icon: Star, label: _copy("copy.18fdd549b2ed", { defaultValue: "New" }) });
    base.push({ id: 'chat', icon: MessagesSquare, label: _copy("copy.460b3a7da007", { defaultValue: "Chat" }) });
    return base;
  }, [isAuthenticated, _copy]);

  // If current tab is 'follow' but user logged out, reset to leaderboard
  const effectiveTab = activeTab === 'follow' && !isAuthenticated ? 'leaderboard' : activeTab;

  const handleTabClick = useCallback((id: TabType) => {
    persistedTab = id;
    setActiveTab(() => id);
    if (id === 'chat') setChatOpened(true);
    if (id === 'newMembers') setNewMembersOpened(true);
    if (id === 'leaderboard') setLeaderboardOpened(true);
    if (id === 'follow') setFollowOpened(true);
  }, []);

  return (
    <div data-side-panel className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Tab Icons */}
      <div data-side-panel-tabs className="flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
          <button
            type="button"
            data-tab-btn
            data-tab-active={effectiveTab === tab.id}
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            aria-label={tab.label}
            // Hover label: NativeTitleTooltips draws it as the glass tooltip,
            // in a body-level layer the panel's overflow-hidden never clips.
            title={tab.label}
              className={`group relative flex-1 py-2.5 flex flex-col items-center justify-center transition-colors ${
                effectiveTab === tab.id
                  ? 'text-white'
                  : 'text-zinc-500 hover:text-zinc-300 [&:hover>.tab-hover-bg]:opacity-100'
              }`}
            >
              {effectiveTab === tab.id ? (
                <div data-active-tab-indicator className="absolute inset-0 bg-gradient-to-b from-zinc-800/60 to-transparent" />
              ) : (
                <div className="tab-hover-bg absolute inset-0 bg-gradient-to-b from-zinc-800/40 to-transparent opacity-0 transition-opacity" />
              )}
              <Icon className="w-4 h-4 relative z-10" />
              {tab.id === 'chat' && publicUnread > 0 && (
                <span data-unread-chip data-public-chat-unread className="absolute top-1 right-2 z-20 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {publicUnread > 99 ? '99+' : publicUnread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content — show/hide for maximum browser compatibility */}
      <div data-side-panel-content className="h-[400px]">
        {/* Leaderboard panel */}
        <div className={`h-full overflow-y-auto overscroll-contain overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'leaderboard' ? '' : 'hidden'}`}>
          {(leaderboardOpened || effectiveTab === 'leaderboard') && <SidebarLeaderboard ref={leaderboardRef} />}
        </div>
        {/* Follow panel - only rendered when authenticated */}
        {isAuthenticated && (
          <div className={`h-full flex flex-col overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'follow' ? '' : 'hidden'}`}>
            {followOpened && <WhoToFollow />}
          </div>
        )}
        {/* New members panel — mounted lazily on first open, like chat. */}
        <div className={`h-full flex flex-col overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'newMembers' ? '' : 'hidden'}`}>
          {newMembersOpened && <SidebarNewMembers />}
        </div>
        {/* Chat panel — pt-3 matches the buffer above WhatsHappening's period tabs.
            Mounted lazily on first open; stays mounted after so switching away keeps state. */}
        <div className={`h-full pt-3 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'chat' ? '' : 'hidden'}`}>
          {chatOpened && <SidebarChat isActive={effectiveTab === 'chat'} />}
        </div>
      </div>
    </div>
  );
});
