import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Home, User, MessageSquare, Bell, Search, Settings, Bookmark,
  Trophy, Wallet, Music, Tv, Sparkles, LayoutDashboard, Vote,
  Coins, ShoppingCart, Bot, Briefcase, ChevronRight
} from 'lucide-react';

// Screen components
import { HomeScreen } from '@/components/mobile-preview/screens/HomeScreen';
import { ProfileScreen } from '@/components/mobile-preview/screens/ProfileScreen';
import { MessagesScreen } from '@/components/mobile-preview/screens/MessagesScreen';
import { ChatScreen } from '@/components/mobile-preview/screens/ChatScreen';
import { NotificationsScreen } from '@/components/mobile-preview/screens/NotificationsScreen';
import { ExploreScreen } from '@/components/mobile-preview/screens/ExploreScreen';
import { SettingsScreen } from '@/components/mobile-preview/screens/SettingsScreen';
import { BookmarksScreen } from '@/components/mobile-preview/screens/BookmarksScreen';
import { WalletScreen } from '@/components/mobile-preview/screens/WalletScreen';
import { LeaderboardScreen } from '@/components/mobile-preview/screens/LeaderboardScreen';
import { MusicScreen } from '@/components/mobile-preview/screens/MusicScreen';
import { AssistantScreen } from '@/components/mobile-preview/screens/AssistantScreen';
import { TVScreen } from '@/components/mobile-preview/screens/TVScreen';
import { StakingScreen } from '@/components/mobile-preview/screens/StakingScreen';
import { GovernanceScreen } from '@/components/mobile-preview/screens/GovernanceScreen';
import { CommandCentreScreen } from '@/components/mobile-preview/screens/CommandCentreScreen';

const SCREENS = [
  { id: 'home', label: 'Home Feed', icon: Home },
  { id: 'explore', label: 'Explore', icon: Search },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'chat', label: 'Chat Detail', icon: MessageSquare },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'tv', label: 'TV', icon: Tv },
  { id: 'command', label: 'Command Centre', icon: LayoutDashboard },
  { id: 'governance', label: 'Governance', icon: Vote },
  { id: 'staking', label: 'Staking', icon: Coins },
] as const;

type ScreenId = typeof SCREENS[number]['id'];

const SCREEN_MAP: Record<ScreenId, React.FC> = {
  home: HomeScreen,
  explore: ExploreScreen,
  profile: ProfileScreen,
  messages: MessagesScreen,
  chat: ChatScreen,
  notifications: NotificationsScreen,
  bookmarks: BookmarksScreen,
  wallet: WalletScreen,
  leaderboard: LeaderboardScreen,
  settings: SettingsScreen,
  assistant: AssistantScreen,
  music: MusicScreen,
  tv: TVScreen,
  command: CommandCentreScreen,
  governance: GovernanceScreen,
  staking: StakingScreen,
};

// iPhone 15 Pro dimensions (393 x 852)
const DEVICE_WIDTH = 393;
const DEVICE_HEIGHT = 852;

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative" style={{ width: DEVICE_WIDTH + 24, height: DEVICE_HEIGHT + 24 }}>
      {/* Outer bezel */}
      <div
        className="absolute inset-0 rounded-[52px] bg-zinc-800 border-2 border-zinc-700 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
      />
      {/* Screen area */}
      <div
        className="absolute inset-3 rounded-[44px] overflow-hidden bg-black"
        style={{ width: DEVICE_WIDTH, height: DEVICE_HEIGHT }}
      >
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[126px] h-[36px] bg-black rounded-full" />
        {/* Home indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-50 w-[134px] h-[5px] bg-white/30 rounded-full" />
        {/* Content */}
        <div className="w-full h-full overflow-y-auto overflow-x-hidden scrollbar-hide">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function MobilePreview() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('home');
  const ActiveComponent = SCREEN_MAP[activeScreen];

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar picker */}
      <aside className="w-64 flex-shrink-0 border-r border-white/10 bg-black/50 backdrop-blur-xl p-4 overflow-y-auto">
        <h1 className="text-white font-bold text-lg mb-1">Mobile Preview</h1>
        <p className="text-zinc-500 text-xs mb-6">UI Blueprint for Mobile Developers</p>

        <nav className="space-y-1">
          {SCREENS.map((screen) => {
            const isActive = activeScreen === screen.id;
            return (
              <button
                key={screen.id}
                onClick={() => setActiveScreen(screen.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-left',
                  isActive
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                )}
              >
                <screen.icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{screen.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 text-zinc-500" />}
              </button>
            );
          })}
        </nav>

        <div className="mt-8 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
          <p className="text-zinc-500 text-[10px] leading-relaxed">
            This preview uses static mock data. No API calls are made.
            All screens follow the DeHub design system tokens.
          </p>
        </div>
      </aside>

      {/* Preview area */}
      <main className="flex-1 flex items-center justify-center p-8 min-h-screen">
        <PhoneFrame>
          <ActiveComponent />
        </PhoneFrame>
      </main>
    </div>
  );
}
