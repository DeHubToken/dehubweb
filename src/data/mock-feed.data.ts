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
    author: { id: 'a1', name: 'Alice Cooper', handle: '@alice_cooper', verified: false },
    content: 'Just discovered this amazing new tech stack! The future is looking bright 🚀',
    createdAt: '2h',
    stats: { comments: 23, reposts: 12, likes: 124 },
  },
  {
    id: 'post-2',
    type: 'post',
    author: { id: 'a2', name: 'Fitness Pro', handle: '@fitnesspro', verified: false },
    content: 'Morning workout complete! 💪 Feeling stronger every day. #fitness #motivation',
    createdAt: '3h',
    stats: { comments: 8, reposts: 5, likes: 89 },
  },
  {
    id: 'post-3',
    type: 'post',
    author: { id: 'a3', name: 'Tech Insider', handle: '@techinsider', verified: true },
    content: 'Breaking: New AI developments are reshaping how we think about creativity and automation. Thread 🧵',
    createdAt: '5h',
    stats: { comments: 156, reposts: 234, likes: 1024 },
  },
  {
    id: 'post-4',
    type: 'post',
    author: { id: 'a4', name: 'Gaming Wizard', handle: '@gamingwiz', verified: true },
    content: 'Just hit Diamond rank after 200 hours! The grind was worth it 🎮✨',
    createdAt: '1h',
    stats: { comments: 87, reposts: 34, likes: 567 },
  },
  {
    id: 'post-5',
    type: 'post',
    author: { id: 'a5', name: 'Crypto Analyst', handle: '@cryptoanalyst', verified: true },
    content: 'Market update: Interesting patterns forming in the charts. Stay vigilant 📊💎',
    createdAt: '4h',
    stats: { comments: 234, reposts: 89, likes: 1567 },
  },
  {
    id: 'post-6',
    type: 'post',
    author: { id: 'a6', name: 'Travel Nomad', handle: '@travelnomad', verified: false },
    content: 'Currently watching the sunset in Bali 🌅 Life is too short to stay in one place.',
    createdAt: '6h',
    stats: { comments: 145, reposts: 67, likes: 2341 },
  },
  {
    id: 'post-7',
    type: 'post',
    author: { id: 'a7', name: 'Music Producer', handle: '@beatmaker', verified: true },
    content: 'New track dropping at midnight! 🎵 Been working on this one for months. 🔥',
    createdAt: '30m',
    stats: { comments: 312, reposts: 456, likes: 3421 },
  },
  {
    id: 'post-8',
    type: 'post',
    author: { id: 'a8', name: 'Startup Founder', handle: '@startuplife', verified: false },
    content: 'Just closed our Series A! 🚀 Grateful for the team who believed in us.',
    createdAt: '8h',
    stats: { comments: 89, reposts: 123, likes: 987 },
  },
  {
    id: 'post-9',
    type: 'post',
    author: { id: 'a9', name: 'Coffee Addict', handle: '@coffeelovers', verified: false },
    content: 'Third cup of the day ☕ Does anyone else have a coffee problem or is it just me?',
    createdAt: '15m',
    stats: { comments: 45, reposts: 12, likes: 234 },
  },
  {
    id: 'post-10',
    type: 'post',
    author: { id: 'a10', name: 'Book Worm', handle: '@readingtime', verified: true },
    content: 'Just finished "Atomic Habits" - absolutely life changing! 📚 What should I read next?',
    createdAt: '7h',
    stats: { comments: 189, reposts: 78, likes: 1456 },
  },
  {
    id: 'post-11',
    type: 'post',
    author: { id: 'a11', name: 'Plant Parent', handle: '@plantmom', verified: false },
    content: 'My monstera just unfurled a new leaf! 🌿 The patience finally paid off.',
    createdAt: '4h',
    stats: { comments: 67, reposts: 23, likes: 567 },
  },
  {
    id: 'post-12',
    type: 'post',
    author: { id: 'a12', name: 'Night Owl', handle: '@nightcoder', verified: true },
    content: '3AM coding sessions hit different. Just solved a bug that took me 6 hours 🦉💻',
    createdAt: '9h',
    stats: { comments: 234, reposts: 89, likes: 2341 },
  },
  {
    id: 'post-13',
    type: 'post',
    author: { id: 'a13', name: 'Yoga Master', handle: '@zenlife', verified: false },
    content: 'Remember to breathe deeply today 🧘‍♀️ Your mental health matters more than any deadline.',
    createdAt: '2h',
    stats: { comments: 56, reposts: 145, likes: 890 },
  },
  {
    id: 'post-14',
    type: 'post',
    author: { id: 'a14', name: 'Foodie Explorer', handle: '@tastehunter', verified: true },
    content: 'Found the best ramen spot in the city! 🍜 The broth was absolutely perfect.',
    createdAt: '5h',
    stats: { comments: 123, reposts: 34, likes: 678 },
  },
  {
    id: 'post-15',
    type: 'post',
    author: { id: 'a15', name: 'Dog Dad', handle: '@puppylove', verified: false },
    content: 'My golden retriever just learned a new trick! 🐕 Proud parent moment.',
    createdAt: '1h',
    stats: { comments: 89, reposts: 56, likes: 1234 },
  },
  {
    id: 'post-16',
    type: 'post',
    author: { id: 'a16', name: 'Minimalist', handle: '@lessismore', verified: true },
    content: 'Donated 50% of my wardrobe today. The freedom is incredible! ✨',
    createdAt: '12h',
    stats: { comments: 167, reposts: 234, likes: 2567 },
  },
  {
    id: 'post-17',
    type: 'post',
    author: { id: 'a17', name: 'Art Collector', handle: '@artlover', verified: false },
    content: 'Just acquired a new piece from an emerging artist 🎨 Supporting local talent is everything.',
    createdAt: '8h',
    stats: { comments: 45, reposts: 23, likes: 456 },
  },
  {
    id: 'post-18',
    type: 'post',
    author: { id: 'a18', name: 'Marathon Runner', handle: '@runforlife', verified: true },
    content: 'Completed my 100th marathon today! 🏃‍♂️ Never give up on your goals.',
    createdAt: '3h',
    stats: { comments: 567, reposts: 890, likes: 8901 },
  },
  {
    id: 'post-19',
    type: 'post',
    author: { id: 'a19', name: 'DIY Queen', handle: '@craftymom', verified: false },
    content: 'Built a bookshelf from scratch this weekend! 🔨 Who knew power tools were so fun?',
    createdAt: '1d',
    stats: { comments: 78, reposts: 45, likes: 567 },
  },
  {
    id: 'post-20',
    type: 'post',
    author: { id: 'a20', name: 'Movie Buff', handle: '@cinephile', verified: true },
    content: 'Just watched the new Nolan film. Mind = BLOWN 🎬 No spoilers but WOW.',
    createdAt: '6h',
    stats: { comments: 345, reposts: 123, likes: 3456 },
  },
  {
    id: 'post-21',
    type: 'post',
    author: { id: 'a21', name: 'Chef Life', handle: '@homecooking', verified: false },
    content: 'Finally perfected my grandmother\'s pasta recipe 🍝 She would be proud.',
    createdAt: '4h',
    stats: { comments: 89, reposts: 34, likes: 678 },
  },
  {
    id: 'post-22',
    type: 'post',
    author: { id: 'a22', name: 'Sunset Chaser', handle: '@goldenhour', verified: true },
    content: 'Tonight\'s sunset was absolutely magical 🌅 Nature never disappoints.',
    createdAt: '2h',
    stats: { comments: 234, reposts: 178, likes: 4567 },
  },
  {
    id: 'post-23',
    type: 'post',
    author: { id: 'a23', name: 'Language Learner', handle: '@polyglot', verified: false },
    content: 'Day 365 of learning Japanese 🇯🇵 Finally had my first full conversation!',
    createdAt: '10h',
    stats: { comments: 156, reposts: 89, likes: 2345 },
  },
  {
    id: 'post-24',
    type: 'post',
    author: { id: 'a24', name: 'Space Nerd', handle: '@stargazer', verified: true },
    content: 'Captured Jupiter and its moons through my telescope last night 🔭✨',
    createdAt: '14h',
    stats: { comments: 234, reposts: 345, likes: 5678 },
  },
  {
    id: 'post-25',
    type: 'post',
    author: { id: 'a25', name: 'Guitar Hero', handle: '@sixstrings', verified: false },
    content: 'Finally nailed that solo I\'ve been practicing for months 🎸 Persistence pays off!',
    createdAt: '5h',
    stats: { comments: 67, reposts: 23, likes: 456 },
  },
];

