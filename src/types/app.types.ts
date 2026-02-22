import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  external?: boolean;
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
