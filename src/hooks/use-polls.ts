import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPoll, getPolls, POLL_BATCH_LIMIT, voteOnPoll, removePollVote, closePoll } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DeHubPoll } from '@/lib/api/dehub';

const POLLS_KEY = 'polls';

// Every card asks whether its post has a poll, because the feed payload does
// not say. That was one GET /api/poll/<id> per card, against a global per-IP
// throttle of 20 requests per 10 seconds — so a scroll spent the budget on
// posts that have no poll (most of them) and the requests the reader actually
// cared about were rejected with 429 behind them. The viewport gate below
// spreads that out; it does not make it cheap.
//
// So cards that come into view together are asked about together, in one
// GET /api/polls?tokenIds=... . One request a page instead of one a card.
const BATCH_WINDOW_MS = 50;

// A poll can only be attached when a post is created — there is no "add a poll
// to an existing post" flow — so "this post has no poll" is permanent and worth
// keeping across reloads. After the first pass a returning reader asks about
// nothing at all.
const NO_POLL_KEY = 'dehub-posts-without-polls';
const NO_POLL_LIMIT = 4000;

let noPollIds: number[] | null = null;
let noPollSet: Set<number> | null = null;

function knownEmpty(): Set<number> {
  if (noPollSet) return noPollSet;
  try {
    const raw = localStorage.getItem(NO_POLL_KEY);
    noPollIds = raw ? (JSON.parse(raw) as number[]) : [];
    if (!Array.isArray(noPollIds)) noPollIds = [];
  } catch {
    noPollIds = [];
  }
  noPollSet = new Set(noPollIds);
  return noPollSet;
}

function rememberEmpty(ids: number[]) {
  const set = knownEmpty();
  const added = ids.filter(id => !set.has(id));
  if (added.length === 0) return;
  for (const id of added) set.add(id);
  noPollIds = [...(noPollIds ?? []), ...added];
  if (noPollIds.length > NO_POLL_LIMIT) {
    noPollIds = noPollIds.slice(noPollIds.length - NO_POLL_LIMIT);
    noPollSet = new Set(noPollIds);
  }
  try {
    localStorage.setItem(NO_POLL_KEY, JSON.stringify(noPollIds));
  } catch {
    // A full or blocked store only costs us the cross-reload shortcut.
  }
}

/**
 * Forget that a post had no poll. Creating one is the case that matters: the
 * tokenId is almost certainly in the set, and without this the new poll would
 * be masked by the answer from before it existed.
 */
function forgetEmpty(tokenId: number) {
  const set = knownEmpty();
  if (!set.has(tokenId)) return;
  set.delete(tokenId);
  noPollIds = (noPollIds ?? []).filter(id => id !== tokenId);
  try {
    localStorage.setItem(NO_POLL_KEY, JSON.stringify(noPollIds));
  } catch {
    // See above.
  }
}

// Ids waiting for the next flush, and everyone waiting on each of them.
const queued = new Map<
  number,
  Array<{ resolve: (poll: DeHubPoll | null) => void; reject: (err: unknown) => void }>
>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  const ids = [...queued.keys()].slice(0, POLL_BATCH_LIMIT);
  if (ids.length === 0) return;

  const take = (id: number) => {
    const waiters = queued.get(id);
    queued.delete(id);
    return waiters ?? [];
  };

  try {
    const res = await getPolls(ids);
    const found = (res?.status ? res.result : {}) ?? {};
    const empties: number[] = [];
    for (const id of ids) {
      const poll = (found as Record<string, DeHubPoll>)[String(id)] ?? null;
      if (poll === null) empties.push(id);
      take(id).forEach(w => w.resolve(poll));
    }
    // The server answered: these posts have no poll, and never will.
    rememberEmpty(empties);
  } catch (err) {
    // Transient — a 429, a dropped connection. Reject rather than resolve null:
    // react-query caches what a queryFn RETURNS for staleTime, so answering
    // "no poll" here would hide a real poll for five minutes on the strength of
    // a rate limit. An error is not cached as data, and remounting retries.
    for (const id of ids) take(id).forEach(w => w.reject(err));
  }

  if (queued.size > 0) scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
}

function fetchPollBatched(tokenId: number): Promise<DeHubPoll | null> {
  if (knownEmpty().has(tokenId)) return Promise.resolve(null);
  return new Promise<DeHubPoll | null>((resolve, reject) => {
    const waiters = queued.get(tokenId);
    if (waiters) {
      waiters.push({ resolve, reject });
    } else {
      queued.set(tokenId, [{ resolve, reject }]);
    }
    scheduleFlush();
  });
}

export function usePoll(tokenId: number, enabled = true) {
  return useQuery({
    queryKey: [POLLS_KEY, tokenId],
    queryFn: () => fetchPollBatched(tokenId),
    // The feed API has no "has poll" flag, so every card must probe — the
    // `enabled` gate lets cards defer that probe until near the viewport, and
    // the batching above turns the probes that do fire into one request.
    enabled: !!tokenId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useCreatePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPoll,
    onSuccess: (data, variables) => {
      // The post had no poll a moment ago and that answer is remembered as
      // permanent — it has to be dropped now, or the poll just created stays
      // invisible.
      forgetEmpty(variables.tokenId);
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

// Exported for the tests: the batcher and the remembered-negative set are the
// parts worth pinning, and both are module state rather than hook state.
export { fetchPollBatched as __fetchPollBatched, forgetEmpty as __forgetEmpty };