/**
 * Sample videos for the home feed
 */
export const SAMPLE_VIDEOS: VideoItem[] = [
  {
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
  },
  {
    id: 'video-2',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=480&h=270&fit=crop',
    duration: '8:45',
    title: '10 VS Code Tips That Will Blow Your Mind',
    channel: 'Dev Hacks',
    channelAvatar: 'dev',
    verified: true,
    views: '890K views',
    uploadedAgo: '1 week ago',
  },
  {
    id: 'video-3',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=480&h=270&fit=crop',
    duration: '15:22',
    title: 'React 19 - Everything You Need to Know',
    channel: 'Frontend Masters',
    channelAvatar: 'frontend',
    verified: true,
    views: '2.3M views',
    uploadedAgo: '3 days ago',
  },
  {
    id: 'video-4',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=480&h=270&fit=crop',
    duration: '21:08',
    title: 'Machine Learning for Beginners - Full Course',
    channel: 'AI Academy',
    channelAvatar: 'ai',
    verified: true,
    views: '4.5M views',
    uploadedAgo: '1 month ago',
  },
  {
    id: 'video-5',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=480&h=270&fit=crop',
    duration: '6:30',
    title: 'Git Commands Every Developer Should Know',
    channel: 'Code Basics',
    channelAvatar: 'code',
    verified: false,
    views: '567K views',
    uploadedAgo: '5 days ago',
  },
  {
    id: 'video-6',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=480&h=270&fit=crop',
    duration: '18:45',
    title: 'Building a Twitter Clone with Next.js',
    channel: 'Build With Me',
    channelAvatar: 'build',
    verified: true,
    views: '1.8M views',
    uploadedAgo: '2 weeks ago',
  },
  {
    id: 'video-7',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=480&h=270&fit=crop',
    duration: '10:12',
    title: 'CSS Grid vs Flexbox - When to Use What',
    channel: 'CSS Pro',
    channelAvatar: 'css',
    verified: false,
    views: '345K views',
    uploadedAgo: '4 days ago',
  },
  {
    id: 'video-8',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=480&h=270&fit=crop',
    duration: '25:00',
    title: 'Docker Tutorial for Absolute Beginners',
    channel: 'DevOps Daily',
    channelAvatar: 'devops',
    verified: true,
    views: '3.2M views',
    uploadedAgo: '3 weeks ago',
  },
];

