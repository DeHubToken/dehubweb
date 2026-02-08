/**
 * Stories Hook
 * ============
 * Manages story uploads, fetching, and real-time updates.
 * Stories expire after 24 hours.
 * Avatars are fetched fresh from user profiles to stay current.
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getAccountInfo } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';

// Template bot avatar imports
import avatarVrgl from '@/assets/avatars/vrgl.png';
import avatarNotmaya from '@/assets/avatars/notmaya.png';
import avatar0xkai from '@/assets/avatars/0xkai.png';
import avatarXluna from '@/assets/avatars/xluna.png';
import avatarMarcoV from '@/assets/avatars/marco_v.png';
import avatarNinarealll from '@/assets/avatars/ninarealll.png';
import avatarJdot from '@/assets/avatars/jdot.png';
import avatarZ4r4eth from '@/assets/avatars/z4r4eth.png';
import avatarRiooo from '@/assets/avatars/riooo.png';
import avatarEllaverse from '@/assets/avatars/ellaverse.png';
import avatarSvmp4 from '@/assets/avatars/svmp4.png';
import avatarMi444 from '@/assets/avatars/mi444.png';
import avatarLeothedev from '@/assets/avatars/leothedev.png';
import avatarIvyivyivy from '@/assets/avatars/ivyivyivy.png';
import avatarOmr from '@/assets/avatars/omr_.png';

export interface Story {
  id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  expires_at: string;
}

/**
 * Extract the first frame from a video blob as a JPEG image
 */
async function extractFirstFrame(videoBlob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.onloadeddata = () => {
      // Seek to first frame
      video.currentTime = 0;
    };

    video.onseeked = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx?.drawImage(video, 0, 0);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(video.src);
          resolve(blob);
        },
        'image/jpeg',
        0.85
      );
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };

    video.src = URL.createObjectURL(videoBlob);
    video.load();
  });
}

/**
 * Fetch fresh avatar for a user from DeHub API
 */
async function fetchFreshAvatar(walletAddress: string): Promise<string | null> {
  try {
    const user = await getAccountInfo(walletAddress);
    const rawAvatar = user.avatarImageUrl || user.avatarUrl || user.avatar_url;
    return buildAvatarUrl(walletAddress, rawAvatar);
  } catch {
    return null;
  }
}

/**
 * Template story video URLs mapped by agent username.
 * These videos are shown as stories for template agents.
 */
const TEMPLATE_VIDEO_URLS: Record<string, string> = {
  'vrgl': 'https://assets.mixkit.co/videos/2213/2213-720.mp4',
  'notmaya': 'https://assets.mixkit.co/videos/4793/4793-720.mp4',
  '0xkai': 'https://assets.mixkit.co/videos/39878/39878-720.mp4',
  'xluna': 'https://assets.mixkit.co/ngl4vwp6mhwm97fv0212vrgi6iw0',
  'marco_v': 'https://assets.mixkit.co/wwnepv77a959cjk6wicpxqosy1mu',
  'ninarealll': 'https://assets.mixkit.co/m9oyxjg4wit94y3k2e998i90n96r',
  'jdot': 'https://assets.mixkit.co/v949y07olycrk26kgawi7zef1f0h',
  'z4r4eth': 'https://assets.mixkit.co/7zctwtusix6zyq97h24z0b863ofv',
  'riooo': 'https://assets.mixkit.co/yqgsdhqnrvzbtbxv0o76xcebwtpi',
  'ellaverse': 'https://assets.mixkit.co/videos/34563/34563-720.mp4',
  'svmp4': 'https://assets.mixkit.co/videos/639/639-720.mp4',
  'mi444': 'https://assets.mixkit.co/videos/5240/5240-720.mp4',
  'leothedev': 'https://assets.mixkit.co/zi1bt4syg2osz0phyfqk6iy7benz',
  'ivyivyivy': 'https://assets.mixkit.co/75p73gjaef0hbuyxfuflnlein92m',
  'omr_': 'https://assets.mixkit.co/videos/45438/45438-720.mp4',
};

/**
 * Default avatar images for template bot accounts.
 */
const TEMPLATE_AVATARS: Record<string, string> = {
  'vrgl': avatarVrgl,
  'notmaya': avatarNotmaya,
  '0xkai': avatar0xkai,
  'xluna': avatarXluna,
  'marco_v': avatarMarcoV,
  'ninarealll': avatarNinarealll,
  'jdot': avatarJdot,
  'z4r4eth': avatarZ4r4eth,
  'riooo': avatarRiooo,
  'ellaverse': avatarEllaverse,
  'svmp4': avatarSvmp4,
  'mi444': avatarMi444,
  'leothedev': avatarLeothedev,
  'ivyivyivy': avatarIvyivyivy,
  'omr_': avatarOmr,
};

