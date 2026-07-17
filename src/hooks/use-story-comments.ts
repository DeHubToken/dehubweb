/**
 * Story Comments Hook
 * ===================
 * Manages comments for stories using our own database.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isTemplateId } from './use-stories';


export interface StoryComment {
  id: string;
  story_id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
  parent_id: string | null;
}

export function useStoryComments(storyId: string | undefined) {
  const { walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Fetch comments for this story
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['story-comments', storyId],
    queryFn: async (): Promise<StoryComment[]> => {
      if (!storyId || isTemplateId(storyId)) return [];

      const { data, error } = await supabase
        .from('story_comments' as any)
        .select('*')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[story-comments] Error fetching comments:', error);
        return [];
      }

      return (data as unknown as StoryComment[]) || [];
    },
    enabled: !!storyId && !isTemplateId(storyId),
    staleTime: 10000,
  });

  // Post a new comment
  const postCommentMutation = useMutation({
    mutationFn: async ({ content, parentId, username, avatar }: {
      content: string;
      parentId?: string;
      username?: string;
      avatar?: string;
    }) => {
      if (!storyId || !walletAddress || isTemplateId(storyId)) {
        throw new Error(!walletAddress ? 'Not authenticated' : 'Cannot comment on template stories');
      }

      const lowerWallet = walletAddress.toLowerCase();

      const { data, error } = await supabase
        .from('story_comments' as any)
        .insert({
          story_id: storyId,
          wallet_address: lowerWallet,
          content,
          parent_id: parentId || null,
          username: username || null,
          avatar: avatar || null,
        })
        .select()
        .single()
        .setHeader('x-wallet-address', lowerWallet);

      if (error) throw error;
      return data as unknown as StoryComment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story-comments', storyId] });
      toast.success('Comment posted!');
    },
    onError: () => {
      toast.error('Failed to post comment');
    },
  });

  // Delete a comment
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!walletAddress) {
        throw new Error('Not authenticated');
      }

      const lowerWallet = walletAddress.toLowerCase();

      const { error } = await supabase
        .from('story_comments' as any)
        .delete()
        .eq('id', commentId)
        .setHeader('x-wallet-address', lowerWallet);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story-comments', storyId] });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });

  const postComment = (content: string, parentId?: string, username?: string, avatar?: string) => {
    if (!isAuthenticated) {
      toast.error('Log in to comment');
      return;
    }
    if (!content.trim()) {
      toast.error('Comment cannot be empty');
      return;
    }
    postCommentMutation.mutate({ content: content.trim(), parentId, username, avatar });
  };

  const deleteComment = (commentId: string) => {
    if (!isAuthenticated) {
      toast.error('Log in to delete comments');
      return;
    }
    deleteCommentMutation.mutate(commentId);
  };

  return {
    comments,
    commentCount: comments.length,
    isLoading,
    isPosting: postCommentMutation.isPending,
    isDeleting: deleteCommentMutation.isPending,
    postComment,
    deleteComment,
  };
}
