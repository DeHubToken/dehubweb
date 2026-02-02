/**
 * Stories Hook
 * ============
 * Manages story uploads, fetching, and real-time updates.
 * Stories expire after 24 hours.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

export function useStories() {
  const queryClient = useQueryClient();

  // Fetch active (non-expired) stories
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

  // Group stories by user (most recent story per user shown in bar)
  const storyUsers = stories.reduce((acc, story) => {
    if (!acc.find((s) => s.wallet_address === story.wallet_address)) {
      acc.push(story);
    }
    return acc;
  }, [] as Story[]);

  return {
    stories,
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