export const SAMPLE_VIDEO: VideoItem = SAMPLE_VIDEOS[0];

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
    caption: 'Exploring the mountains 🏔️ Nothing beats this view!',
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
    caption: 'Homemade pizza night 🍕 Recipe in bio!',
    comments: 156,
    timeAgo: '4 hours ago',
  },
  {
    id: 'image-3',
    type: 'image',
    username: 'urban_explorer',
    verified: true,
    avatar: 'urban',
    image: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600&h=600&fit=crop',
    likes: 4521,
    caption: 'City lights never get old ✨',
    comments: 234,
    timeAgo: '1 hour ago',
  },
  {
    id: 'image-4',
    type: 'image',
    username: 'nature_vibes',
    verified: false,
    avatar: 'nature',
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=600&fit=crop',
    likes: 3876,
    caption: 'Found this hidden gem while hiking 🌲',
    comments: 178,
    timeAgo: '3 hours ago',
  },
  {
    id: 'image-5',
    type: 'image',
    username: 'pet_paradise',
    verified: true,
    avatar: 'pets',
    image: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=600&fit=crop',
    likes: 8934,
    caption: 'Meet my new best friend! 🐕',
    comments: 567,
    timeAgo: '5 hours ago',
  },
  {
    id: 'image-6',
    type: 'image',
    username: 'fashion_forward',
    verified: true,
    avatar: 'fashion',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=600&fit=crop',
    likes: 5678,
    caption: 'New collection just dropped 👗',
    comments: 345,
    timeAgo: '6 hours ago',
  },
  {
    id: 'image-7',
    type: 'image',
    username: 'coffee_culture',
    verified: false,
    avatar: 'coffee',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=600&fit=crop',
    likes: 2341,
    caption: 'Morning ritual ☕ Perfect latte art today',
    comments: 123,
    timeAgo: '30 minutes ago',
  },
  {
    id: 'image-8',
    type: 'image',
    username: 'fitness_journey',
    verified: true,
    avatar: 'fitness',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&h=600&fit=crop',
    likes: 6789,
    caption: 'Progress not perfection 💪',
    comments: 456,
    timeAgo: '2 hours ago',
  },
  {
    id: 'image-9',
    type: 'image',
    username: 'sunset_lover',
    verified: false,
    avatar: 'sunset',
    image: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=600&h=600&fit=crop',
    likes: 9876,
    caption: 'Golden hour magic 🌅',
    comments: 678,
    timeAgo: '1 hour ago',
  },
  {
    id: 'image-10',
    type: 'image',
    username: 'architecture_daily',
    verified: true,
    avatar: 'arch',
    image: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?w=600&h=600&fit=crop',
    likes: 4567,
    caption: 'Lines and symmetry 📐',
    comments: 234,
    timeAgo: '4 hours ago',
  },
  {
    id: 'image-11',
    type: 'image',
    username: 'beach_vibes',
    verified: false,
    avatar: 'beach',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=600&fit=crop',
    likes: 7654,
    caption: 'Paradise found 🏝️',
    comments: 345,
    timeAgo: '5 hours ago',
  },
  {
    id: 'image-12',
    type: 'image',
    username: 'car_enthusiast',
    verified: true,
    avatar: 'cars',
    image: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=600&h=600&fit=crop',
    likes: 5432,
    caption: 'Dream machine 🚗',
    comments: 567,
    timeAgo: '3 hours ago',
  },
];

