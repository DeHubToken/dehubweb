import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPoll, getPoll, voteOnPoll, removePollVote, closePoll } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DeHubPoll } from '@/lib/api/dehub';

const POLLS_KEY = 'polls';

export function usePoll(tokenId: number) {
  return useQuery({
    queryKey: [POLLS_KEY, tokenId],
    queryFn: async () => {
      const res = await getPoll(tokenId);
      return res.result as DeHubPoll | null;
    },
    enabled: !!tokenId,
    staleTime: 30 * 1000, // Poll results revalidate frequently
  });
}

export function useCreatePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPoll,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [POLLS_KEY] });
      toast.success('Poll created');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to create poll'),
  });
}

export function useVoteOnPoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tokenId, optionIndexes }: { tokenId: number; optionIndexes: number[] }) =>
      voteOnPoll(tokenId, optionIndexes),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [POLLS_KEY, variables.tokenId] });
      toast.success('Vote recorded');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to vote'),
  });
}

export function useRemovePollVote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removePollVote,
    onSuccess: (_data, tokenId) => {
      queryClient.invalidateQueries({ queryKey: [POLLS_KEY, tokenId] });
      toast.success('Vote removed');
    },
    onError: () => toast.error('Failed to remove vote'),
  });
}

export function useClosePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: closePoll,
    onSuccess: (_data, tokenId) => {
      queryClient.invalidateQueries({ queryKey: [POLLS_KEY, tokenId] });
      toast.success('Poll closed');
    },
    onError: () => toast.error('Failed to close poll'),
  });
}
