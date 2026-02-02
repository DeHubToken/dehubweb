/**
 * Stories Hook
 * ============
 * Manages story uploads, fetching, and real-time updates.
 * Stories expire after 24 hours.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Story {
  id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  video_url: string;
  created_at: string;
  expires_at: string;
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
      // Generate unique filename
      const timestamp = Date.now();
      const filename = `${userInfo.walletAddress}/${timestamp}.webm`;

      setProgress(30);

      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('stories')
        .upload(filename, videoBlob, {
          contentType: 'video/webm',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setProgress(70);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('stories')
        .getPublicUrl(filename);

      const videoUrl = urlData.publicUrl;

      // Create story record
      const { error: insertError } = await supabase.from('stories').insert({
        wallet_address: userInfo.walletAddress,
        username: userInfo.username || null,
        avatar: userInfo.avatar || null,
        video_url: videoUrl,
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
