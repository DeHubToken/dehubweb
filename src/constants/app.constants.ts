import {
  Home,
  Search,
  Bell,
  Mail,
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
} from 'lucide-react';
import type { NavItem, User as UserType, TrendingTopic, SearchTab } from '@/types/app.types';

export const NAV_ITEMS: NavItem[] = [
  { icon: User, label: 'Profile', path: '/app/profile' },
  { icon: Search, label: 'Explore', path: '/app/explore' },
  { icon: Bell, label: 'Notifications', path: '/app/notifications' },
  { icon: Mail, label: 'Messages', path: '/app/messages' },
  { icon: Trophy, label: 'Leaderboard', path: '/app/leaderboard' },
  { icon: Bookmark, label: 'Bookmarks', path: '/app/bookmarks' },
  { icon: Settings, label: 'Settings', path: '/app/settings' },
  { icon: FileText, label: 'Blog', path: '/app/blog' },
  { icon: Home, label: 'Home', path: '/app' },
];

export const FEED_TABS: SearchTab[] = [
  { icon: Home, label: 'Home', value: 'home' },
  { icon: Image, label: 'Images', value: 'images' },
  { icon: Video, label: 'Videos', value: 'videos' },
  { icon: Film, label: 'Shorts', value: 'shorts' },
  { icon: Radio, label: 'Cams', value: 'cams' },
];

export const EXPLORE_TABS: SearchTab[] = [
  { icon: Search, label: 'All', value: 'all' },
  { icon: Users, label: 'People', value: 'people' },
  { icon: FileTextIcon, label: 'Posts', value: 'posts' },
  { icon: Image, label: 'Images', value: 'images' },
  { icon: Video, label: 'Videos', value: 'videos' },
  { icon: Radio, label: 'Live', value: 'live' },
];

export const SUGGESTED_USERS: UserType[] = [
  { id: '1', name: 'React Team', handle: '@reactjs', verified: true },
  { id: '2', name: 'TypeScript', handle: '@typescript', verified: true },
  { id: '3', name: 'Tailwind CSS', handle: '@tailwindcss', verified: true },
  { id: '4', name: 'Vite.js', handle: '@vitejs', verified: true },
  { id: '5', name: 'Web3 Builder', handle: '@web3builder', verified: false },
];

export const TRENDING_TOPICS: TrendingTopic[] = [
  { tag: '#WebDevelopment', postCount: '125K posts' },
  { tag: '#React', postCount: '89K posts' },
  { tag: '#AI', postCount: '234K posts' },
  { tag: '#Crypto', postCount: '67K posts' },
];

export const RECENT_SEARCHES = ['fitness', 'cooking', 'music', 'art'];

export const EXPLORE_TRENDING: Array<{ tag: string; postCount: string }> = [
  { tag: '#fitness', postCount: '1035 posts' },
  { tag: '#cooking', postCount: '449 posts' },
  { tag: '#music', postCount: '745 posts' },
  { tag: '#art', postCount: '527 posts' },
];
