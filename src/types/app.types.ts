import type { LucideIcon } from 'lucide-react';
import type { ThemeIconKey } from '@/components/app/war/WarHudIcon';

export interface NavItem {
  icon: LucideIcon;
  themedIcon?: ThemeIconKey;
  label: string;
  path: string;
  external?: boolean;
  action?: string;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  verified: boolean;
  avatarSeed?: string;
  badgeBalance?: number;
}

export interface Post {
  id: string;
  author: User;
  content: string;
  createdAt: string;
  stats: {
    comments: number;
    reposts: number;
    likes: number;
  };
}

export interface TrendingTopic {
  tag: string;
  postCount: string;
}

export interface SearchTab {
  icon: LucideIcon;
  label: string;
  value: string;
}