/**
 * Sample shorts for the horizontal reel with stock videos
 */
export const SAMPLE_SHORTS: ShortVideo[] = [
  {
    id: 'short-1',
    type: 'short',
    username: 'dancequeen',
    verified: true,
    likes: '2.5M',
    thumbnail: 'https://images.unsplash.com/photo-1547153760-18fc86324498?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/05/25/40130-424930941_large.mp4',
  },
  {
    id: 'short-2',
    type: 'short',
    username: 'comedyking',
    verified: false,
    likes: '890K',
    thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/06/10/24250-341906218_large.mp4',
  },
  {
    id: 'short-3',
    type: 'short',
    username: 'cookingwithme',
    verified: true,
    likes: '1.2M',
    thumbnail: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2021/08/20/85910-593197655_large.mp4',
  },
  {
    id: 'short-4',
    type: 'short',
    username: 'petlovers',
    verified: false,
    likes: '3.1M',
    thumbnail: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/07/30/46026-447087612_large.mp4',
  },
  {
    id: 'short-5',
    type: 'short',
    username: 'fitnessguru',
    verified: true,
    likes: '567K',
    thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/07/26/25661-350561837_large.mp4',
  },
  {
    id: 'short-6',
    type: 'short',
    username: 'magictricks',
    verified: true,
    likes: '4.2M',
    thumbnail: 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/02/12/32032-391539961_large.mp4',
  },
  {
    id: 'short-7',
    type: 'short',
    username: 'naturewonders',
    verified: true,
    likes: '1.8M',
    thumbnail: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/09/09/27091-360494218_large.mp4',
  },
  {
    id: 'short-8',
    type: 'short',
    username: 'streetart',
    verified: false,
    likes: '743K',
    thumbnail: 'https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/08/12/47450-451618534_large.mp4',
  },
  {
    id: 'short-9',
    type: 'short',
    username: 'carguy',
    verified: true,
    likes: '2.1M',
    thumbnail: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2017/12/31/13779-249633002_large.mp4',
  },
  {
    id: 'short-10',
    type: 'short',
    username: 'sunsetviews',
    verified: false,
    likes: '956K',
    thumbnail: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/04/07/22807-329584635_large.mp4',
  },
  {
    id: 'short-11',
    type: 'short',
    username: 'oceanlife',
    verified: true,
    likes: '3.4M',
    thumbnail: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/07/01/43436-436609810_large.mp4',
  },
  {
    id: 'short-12',
    type: 'short',
    username: 'mountaineer',
    verified: false,
    likes: '1.5M',
    thumbnail: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2018/08/23/17861-285987291_large.mp4',
  },
  {
    id: 'short-13',
    type: 'short',
    username: 'citylights',
    verified: true,
    likes: '2.8M',
    thumbnail: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2017/08/21/11489-230671413_large.mp4',
  },
  {
    id: 'short-14',
    type: 'short',
    username: 'skatelife',
    verified: false,
    likes: '678K',
    thumbnail: 'https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/11/19/29594-374420548_large.mp4',
  },
  {
    id: 'short-15',
    type: 'short',
    username: 'musicvibes',
    verified: true,
    likes: '4.5M',
    thumbnail: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/05/04/38127-415243316_large.mp4',
  },
  {
    id: 'short-16',
    type: 'short',
    username: 'wildanimals',
    verified: true,
    likes: '5.2M',
    thumbnail: 'https://images.unsplash.com/photo-1474511320723-9a56873571b7?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/08/11/26306-354098617_large.mp4',
  },
  {
    id: 'short-17',
    type: 'short',
    username: 'spacefan',
    verified: false,
    likes: '1.9M',
    thumbnail: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/03/10/32888-398022984_large.mp4',
  },
  {
    id: 'short-18',
    type: 'short',
    username: 'dessertlover',
    verified: true,
    likes: '823K',
    thumbnail: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2021/02/22/66229-516171671_large.mp4',
  },
  {
    id: 'short-19',
    type: 'short',
    username: 'gardener',
    verified: false,
    likes: '456K',
    thumbnail: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/05/05/38207-415640161_large.mp4',
  },
  {
    id: 'short-20',
    type: 'short',
    username: 'yogamaster',
    verified: true,
    likes: '2.3M',
    thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/06/09/41365-429988541_large.mp4',
  },
  {
    id: 'short-21',
    type: 'short',
    username: 'rainyday',
    verified: false,
    likes: '1.1M',
    thumbnail: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/11/08/29200-372591934_large.mp4',
  },
  {
    id: 'short-22',
    type: 'short',
    username: 'coffeetime',
    verified: true,
    likes: '934K',
    thumbnail: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/07/07/43841-439126889_large.mp4',
  },
  {
    id: 'short-23',
    type: 'short',
    username: 'beachlife',
    verified: true,
    likes: '3.7M',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/05/31/40723-427201155_large.mp4',
  },
  {
    id: 'short-24',
    type: 'short',
    username: 'snowboarder',
    verified: false,
    likes: '2.6M',
    thumbnail: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/02/25/21719-320484779_large.mp4',
  },
  {
    id: 'short-25',
    type: 'short',
    username: 'techreview',
    verified: true,
    likes: '1.4M',
    thumbnail: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/12/23/30596-382002802_large.mp4',
  },
  {
    id: 'short-26',
    type: 'short',
    username: 'winelovers',
    verified: false,
    likes: '567K',
    thumbnail: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/08/19/47816-453203006_large.mp4',
  },
  {
    id: 'short-27',
    type: 'short',
    username: 'astrology',
    verified: true,
    likes: '1.7M',
    thumbnail: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/04/24/37196-411846561_large.mp4',
  },
  {
    id: 'short-28',
    type: 'short',
    username: 'minimalist',
    verified: false,
    likes: '389K',
    thumbnail: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/06/15/24650-343327199_large.mp4',
  },
  {
    id: 'short-29',
    type: 'short',
    username: 'artisan',
    verified: true,
    likes: '2.9M',
    thumbnail: 'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/06/21/42252-433564193_large.mp4',
  },
  {
    id: 'short-30',
    type: 'short',
    username: 'aurora_hunter',
    verified: true,
    likes: '6.1M',
    thumbnail: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/09/17/27319-361815291_large.mp4',
  },
  {
    id: 'short-31',
    type: 'short',
    username: 'dronepilot',
    verified: false,
    likes: '4.8M',
    thumbnail: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2018/03/27/14989-262251810_large.mp4',
  },
  {
    id: 'short-32',
    type: 'short',
    username: 'waterfall_vibes',
    verified: true,
    likes: '3.3M',
    thumbnail: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/07/13/25079-347932547_large.mp4',
  },
  {
    id: 'short-33',
    type: 'short',
    username: 'butterflies',
    verified: false,
    likes: '1.2M',
    thumbnail: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/07/14/44430-442068195_large.mp4',
  },
  {
    id: 'short-34',
    type: 'short',
    username: 'timelapse',
    verified: true,
    likes: '5.6M',
    thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/01/06/31035-383625063_large.mp4',
  },
  {
    id: 'short-35',
    type: 'short',
    username: 'candlemaker',
    verified: false,
    likes: '678K',
    thumbnail: 'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2020/03/25/33814-401624667_large.mp4',
  },
  {
    id: 'short-36',
    type: 'short',
    username: 'parkour_pro',
    verified: true,
    likes: '4.1M',
    thumbnail: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300&h=500&fit=crop',
    videoUrl: 'https://cdn.pixabay.com/video/2019/10/01/27549-363803997_large.mp4',
  },
];

