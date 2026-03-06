import { useState, useRef, useCallback, memo, useMemo } from 'react';
import { SquareUserRound, Trophy, MessagesSquare } from 'lucide-react';
import { WhoToFollow } from '../WhoToFollow';
import { SidebarLeaderboard, type SidebarLeaderboardHandle } from './SidebarLeaderboard';
import { SidebarChat } from './SidebarChat';
import { useAuth } from '@/contexts/AuthContext';

import { useLiveChatPresence, useLiveChatRooms } from '@/hooks/use-livechat';

type TabType = 'leaderboard' | 'follow' | 'chat';

// Persist tab state across remounts so layout changes don't reset it
let persistedTab: TabType = 'leaderboard';

export const TabbedSidePanel = memo(function TabbedSidePanel() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(persistedTab);
  const leaderboardRef = useRef<SidebarLeaderboardHandle>(null);
  const { rooms } = useLiveChatRooms();
  const roomId = rooms[0]?.id || null;
  const { onlineCount } = useLiveChatPresence(roomId);

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
  }, []);

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Tab Icons */}
      <div className="flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`relative flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
                effectiveTab === tab.id
                  ? 'text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              }`}
            >
              {effectiveTab === tab.id && (
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-800/60 to-transparent" />
              )}
              <Icon className="w-5 h-5 relative z-10" />
              
            </button>
          );
        })}
      </div>

      {/* Tab Content — show/hide for maximum browser compatibility */}
      <div className="h-[400px]">
        {/* Leaderboard panel */}
        <div className={`h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'leaderboard' ? '' : 'hidden'}`}>
          <SidebarLeaderboard ref={leaderboardRef} />
        </div>
        {/* Follow panel - only rendered when authenticated */}
        {isAuthenticated && (
          <div className={`h-full flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'follow' ? '' : 'hidden'}`}>
            <WhoToFollow />
          </div>
        )}
        {/* Chat panel */}
        <div className={`h-full overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent ${effectiveTab === 'chat' ? '' : 'hidden'}`}>
          <SidebarChat />
        </div>
      </div>
    </div>
  );
});
