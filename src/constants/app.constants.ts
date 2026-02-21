import {
  Home,
  Search,
  Bell,
  MessageSquare,
  Trophy,
  Bookmark,
  Settings,
  FileText,
  User,
  Image,
  Video,
  Film,
  Radio,
  Users,
  FileTextIcon,
  Coins,
  Play,
  LayoutDashboard,
  Sparkles,
  
  BookOpen,
  Lightbulb,
  Briefcase,
} from 'lucide-react';
import type { NavItem, User as UserType, TrendingTopic, SearchTab } from '@/types/app.types';

export const NAV_ITEMS: NavItem[] = [
  { icon: User, label: 'Profile', path: '/app/profile' },
  { icon: Search, label: 'Explore', path: '/app/explore' },
  { icon: Bell, label: 'Notifications', path: '/app/notifications' },
  { icon: MessageSquare, label: 'Messages', path: '/app/messages' },
  { icon: Sparkles, label: 'Assistant', path: '/app/assistant' },
  { icon: Trophy, label: 'Leaderboard', path: '/app/leaderboard' },
  { icon: Bookmark, label: 'Bookmarks', path: '/app/bookmarks' },
  { icon: Settings, label: 'Settings', path: '/app/settings' },
  { icon: LayoutDashboard, label: 'Command Centre', path: '/app/command-centre' },
  { icon: BookOpen, label: 'Docs', path: 'https://docs.dhb.gg', external: true },
  { icon: FileText, label: 'Blog', path: 'https://docs.dhb.gg/docs/blog', external: true },
  { icon: Lightbulb, label: 'Feature Requests', path: '/features' },
  { icon: Briefcase, label: 'Careers', path: '/jobs' },
  { icon: Home, label: 'Home', path: '/app' },
];

export const FEED_TABS: SearchTab[] = [
  { icon: Home, label: 'Home', value: 'home' },
  { icon: Video, label: 'Videos', value: 'videos' },
  { icon: Image, label: 'Images', value: 'images' },
  { icon: Film, label: 'Shorts', value: 'shorts' },
  { icon: Play, label: 'Music', value: 'music' },
  { icon: Radio, label: 'Live', value: 'live' },
];

export const EXPLORE_TABS: SearchTab[] = [
  { icon: Search, label: 'All', value: 'all' },
  { icon: Users, label: 'People', value: 'people' },
  { icon: FileTextIcon, label: 'Posts', value: 'posts' },
  { icon: Image, label: 'Images', value: 'images' },
  { icon: Video, label: 'Videos', value: 'videos' },
  { icon: Play, label: 'Music', value: 'music' },
  { icon: Radio, label: 'Live', value: 'live' },
];

export const SUGGESTED_USERS: UserType[] = [
  { id: '1', name: 'React Team', handle: '@reactjs', verified: false },
  { id: '2', name: 'TypeScript', handle: '@typescript', verified: false },
  { id: '3', name: 'Tailwind CSS', handle: '@tailwindcss', verified: false },
  { id: '4', name: 'Vite.js', handle: '@vitejs', verified: false },
  { id: '5', name: 'Web3 Builder', handle: '@web3builder', verified: false },
];

export const EXTENDED_SUGGESTED_USERS: UserType[] = [
  { id: '6', name: 'Next.js', handle: '@nextjs', verified: false },
  { id: '7', name: 'Ethereum', handle: '@ethereum', verified: false },
  { id: '8', name: 'Solana', handle: '@solana', verified: false },
  { id: '9', name: 'Figma', handle: '@figma', verified: false },
  { id: '10', name: 'GitHub', handle: '@github', verified: false },
  { id: '11', name: 'OpenAI', handle: '@openai', verified: false },
  { id: '12', name: 'Vercel', handle: '@vercel', verified: false },
  { id: '13', name: 'Cloudflare', handle: '@cloudflare', verified: false },
  { id: '14', name: 'Prisma', handle: '@prisma', verified: false },
  { id: '15', name: 'Supabase', handle: '@supabase', verified: false },
];