/**
 * Sample live streams for the home feed preview
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

export const SAMPLE_LIVE_STREAMS: LiveStream[] = [
  {
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
  },
  {
    id: 'live-2',
    type: 'live',
    streamer: 'Pokimane',
    avatar: 'poki',
    title: '🔴 Chill stream with chat! Playing new games',
    game: 'Just Chatting',
    viewers: '32.1K',
    thumbnail: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=480&h=270&fit=crop',
    tags: ['English', 'Variety'],
    isLive: true,
  },
  {
    id: 'live-3',
    type: 'live',
    streamer: 'Shroud',
    avatar: 'shroud',
    title: '🔴 Valorant Ranked - Aiming for Immortal!',
    game: 'Valorant',
    viewers: '28.7K',
    thumbnail: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=480&h=270&fit=crop',
    tags: ['English', 'FPS', 'Competitive'],
    isLive: true,
  },
  {
    id: 'live-4',
    type: 'live',
    streamer: 'DrDisrespect',
    avatar: 'doc',
    title: '🔴 THE TWO-TIME IS BACK! Warzone domination',
    game: 'Call of Duty',
    viewers: '51.3K',
    thumbnail: 'https://images.unsplash.com/photo-1552820728-8b83bb6b2b0b?w=480&h=270&fit=crop',
    tags: ['English', 'Battle Royale'],
    isLive: true,
  },
  {
    id: 'live-5',
    type: 'live',
    streamer: 'xQc',
    avatar: 'xqc',
    title: '🔴 REACT ANDY - Reacting to everything!',
    game: 'Just Chatting',
    viewers: '89.4K',
    thumbnail: 'https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=480&h=270&fit=crop',
    tags: ['English', 'Entertainment'],
    isLive: true,
  },
];

/**
 * Story user data with gender-matched photos
 */
