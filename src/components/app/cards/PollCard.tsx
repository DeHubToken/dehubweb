import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePoll, useVoteOnPoll, useRemovePollVote, useClosePoll } from '@/hooks/use-polls';
import { useAuth } from '@/contexts/AuthContext';

interface PollCardProps {
  tokenId: number;
}

export function PollCard({ tokenId }: PollCardProps) {
  const { data: poll, isLoading } = usePoll(tokenId);
  const { walletAddress } = useAuth();
  const voteMutation = useVoteOnPoll();
  const removeVoteMutation = useRemovePollVote();
  const closePollMutation = useClosePoll();

  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  // Persist vote across page refreshes via localStorage
  const [localVotedIndexes, setLocalVotedIndexes] = useState<number[] | null>(() => {
    try {
      const stored = localStorage.getItem(`dehub-poll-vote-${tokenId}`);
      if (stored) return JSON.parse(stored) as number[];
    } catch {}
    return null;
  });
  const [localVoteCounts, setLocalVoteCounts] = useState<Record<number, number> | null>(null);

  if (isLoading || !poll) return null;

  const hasVoted = localVotedIndexes !== null || !!poll.userVote;
  const votedIndexes = localVotedIndexes ?? poll.userVote?.optionIndexes ?? [];

  // Merge local optimistic counts with server counts
  const getCount = (index: number) => {
    if (localVoteCounts !== null) return localVoteCounts[index] ?? 0;
    return poll.options.find(o => o.index === index)?.voteCount ?? 0;
  };
  const totalVotes = localVoteCounts !== null
    ? Object.values(localVoteCounts).reduce((a, b) => a + b, 0)
    : poll.totalVotes;

  const getBarWidth = (index: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((getCount(index) / totalVotes) * 100);
  };

  const isOwner = walletAddress && poll.address.toLowerCase() === walletAddress.toLowerCase();

  const applyOptimisticVote = (indexes: number[]) => {
    const counts: Record<number, number> = {};
    poll.options.forEach(o => { counts[o.index] = o.voteCount ?? 0; });
    indexes.forEach(idx => { counts[idx] = (counts[idx] ?? 0) + 1; });
    setLocalVotedIndexes(indexes);
    setLocalVoteCounts(counts);
    try { localStorage.setItem(`dehub-poll-vote-${tokenId}`, JSON.stringify(indexes)); } catch {}
  };

  const handleOptionClick = (idx: number) => {
    if (hasVoted || !poll.isActive || voteMutation.isPending) return;
    if (poll.isMultipleChoice) {
      setSelectedIndexes(prev =>
        prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
      );
    } else {
      applyOptimisticVote([idx]);
      voteMutation.mutate({ tokenId, optionIndexes: [idx] }, {
        onError: () => { setLocalVotedIndexes(null); setLocalVoteCounts(null); try { localStorage.removeItem(`dehub-poll-vote-${tokenId}`); } catch {} },
      });
    }
  };

  const handleMultipleChoiceVote = () => {
    if (selectedIndexes.length === 0) return;
    applyOptimisticVote(selectedIndexes);
    voteMutation.mutate({ tokenId, optionIndexes: selectedIndexes }, {
      onError: () => { setLocalVotedIndexes(null); setLocalVoteCounts(null); try { localStorage.removeItem(`dehub-poll-vote-${tokenId}`); } catch {} },
    });
    setSelectedIndexes([]);
  };

  const handleRemoveVote = () => {
    setLocalVotedIndexes(null);
    setLocalVoteCounts(null);
    try { localStorage.removeItem(`dehub-poll-vote-${tokenId}`); } catch {}
    removeVoteMutation.mutate(tokenId);
  };

  return (
    <div data-poll-card className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3 mt-2" data-no-navigate onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-white font-medium text-sm leading-snug">
          {poll.question}
          {!poll.isActive && <span className="ml-2 text-zinc-500 text-xs font-normal">(Closed)</span>}
        </p>
        {isOwner && poll.isActive && (
          <button
            onClick={() => closePollMutation.mutate(tokenId)}
            disabled={closePollMutation.isPending}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 disabled:opacity-50"
          >
            Close Poll
          </button>
        )}
      </div>

      <div className="space-y-2">
        {poll.options.map(option => {
          const pct = getBarWidth(option.index);
          const isVoted = votedIndexes.includes(option.index);
          const isSelected = selectedIndexes.includes(option.index);
          const canClick = !hasVoted && poll.isActive && !voteMutation.isPending;

          return (
            <button
              key={option.index}
              onClick={() => handleOptionClick(option.index)}
              disabled={!canClick}
              className={cn(
                'relative w-full text-left rounded-lg overflow-hidden transition-colors',
                canClick ? 'cursor-pointer hover:bg-white/5' : 'cursor-default',
              )}
            >
              <div className="relative z-10 flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {poll.isMultipleChoice && !hasVoted && poll.isActive && (
                    <span className={cn(
                      'w-4 h-4 shrink-0 rounded border flex items-center justify-center',
                      isSelected ? 'bg-white border-white' : 'border-white/30',
                    )}>
                      {isSelected && <span className="block w-2 h-2 rounded-sm bg-black" />}
                    </span>
                  )}
                  {!poll.isMultipleChoice && !hasVoted && poll.isActive && (
                    <span className={cn(
                      'w-4 h-4 shrink-0 rounded-full border flex items-center justify-center',
                      'border-white/30',
                    )}>
                      <span className="block w-2 h-2 rounded-full bg-transparent" />
                    </span>
                  )}
                  <span className={cn('text-sm truncate', isVoted ? 'text-white font-medium' : 'text-zinc-300')}>
                    {option.text}
                  </span>
                </div>
                {hasVoted && (
                  <span className="text-xs text-zinc-400 shrink-0 ml-2">{pct}%</span>
                )}
              </div>
              <div className="absolute inset-0 rounded-lg bg-white/10" />
              {hasVoted && (
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-lg transition-all duration-500',
                    isVoted ? 'bg-white/40' : 'bg-white/20',
                  )}
                  style={{ width: `${pct}%` }}
                />
              )}
            </button>
          );
        })}
      </div>

      {poll.isMultipleChoice && !hasVoted && poll.isActive && selectedIndexes.length > 0 && (
        <button
          onClick={handleMultipleChoiceVote}
          disabled={voteMutation.isPending}
          className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {voteMutation.isPending ? 'Voting...' : 'Vote'}
        </button>
      )}

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
        <div className="flex items-center gap-3">
          {poll.expiresAt && (
            <span>
              {poll.isActive
                ? `Ends ${formatDistanceToNow(new Date(poll.expiresAt), { addSuffix: true })}`
                : `Ended ${formatDistanceToNow(new Date(poll.expiresAt), { addSuffix: true })}`}
            </span>
          )}
          {hasVoted && poll.isActive && (
            <button
              onClick={handleRemoveVote}
              disabled={removeVoteMutation.isPending}
              className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <X className="w-3 h-3" />
              Remove vote
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