// Generate 100 more suggested users
export const GENERATED_SUGGESTED_USERS: UserType[] = Array.from({ length: 100 }, (_, i) => {
  const names = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery', 'Blake'];
  const techs = ['Web3', 'DeFi', 'NFT', 'AI', 'ML', 'Rust', 'Go', 'Swift', 'Kotlin', 'Python'];
  const name = `${names[i % names.length]} ${techs[Math.floor(i / 10) % techs.length]}`;
  return {
    id: `${16 + i}`,
    name,
    handle: `@${name.toLowerCase().replace(' ', '_')}`,
    verified: false,
  };
});

export const TRENDING_TOPICS: TrendingTopic[] = [
  { tag: '#WebDevelopment', postCount: '125K posts' },
  { tag: '#React', postCount: '89K posts' },
  { tag: '#AI', postCount: '234K posts' },
  { tag: '#Crypto', postCount: '67K posts' },
];

export const EXTENDED_TRENDING_TOPICS: TrendingTopic[] = [
  { tag: '#Gaming', postCount: '312K posts' },
  { tag: '#NFT', postCount: '156K posts' },
  { tag: '#DeFi', postCount: '98K posts' },
  { tag: '#Solana', postCount: '145K posts' },
  { tag: '#Ethereum', postCount: '278K posts' },
  { tag: '#Web3', postCount: '189K posts' },
  { tag: '#Metaverse', postCount: '76K posts' },
  { tag: '#TypeScript', postCount: '112K posts' },
  { tag: '#JavaScript', postCount: '203K posts' },
  { tag: '#Design', postCount: '167K posts' },
  { tag: '#Startup', postCount: '134K posts' },
  { tag: '#Tech', postCount: '289K posts' },
];

// Generate 100 more trending topics
export const GENERATED_TRENDING_TOPICS: TrendingTopic[] = Array.from({ length: 100 }, (_, i) => {
  const topics = ['Blockchain', 'Cybersecurity', 'Cloud', 'DevOps', 'Frontend', 'Backend', 'Mobile', 'Data', 'IoT', 'AR'];
  const subtopics = ['Tips', 'News', 'Trends', 'Updates', 'Guide', 'Tutorial', 'Deep', 'Pro', 'Live', 'Hot'];
  return {
    tag: `#${topics[i % topics.length]}${subtopics[Math.floor(i / 10) % subtopics.length]}`,
    postCount: `${Math.floor(Math.random() * 500) + 10}K posts`,
  };
});

export const RECENT_SEARCHES = ['fitness', 'cooking', 'music', 'art'];

export const EXPLORE_TRENDING: Array<{ tag: string; postCount: string }> = [
  { tag: '#fitness', postCount: '1035 posts' },
  { tag: '#cooking', postCount: '449 posts' },
  { tag: '#music', postCount: '745 posts' },
  { tag: '#art', postCount: '527 posts' },
];

// ============================================
// GLASS MORPHISM STYLES - UNIVERSAL RULE
// ============================================
// ALL popovers, dropdowns, sheets, drawers, menus, and overlays
// MUST use these styles for consistency. NO EXCEPTIONS.
// ============================================

export const GLASS_STYLES = {
  // For Popovers, Dropdowns, Menus - floating elements
  popover: "bg-black/40 backdrop-blur-2xl border border-white/10",
  
  // For Drawers, Sheets - bottom/side panels
  drawer: "bg-black/40 backdrop-blur-2xl border-t border-white/10",
  sheet: "bg-black/40 backdrop-blur-2xl border-l border-white/10",
  
  // For Dialogs, Modals - centered overlays  
  dialog: "bg-black/40 backdrop-blur-2xl border border-white/10",
  
  // For Cards with glass effect
  card: "bg-white/5 backdrop-blur-xl border border-white/10",
} as const;