export interface StoryUser {
  name: string;
  avatar: string;
}

export const STORY_USERS: StoryUser[] = [
  { name: 'Alice', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face' },
  { name: 'Bob', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face' },
  { name: 'Charlie', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face' },
  { name: 'Diana', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face' },
  { name: 'Evan', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face' },
  { name: 'Fiona', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face' },
  { name: 'Grace', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face' },
  { name: 'Henry', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&h=150&fit=crop&crop=face' },
  { name: 'Ivy', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face' },
  { name: 'Jack', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face' },
  { name: 'Kate', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face' },
  { name: 'Leo', avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&h=150&fit=crop&crop=face' },
  { name: 'Maya', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&h=150&fit=crop&crop=face' },
  { name: 'Noah', avatar: 'https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=150&h=150&fit=crop&crop=face' },
  { name: 'Olivia', avatar: 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=150&h=150&fit=crop&crop=face' },
  { name: 'Paul', avatar: 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=150&h=150&fit=crop&crop=face' },
];

/**
 * Unified feed item type for mixed content
 */
export type UnifiedFeedItem = 
  | { type: 'post'; data: TextPost }
  | { type: 'video'; data: VideoItem }
  | { type: 'image'; data: ImagePost }
  | { type: 'live'; data: LiveStream }
  | { type: 'shorts'; data: ShortVideo[] };

/**
 * Generate a mixed feed with all content types
 * Creates 50+ items shuffled together
 */
/**
 * Seeded random number generator for consistent shuffling
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = Math.sin(s * 9999) * 10000;
    return s - Math.floor(s);
  };
}

/**
 * Fisher-Yates shuffle with seeded randomness
 */
function shuffleArray<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const random = seededRandom(seed);
  
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  
  return result;
}

export function generateMixedFeed(seed: number = 0): UnifiedFeedItem[] {
  const items: UnifiedFeedItem[] = [];
  
  // Add all posts
  MOCK_POSTS.forEach(post => {
    items.push({ type: 'post', data: post });
  });
  
  // Add all videos
  SAMPLE_VIDEOS.forEach(video => {
    items.push({ type: 'video', data: video });
  });
  
  // Add all images
  SAMPLE_IMAGES.forEach(image => {
    items.push({ type: 'image', data: image });
  });
  
  // Add live streams
  SAMPLE_LIVE_STREAMS.forEach(stream => {
    items.push({ type: 'live', data: stream });
  });
  
  // Properly shuffle using Fisher-Yates algorithm
  const shuffled = shuffleArray(items, seed + 1);
  
  // Insert shorts reels at specific positions (every ~12 items)
  const withShorts: UnifiedFeedItem[] = [];
  const shortsChunks = [
    SAMPLE_SHORTS.slice(0, 10),
    SAMPLE_SHORTS.slice(10, 20),
    SAMPLE_SHORTS.slice(20, 30),
    SAMPLE_SHORTS.slice(30, 36),
  ];
  
  let shortsIndex = 0;
  shuffled.forEach((item, index) => {
    withShorts.push(item);
    // Add shorts reel every 12 items
    if ((index + 1) % 12 === 0 && shortsIndex < shortsChunks.length) {
      withShorts.push({ type: 'shorts', data: shortsChunks[shortsIndex] });
      shortsIndex++;
    }
  });
  
  return withShorts;
}

/**
 * Get paginated feed items
 */
export function getPaginatedFeed(
  page: number, 
  pageSize: number = 15, 
  seed: number = 0
): { items: UnifiedFeedItem[]; hasMore: boolean } {
  const allItems = generateMixedFeed(seed);
  const start = page * pageSize;
  const end = start + pageSize;
  const items = allItems.slice(start, end);
  
  return {
    items,
    hasMore: end < allItems.length,
  };
}
