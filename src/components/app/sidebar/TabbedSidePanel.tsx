import { useState, useRef, useCallback, memo, useMemo } from 'react';
import { SquareUserRound, Trophy, MessagesSquare } from 'lucide-react';
import { WhoToFollow } from '../WhoToFollow';
import { SidebarLeaderboard, type SidebarLeaderboardHandle } from './SidebarLeaderboard';
import { SidebarChat } from './SidebarChat';
import { useAuth } from '@/contexts/AuthContext';

type TabType = 'leaderboard' | 'follow' | 'chat';

// Persist tab state across remounts so layout changes don't reset it
let persistedTab: TabType = 'leaderboard';

export const TabbedSidePanel = memo(function TabbedSidePanel() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(persistedTab);
  const leaderboardRef = useRef<SidebarLeaderboardHandle>(null);
  // Mount the chat panel only after its tab is first opened: SidebarChat opens a
  // socket.io connection + fetches rooms/messages on mount, which used to fire at
  // boot for a CSS-hidden panel and starve the feed request (LCP audit 7/14).
  // (A duplicate useLiveChatRooms/Presence pair lived here too, feeding an unused
  // onlineCount — removed for the same reason.)
  const [chatOpened, setChatOpened] = useState(persistedTab === 'chat');

  const tabs = useMemo(() => {
    const base: { id: TabType; icon: typeof SquareUserRound }[] = [
      { id: 'leaderboard', icon: Trophy },
    ];
    if (isAuthenticated) {
      base.push({ id: 'follow', icon: SquareUserRound });
    }
    base.push({ id: 'chat', icon: MessagesSquare });
    return base;
  }, [isAuthenticated]);

  // If current tab is 'follow' but user logged out, reset to leaderboard
  const effectiveTab = activeTab === 'follow' && !isAuthenticated ? 'leaderboard' : activeTab;

  const handleTabClick = useCallback((id: TabType) => {
    persistedTab = id;
    setActiveTab(() => id);
    if (id === 'chat') setChatOpened(true);
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
              className={`relative flex-1 py-2.5 flex flex-col items-center justify-center transition-colors ${
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
              
            </button>
          );
        })}
      </div>

      {/* Tab Content — show/hide for maximum browser compatibility */}
      <div className="h-[400px]">
        {/* Leaderboard panel */}
        <div className={`h-full overflow-y-auto overscroll-contain overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'leaderboard' ? '' : 'hidden'}`}>
          <SidebarLeaderboard ref={leaderboardRef} />
        </div>
        {/* Follow panel - only rendered when authenticated */}
        {isAuthenticated && (
          <div className={`h-full flex flex-col overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'follow' ? '' : 'hidden'}`}>
            <WhoToFollow />
          </div>
        )}
        {/* Chat panel — pt-3 matches the buffer above WhatsHappening's period tabs.
            Mounted lazily on first open; stays mounted after so switching away keeps state. */}
        <div className={`h-full pt-3 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'chat' ? '' : 'hidden'}`}>
          {chatOpened && <SidebarChat />}
        </div>
      </div>
    </div>
  );
});
