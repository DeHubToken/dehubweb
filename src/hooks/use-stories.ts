/**
 * Stories Hook
 * ============
 * Manages story uploads, fetching, and real-time updates.
 * Stories expire after 24 hours.
 * Avatars are fetched fresh from user profiles to stay current.
 */

import { useState } from 'react';
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
    username: 'alex_streams',
    avatar: null,
    video_url: 'https://videos.pexels.com/video-files/4057411/4057411-uhd_1440_2560_25fps.mp4',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-2',
    wallet_address: '0xTEMPLATE000000000000000000000000000002',
    username: 'maya_creates',
    avatar: null,
    video_url: 'https://videos.pexels.com/video-files/5377684/5377684-uhd_1440_2560_25fps.mp4',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-3',
    wallet_address: '0xTEMPLATE000000000000000000000000000003',
    username: 'kai_fitness',
    avatar: null,
    video_url: 'https://videos.pexels.com/video-files/4536108/4536108-uhd_1440_2560_25fps.mp4',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-4',
    wallet_address: '0xTEMPLATE000000000000000000000000000004',
    username: 'luna_music',
    avatar: null,
    video_url: 'https://videos.pexels.com/video-files/3571264/3571264-uhd_1440_2560_30fps.mp4',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'template-5',
    wallet_address: '0xTEMPLATE000000000000000000000000000005',
    username: 'dev_marco',
    avatar: null,
    video_url: 'https://videos.pexels.com/video-files/6010489/6010489-uhd_1440_2560_25fps.mp4',
    thumbnail_url: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
];

const isTemplateAddress = (address: string) => address.startsWith('0xTEMPLATE');

export function useStories() {
  const queryClient = useQueryClient();

  // Fetch active (non-expired) stories - FAST: just DB query, no avatar fetching
  const { data: stories = [], isLoading, refetch } = useQuery({
    queryKey: ['stories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return data as Story[];
    },
    staleTime: 1000 * 60, // 1 minute
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
