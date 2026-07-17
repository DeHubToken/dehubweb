/**
 * Story Reactions Hook
 * ====================
 * Manages like/dislike reactions for stories using our own database.
 * Supports toggling and switching between like/dislike.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isTemplateId } from './use-stories';


interface StoryReaction {
  id: string;
  story_id: string;
  wallet_address: string;
  reaction_type: 'like' | 'dislike';
  created_at: string;
}

interface ReactionCounts {
  likes: number;
  dislikes: number;
  userReaction: 'like' | 'dislike' | null;
}

export function useStoryReactions(storyId: string | undefined) {
  const { walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Fetch reaction counts and user's current reaction
  const { data: reactionData, isLoading } = useQuery({
    queryKey: ['story-reactions', storyId],
    queryFn: async (): Promise<ReactionCounts> => {
      if (!storyId || isTemplateId(storyId)) return { likes: 0, dislikes: 0, userReaction: null };

      // Get all reactions for this story
      const { data: reactions, error } = await supabase
        .from('story_reactions')
        .select('*')
        .eq('story_id', storyId);

      if (error) throw error;

      const likes = reactions?.filter(r => r.reaction_type === 'like').length || 0;
      const dislikes = reactions?.filter(r => r.reaction_type === 'dislike').length || 0;

      // Find user's reaction
      const userReaction = walletAddress
        ? (reactions?.find(r => r.wallet_address.toLowerCase() === walletAddress.toLowerCase())?.reaction_type as 'like' | 'dislike' | undefined) || null
        : null;

      return { likes, dislikes, userReaction };
    },
    enabled: !!storyId && !isTemplateId(storyId),
    staleTime: 10000, // 10 seconds
  });

  // Mutation for reacting to a story
  const reactMutation = useMutation({
    mutationFn: async (reactionType: 'like' | 'dislike') => {
      if (!storyId || !walletAddress || isTemplateId(storyId)) {
        throw new Error(!walletAddress ? 'Not authenticated' : 'Cannot react to template stories');
      }

      const lowerWallet = walletAddress.toLowerCase();
      const currentReaction = reactionData?.userReaction;

      // If clicking the same reaction, remove it (toggle off)
      if (currentReaction === reactionType) {
        const { error } = await supabase
          .from('story_reactions')
          .delete()
          .eq('story_id', storyId)
          .eq('wallet_address', lowerWallet)
          .setHeader('x-wallet-address', lowerWallet);

        if (error) throw error;
        return { action: 'removed', type: reactionType };
      }

      // If switching or adding a reaction, upsert
      const { error } = await supabase
        .from('story_reactions')
        .upsert(
          {
            story_id: storyId,
            wallet_address: lowerWallet,
            reaction_type: reactionType,
          },
          { onConflict: 'story_id,wallet_address' }
        )
        .setHeader('x-wallet-address', lowerWallet);

      if (error) throw error;
      return { action: currentReaction ? 'switched' : 'added', type: reactionType };
    },
    onMutate: async (reactionType) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['story-reactions', storyId] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<ReactionCounts>(['story-reactions', storyId]);

      // Optimistically update
      if (previousData) {
        const newData = { ...previousData };
        const currentReaction = previousData.userReaction;

        if (currentReaction === reactionType) {
          // Toggle off
          if (reactionType === 'like') newData.likes--;
          else newData.dislikes--;
          newData.userReaction = null;
        } else if (currentReaction) {
          // Switching
          if (currentReaction === 'like') {
            newData.likes--;
            newData.dislikes++;
          } else {
            newData.dislikes--;
            newData.likes++;
          }
          newData.userReaction = reactionType;
        } else {
          // Adding new
          if (reactionType === 'like') newData.likes++;
          else newData.dislikes++;
          newData.userReaction = reactionType;
        }

        queryClient.setQueryData(['story-reactions', storyId], newData);
      }

      return { previousData };
    },
    onError: (err, _, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['story-reactions', storyId], context.previousData);
      }
      toast.error('Failed to react');
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['story-reactions', storyId] });
    },
  });

  const react = (type: 'like' | 'dislike') => {
    if (!isAuthenticated) {
      toast.error('Log in to react');
      return;
    }
    reactMutation.mutate(type);
  };

  return {
    likes: reactionData?.likes || 0,
    dislikes: reactionData?.dislikes || 0,
    userReaction: reactionData?.userReaction || null,
    isLiked: reactionData?.userReaction === 'like',
    isDisliked: reactionData?.userReaction === 'dislike',
    isLoading,
    isReacting: reactMutation.isPending,
    react,
  };
}