/**
 * Build template stories dynamically from the ai_agents table.
 * Falls back to placeholder addresses only if the DB query fails.
 */
async function fetchTemplateStories(): Promise<Story[]> {
  try {
    const { data: agents, error } = await supabase
      .from('ai_agents')
      .select('name, owner_wallet_address')
      .in('name', Object.keys(TEMPLATE_VIDEO_URLS));

    // Build a map of username -> real wallet address from the database
    const walletMap = new Map<string, string>();
    if (!error && agents) {
      for (const agent of agents) {
        walletMap.set(agent.name, agent.owner_wallet_address);
      }
    }

    const usernames = Object.keys(TEMPLATE_VIDEO_URLS);
    const totalStories = usernames.length;
    
    // Spread stories across 22-24 hours ago (within a 2-hour window)
    // Each story gets a fixed offset so they appear staggered
    const now = Date.now();
    const windowStartMs = 24 * 60 * 60 * 1000; // 24 hours ago
    const windowEndMs = 22 * 60 * 60 * 1000;   // 22 hours ago
    const windowSpanMs = windowStartMs - windowEndMs; // 2 hours span

    return usernames.map((username, index) => {
      // Evenly distribute across the 2-hour window (24h ago -> 22h ago)
      const offsetMs = windowStartMs - (windowSpanMs * index) / (totalStories - 1);
      const createdAt = new Date(now - offsetMs);
      const expiresAt = new Date(createdAt.getTime() + 86400000); // +24h from created

      return {
        id: `template-${index + 1}`,
        wallet_address: walletMap.get(username) || `0xTEMPLATE${String(index + 1).padStart(36, '0')}`,
        username,
        avatar: TEMPLATE_AVATARS[username] || null,
        video_url: TEMPLATE_VIDEO_URLS[username],
        thumbnail_url: null,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
    });
  } catch {
    // Fallback: return with placeholder addresses if fetch fails
    const now = Date.now();
    const windowStartMs = 24 * 60 * 60 * 1000;
    const windowEndMs = 22 * 60 * 60 * 1000;
    const windowSpanMs = windowStartMs - windowEndMs;
    const usernames = Object.keys(TEMPLATE_VIDEO_URLS);
    const totalStories = usernames.length;

    return usernames.map((username, index) => {
      const offsetMs = windowStartMs - (windowSpanMs * index) / (totalStories - 1);
      const createdAt = new Date(now - offsetMs);
      const expiresAt = new Date(createdAt.getTime() + 86400000);

      return {
        id: `template-${index + 1}`,
        wallet_address: `0xTEMPLATE${String(index + 1).padStart(36, '0')}`,
        username,
        avatar: TEMPLATE_AVATARS[username] || null,
        video_url: TEMPLATE_VIDEO_URLS[username],
        thumbnail_url: null,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
    });
  }
}

const WATCHED_STORIES_KEY = 'dehub_watched_stories';
const STORIES_CACHE_KEY = 'dehub_stories_cache';

const isTemplateAddress = (address: string) => address.startsWith('0xTEMPLATE');

/** Read stories from localStorage cache */
function getCachedStories(): Story[] | undefined {
  try {
    const raw = localStorage.getItem(STORIES_CACHE_KEY);
    if (!raw) return undefined;
    const { data, timestamp } = JSON.parse(raw);
    // Expire cache after 2 hours (safety net)
    if (Date.now() - timestamp > 2 * 60 * 60 * 1000) return undefined;
    // Filter out already-expired stories
    const now = new Date().toISOString();
    return (data as Story[]).filter(s => s.expires_at > now);
  } catch {
    return undefined;
  }
}

/** Write stories to localStorage cache */
function setCachedStories(stories: Story[]) {
  try {
    localStorage.setItem(STORIES_CACHE_KEY, JSON.stringify({ data: stories, timestamp: Date.now() }));
  } catch { /* quota exceeded */ }
}

/**
 * Hook to track which stories a user has already viewed.
 * Persists to localStorage so it survives page reloads.
 */
export function useWatchedStories() {
  const [watchedIds, setWatchedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(WATCHED_STORIES_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markWatched = useCallback((storyId: string) => {
    setWatchedIds(prev => {
      if (prev.has(storyId)) return prev;
      const next = new Set(prev);
      next.add(storyId);
      try {
        localStorage.setItem(WATCHED_STORIES_KEY, JSON.stringify([...next]));
      } catch { /* quota exceeded — ignore */ }
      return next;
    });
  }, []);

  const isWatched = useCallback((storyId: string) => watchedIds.has(storyId), [watchedIds]);

  return { watchedIds, markWatched, isWatched };
}

export function useStories() {
  const queryClient = useQueryClient();

  // Fetch template stories from ai_agents table (with real wallet addresses)
  const { data: templateStories = [] } = useQuery({
    queryKey: ['template-stories'],
    queryFn: fetchTemplateStories,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  // Fetch active (non-expired) stories - uses localStorage cache for instant load
  const { data: stories = [], isLoading, refetch } = useQuery({
    queryKey: ['stories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const result = data as Story[];
      setCachedStories(result);
      return result;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    placeholderData: getCachedStories,
  });

  // Use template stories as fallback when no real stories exist
  const activeStories = stories.length > 0 ? stories : templateStories;

  // Lazy-load fresh avatars in the background (non-blocking)
  // Now that agents have real wallets, we can fetch their avatars from DeHub
  const { data: enrichedStories = activeStories } = useQuery({
    queryKey: ['stories-with-avatars', activeStories.map(s => s.id).join(',')],
    queryFn: async () => {
      if (activeStories.length === 0) return [];
      
      // Get unique wallet addresses, excluding any remaining placeholder addresses
      const uniqueAddresses = [...new Set(
        activeStories
          .filter(s => !isTemplateAddress(s.wallet_address))
          .map(s => s.wallet_address)
      )];
      
      // If all stories still use placeholder addresses, skip avatar fetching
      if (uniqueAddresses.length === 0) return activeStories;
      
      // Fetch fresh avatars for all unique real users in parallel
      const avatarMap = new Map<string, string | null>();
      await Promise.all(
        uniqueAddresses.map(async (address: string) => {
          const freshAvatar = await fetchFreshAvatar(address);
          avatarMap.set(address.toLowerCase(), freshAvatar);
        })
      );
      
      // Enrich stories with fresh avatars (placeholders keep null avatar)
      return activeStories.map(story => ({
        ...story,
        avatar: isTemplateAddress(story.wallet_address)
          ? story.avatar
          : avatarMap.get(story.wallet_address.toLowerCase()) || story.avatar,
      }));
    },
    enabled: activeStories.length > 0 && activeStories.some(s => !isTemplateAddress(s.wallet_address)),
    staleTime: 1000 * 60 * 5, // 5 minutes - avatars don't change often
  });

  // Group stories by user (most recent story per user shown in bar)
  const storyUsers = enrichedStories.reduce((acc, story) => {
    if (!acc.find((s) => s.wallet_address === story.wallet_address)) {
      acc.push(story);
    }
    return acc;
  }, [] as Story[]);

  return {
    stories: enrichedStories,
    storyUsers,
    isLoading,
    refetch,
  };
}

export function useUploadStory() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();

  const uploadStory = async (
    videoBlob: Blob,
    userInfo: { walletAddress: string; username?: string; avatar?: string }
  ) => {
    setIsUploading(true);
    setProgress(10);

    try {
      const timestamp = Date.now();
      const videoFilename = `${userInfo.walletAddress}/${timestamp}.webm`;
      const thumbFilename = `${userInfo.walletAddress}/${timestamp}-thumb.jpg`;

      // Extract first frame as thumbnail
      setProgress(20);
      const thumbnailBlob = await extractFirstFrame(videoBlob);

      setProgress(40);

      // Upload video
      const { error: videoError } = await supabase.storage
        .from('stories')
        .upload(videoFilename, videoBlob, {
          contentType: 'video/webm',
          upsert: false,
        });

      if (videoError) throw videoError;

      setProgress(60);

      // Upload thumbnail if extracted
      let thumbnailUrl: string | null = null;
      if (thumbnailBlob) {
        const { error: thumbError } = await supabase.storage
          .from('stories')
          .upload(thumbFilename, thumbnailBlob, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (!thumbError) {
          const { data: thumbUrlData } = supabase.storage
            .from('stories')
            .getPublicUrl(thumbFilename);
          thumbnailUrl = thumbUrlData.publicUrl;
        }
      }

      setProgress(80);

      // Get video public URL
      const { data: urlData } = supabase.storage
        .from('stories')
        .getPublicUrl(videoFilename);

      const videoUrl = urlData.publicUrl;

      // Create story record
      const { error: insertError } = await supabase.from('stories').insert({
        wallet_address: userInfo.walletAddress,
        username: userInfo.username || null,
        avatar: userInfo.avatar || null,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
      });

      if (insertError) throw insertError;

      setProgress(100);

      // Invalidate stories cache
      queryClient.invalidateQueries({ queryKey: ['stories'] });

      toast.success('Story posted!');
      return { success: true, videoUrl };
    } catch (error) {
      console.error('Story upload error:', error);
      toast.error('Failed to upload story');
      return { success: false, error };
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  return {
    uploadStory,
    isUploading,
    progress,
  };
}
