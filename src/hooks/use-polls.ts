import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPoll, getPoll, voteOnPoll, removePollVote, closePoll } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DeHubPoll } from '@/lib/api/dehub';

const POLLS_KEY = 'polls';

export function usePoll(tokenId: number, enabled = true) {
  return useQuery({
    queryKey: [POLLS_KEY, tokenId],
    queryFn: async () => {
      try {
        const res = await getPoll(tokenId);
        if (!res.status) return null;
        return res.result as DeHubPoll | null;
      } catch {
        return null;
      }
    },
    // The feed API has no "has poll" flag, so every card must probe — the
    // `enabled` gate lets cards defer that probe until near the viewport
    // instead of bursting one request per card on feed mount.
    enabled: !!tokenId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
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
    // Optimistic: move the ballot the instant the user taps, reconcile with
    // the server response in the background.
    onMutate: async ({ tokenId, optionIndexes }) => {
      await queryClient.cancelQueries({ queryKey: [POLLS_KEY, tokenId] });
      const previous = queryClient.getQueryData<DeHubPoll | null>([POLLS_KEY, tokenId]);
      if (previous) {
        const prevIndexes = previous.userVote?.optionIndexes ?? [];
        queryClient.setQueryData<DeHubPoll>([POLLS_KEY, tokenId], {
          ...previous,
          options: previous.options.map(opt => ({
            ...opt,
            voteCount:
              opt.voteCount
              - (prevIndexes.includes(opt.index) ? 1 : 0)
              + (optionIndexes.includes(opt.index) ? 1 : 0),
          })),
          totalVotes: previous.totalVotes + (prevIndexes.length ? 0 : 1),
          userVote: { optionIndexes, votedAt: new Date().toISOString() },
        });
      }
      return { previous };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [POLLS_KEY, variables.tokenId] });
    },
    onError: (err: any, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData([POLLS_KEY, variables.tokenId], context.previous);
      }
      toast.error(err?.message || 'Failed to vote');
    },
  });
}

export function useRemovePollVote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removePollVote,
    onMutate: async (tokenId) => {
      await queryClient.cancelQueries({ queryKey: [POLLS_KEY, tokenId] });
      const previous = queryClient.getQueryData<DeHubPoll | null>([POLLS_KEY, tokenId]);
      if (previous?.userVote) {
        const prevIndexes = previous.userVote.optionIndexes;
        queryClient.setQueryData<DeHubPoll>([POLLS_KEY, tokenId], {
          ...previous,
          options: previous.options.map(opt => ({
            ...opt,
            voteCount: opt.voteCount - (prevIndexes.includes(opt.index) ? 1 : 0),
          })),
          totalVotes: Math.max(0, previous.totalVotes - 1),
          userVote: null,
        });
      }
      return { previous };
    },
    onSuccess: (_data, tokenId) => {
      queryClient.invalidateQueries({ queryKey: [POLLS_KEY, tokenId] });
    },
    onError: (_err, tokenId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData([POLLS_KEY, tokenId], context.previous);
      }
      toast.error('Failed to remove vote');
    },
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
