/**
 * Mock Feed Data
 * ===============
 * Centralized mock data for all feed types.
 * Used for development and demonstration purposes.
 * 
 * @module data/mock-feed
 */

import type { TextPost, VideoItem, ImagePost, LiveStream, ShortVideo } from '@/types/feed.types';

/**
 * Sample text posts for the home feed
 */
export const MOCK_POSTS: TextPost[] = [
  {
    id: 'post-1',
    type: 'post',
    author: {
      id: 'a1',
      name: 'Alice Cooper',
      handle: '@alice_cooper',
      verified: false,
    },
    content: 'Just discovered this amazing new tech stack! The future is looking bright 🚀',
    createdAt: '2h',
    stats: { comments: 23, reposts: 12, likes: 124 },
  },
  {
    id: 'post-2',
    type: 'post',
    author: {
      id: 'a2',
      name: 'Fitness Pro',
      handle: '@fitnesspro',
      verified: false,
    },
    content: 'Morning workout complete! 💪 Feeling stronger every day. #fitness #motivation',
    createdAt: '3h',
    stats: { comments: 8, reposts: 5, likes: 89 },
  },
  {
    id: 'post-3',
    type: 'post',
    author: {
      id: 'a3',
      name: 'Tech Insider',
      handle: '@techinsider',
      verified: true,
    },
    content: 'Breaking: New AI developments are reshaping how we think about creativity and automation. Thread 🧵',
    createdAt: '5h',
    stats: { comments: 156, reposts: 234, likes: 1024 },
  },
];

/**
 * Sample video for the home feed preview
 */
export const SAMPLE_VIDEO: VideoItem = {
  id: 'video-1',
  type: 'video',
  thumbnail: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=480&h=270&fit=crop',
  duration: '12:34',
  title: 'Building a Full Stack App in 2024 - Complete Guide',
  channel: 'Tech Tutorials',
  channelAvatar: 'tech',
  verified: true,
  views: '1.2M views',
  uploadedAgo: '2 weeks ago',
};

/**
 * Sample images for the home feed preview
 */
export const SAMPLE_IMAGES: ImagePost[] = [
  {
    id: 'image-1',
    type: 'image',
    username: 'travel_adventures',
    verified: true,
    avatar: 'travel',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&fit=crop',
    likes: 2453,
    caption: 'Exploring the mountains 🏔️ Nothing beats this view! #travel #adventure',
    comments: 89,
    timeAgo: '2 hours ago',
  },
  {
    id: 'image-2',
    type: 'image',
    username: 'foodie_life',
    verified: false,
    avatar: 'food',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop',
    likes: 1832,
    caption: 'Homemade pizza night 🍕 Recipe in bio! #foodie #homemade',
    comments: 156,
    timeAgo: '4 hours ago',
  },
];

/**
 * Sample shorts for the horizontal reel
 */
export const SAMPLE_SHORTS: ShortVideo[] = [
  {
    id: 'short-1',
    type: 'short',
    username: 'dancequeen',
    verified: true,
    likes: '2.5M',
    thumbnail: 'https://images.unsplash.com/photo-1547153760-18fc86324498?w=300&h=500&fit=crop',
  },
  {
    id: 'short-2',
    type: 'short',
    username: 'comedyking',
    verified: false,
    likes: '890K',
    thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=500&fit=crop',
  },
  {
    id: 'short-3',
    type: 'short',
    username: 'cookingwithme',
    verified: true,
    likes: '1.2M',
    thumbnail: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300&h=500&fit=crop',
  },
  {
    id: 'short-4',
    type: 'short',
    username: 'petlovers',
    verified: false,
    likes: '3.1M',
    thumbnail: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=300&h=500&fit=crop',
  },
  {
    id: 'short-5',
    type: 'short',
    username: 'fitnessguru',
    verified: true,
    likes: '567K',
    thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300&h=500&fit=crop',
  },
  {
    id: 'short-6',
    type: 'short',
    username: 'magictricks',
    verified: true,
    likes: '4.2M',
    thumbnail: 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=300&h=500&fit=crop',
  },
];

/**
 * Sample live stream for the home feed preview
 */
export const SAMPLE_LIVE: LiveStream = {
  id: 'live-1',
  type: 'live',
  streamer: 'Ninja',
  avatar: 'ninja',
  title: '🔴 LIVE - Grinding Ranked! Road to Champion',
  game: 'Fortnite',
  viewers: '45.2K',
  thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=480&h=270&fit=crop',
  tags: ['English', 'Competitive'],
  isLive: true,
};

/**
 * Stories data for the stories bar
 */
export const STORY_USERS = [
  'alice', 'bob', 'charlie', 'diana', 'evan', 'fiona',
  'grace', 'henry', 'ivy', 'jack', 'kate', 'leo',
  'maya', 'noah', 'olivia', 'paul'
];
