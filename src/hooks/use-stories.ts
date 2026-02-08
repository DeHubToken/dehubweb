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
 * Template stories shown when no real stories exist.
 * Uses publicly available stock videos from Pexels CDN.
 * Remove this array once there's a steady flow of real stories.
 */
const TEMPLATE_STORIES: Story[] = [
  {
    id: 'template-1',
    wallet_address: '0xTEMPLATE000000000000000000000000000001',
    username: 'vrgl',
    avatar: null,
    video_url: 'https://assets.mixkit.co/videos/39875/39875-720.mp4',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-2',
    wallet_address: '0xTEMPLATE000000000000000000000000000002',
    username: 'notmaya',
    avatar: null,
    video_url: 'https://assets.mixkit.co/videos/39874/39874-720.mp4',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-3',
    wallet_address: '0xTEMPLATE000000000000000000000000000003',
    username: '0xkai',
    avatar: null,
    video_url: 'https://assets.mixkit.co/videos/39878/39878-720.mp4',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-4',
    wallet_address: '0xTEMPLATE000000000000000000000000000004',
    username: 'ξluna',
    avatar: null,
    video_url: 'https://assets.mixkit.co/ngl4vwp6mhwm97fv0212vrgi6iw0',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-5',
    wallet_address: '0xTEMPLATE000000000000000000000000000005',
    username: 'marcø',
    avatar: null,
    video_url: 'https://assets.mixkit.co/wwnepv77a959cjk6wicpxqosy1mu',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-6',
    wallet_address: '0xTEMPLATE000000000000000000000000000006',
    username: 'ninarealll',
    avatar: null,
    video_url: 'https://assets.mixkit.co/m9oyxjg4wit94y3k2e998i90n96r',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-7',
    wallet_address: '0xTEMPLATE000000000000000000000000000007',
    username: 'j',
    avatar: null,
    video_url: 'https://assets.mixkit.co/v949y07olycrk26kgawi7zef1f0h',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-8',
    wallet_address: '0xTEMPLATE000000000000000000000000000008',
    username: 'z4r4eth',
    avatar: null,
    video_url: 'https://assets.mixkit.co/7zctwtusix6zyq97h24z0b863ofv',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-9',
    wallet_address: '0xTEMPLATE000000000000000000000000000009',
    username: 'riooo',
    avatar: null,
    video_url: 'https://assets.mixkit.co/yqgsdhqnrvzbtbxv0o76xcebwtpi',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-10',
    wallet_address: '0xTEMPLATE000000000000000000000000000010',
    username: 'ella',
    avatar: null,
    video_url: 'https://assets.mixkit.co/1n3mnf16ls4nz4b26j03mmmou9hs',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-11',
    wallet_address: '0xTEMPLATE000000000000000000000000000011',
    username: 'svmp4',
    avatar: null,
    video_url: 'https://assets.mixkit.co/xljy8btgxl02zhespwj0cz6jdn7k',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-12',
    wallet_address: '0xTEMPLATE000000000000000000000000000012',
    username: 'mi444',
    avatar: null,
    video_url: 'https://assets.mixkit.co/xnhfrp4eu75lfd518c7fgvrb60y5',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-13',
    wallet_address: '0xTEMPLATE000000000000000000000000000013',
    username: 'leothedev',
    avatar: null,
    video_url: 'https://assets.mixkit.co/zi1bt4syg2osz0phyfqk6iy7benz',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-14',
    wallet_address: '0xTEMPLATE000000000000000000000000000014',
    username: 'ivyivyivy',
    avatar: null,
    video_url: 'https://assets.mixkit.co/75p73gjaef0hbuyxfuflnlein92m',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-15',
    wallet_address: '0xTEMPLATE000000000000000000000000000015',
    username: 'ømr',
    avatar: null,
    video_url: 'https://assets.mixkit.co/06jelsa32165b7uucf6owicufji2',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
];

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
  const activeStories = stories.length > 0 ? stories : TEMPLATE_STORIES;

  // Lazy-load fresh avatars in the background (non-blocking)
  // Skip avatar fetching for template stories (they don't exist in DeHub API)
  const { data: enrichedStories = activeStories } = useQuery({
    queryKey: ['stories-with-avatars', activeStories.map(s => s.id).join(',')],
    queryFn: async () => {
      if (activeStories.length === 0) return [];
      
      // Get unique wallet addresses, excluding template addresses
      const uniqueAddresses = [...new Set(
        activeStories
          .filter(s => !isTemplateAddress(s.wallet_address))
          .map(s => s.wallet_address)
      )];
      
      // If all stories are templates, skip avatar fetching entirely
      if (uniqueAddresses.length === 0) return activeStories;
      
      // Fetch fresh avatars for all unique real users in parallel
      const avatarMap = new Map<string, string | null>();
      await Promise.all(
        uniqueAddresses.map(async (address) => {
          const freshAvatar = await fetchFreshAvatar(address);
          avatarMap.set(address.toLowerCase(), freshAvatar);
        })
      );
      
      // Enrich stories with fresh avatars (templates keep null avatar)
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
