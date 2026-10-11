import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
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
  { id: 'home', get label() { return _translateCopy("copy.8e1154092232", { defaultValue: "Home Feed" }); }, icon: Home },
  { id: 'explore', get label() { return _translateCopy("copy.3b73900b8d29", { defaultValue: "Explore" }); }, icon: Search },
  { id: 'profile', get label() { return _translateCopy("copy.d696a35bdd18", { defaultValue: "Profile" }); }, icon: User },
  { id: 'messages', get label() { return _translateCopy("copy.04d7b4833927", { defaultValue: "Messages" }); }, icon: MessageSquare },
  { id: 'chat', get label() { return _translateCopy("copy.3ef3ea1dd2c9", { defaultValue: "Chat Detail" }); }, icon: MessageSquare },
  { id: 'notifications', get label() { return _translateCopy("copy.788011833a5a", { defaultValue: "Notifications" }); }, icon: Bell },
  { id: 'bookmarks', get label() { return _translateCopy("copy.96316f0f6404", { defaultValue: "Bookmarks" }); }, icon: Bookmark },
  { id: 'wallet', get label() { return _translateCopy("copy.d1c9a01d57e9", { defaultValue: "Wallet" }); }, icon: Wallet },
  { id: 'leaderboard', get label() { return _translateCopy("copy.31b471215872", { defaultValue: "Leaderboard" }); }, icon: Trophy },
  { id: 'settings', get label() { return _translateCopy("copy.74a883a037bc", { defaultValue: "Settings" }); }, icon: Settings },
  { id: 'assistant', get label() { return _translateCopy("copy.0ad1b06f64f2", { defaultValue: "AI Assistant" }); }, icon: Sparkles },
  { id: 'music', get label() { return _translateCopy("copy.6eb00b4b2614", { defaultValue: "Music" }); }, icon: Music },
  { id: 'tv', label: 'TV', icon: Tv },
  { id: 'command', get label() { return _translateCopy("copy.a929b8776094", { defaultValue: "Command Centre" }); }, icon: LayoutDashboard },
  { id: 'governance', get label() { return _translateCopy("copy.86f8a694159b", { defaultValue: "Governance" }); }, icon: Vote },
  { id: 'staking', get label() { return _translateCopy("copy.5190ff487713", { defaultValue: "Staking" }); }, icon: Coins },
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
  const { t: _copy } = _useCopy();
  const [activeScreen, setActiveScreen] = useState<ScreenId>('home');
  const ActiveComponent = SCREEN_MAP[activeScreen];

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      <SEOHead title={_copy("copy.ffe5b9da27f5", { defaultValue: "Mobile Preview — DeHub" })} description={_copy("copy.0cf13d60db5f", { defaultValue: "Internal preview of DeHub mobile screens." })} noindex />
      {/* Sidebar picker */}
      <aside className="w-64 flex-shrink-0 border-r border-white/10 bg-black/50 backdrop-blur-xl p-4 overflow-y-auto">
        <h1 className="text-white font-bold text-lg mb-1">{_copy("copy.4bc65a38f7bb", { defaultValue: "Mobile Preview" })}</h1>
        <p className="text-zinc-500 text-xs mb-6">{_copy("copy.f814efff2531", { defaultValue: "UI Blueprint for Mobile Developers" })}</p>

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
          <p className="text-zinc-500 text-[10px] leading-relaxed">{_copy("copy.ae51cc708cec", { defaultValue: "This preview uses static mock data. No API calls are made. All screens follow the DeHub design system tokens." })}</p>
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
