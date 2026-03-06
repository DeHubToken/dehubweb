/**
 * Single Governance Proposal Page
 * Route: /app/governance/:proposalId
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useGovernanceProposal } from '@/hooks/use-governance-proposal';
import {
  useGovernanceUserVotes,
  useVoteGovernanceProposal,
  getVoteWeight,
  type GovernanceProposal,
} from '@/hooks/use-governance';
import { useGovernanceComments, useSubmitGovernanceComment, useDeleteGovernanceComment } from '@/hooks/use-governance-comments';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useCallback, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ArrowLeft, Loader2, Send, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { TranslatableText } from '@/components/app/TranslatableText';
import { Input } from '@/components/ui/input';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { ActionBar } from '@/components/app/cards/ActionBar';
import { UserAvatar } from '@/components/app/UserAvatar';
import { buildAvatarUrl } from '@/lib/media-url';
import { useMention } from '@/hooks/use-mention';
import { UserMentionDropdown } from '@/components/app/mentions';

function formatTimeAgo(dateStr: string, t: (key: string, opts?: any) => string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return t('governance.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('governance.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('governance.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('governance.daysAgo', { count: days });
  const months = Math.floor(days / 30);
  return t('governance.monthsAgo', { count: months });
}

const KNOWN_AVATAR_ADDRESSES: Record<string, string> = {
  '0xmaldoteth': '0x9324840523a5d17dd12a2f11a9472e5a199c1937',
  maldoteth: '0x9324840523a5d17dd12a2f11a9472e5a199c1937',
};
const KNOWN_DISPLAY_NAMES: Record<string, string> = {
  maldoteth: 'mal',
};

export default function GovernanceProposalPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal, walletAddress, user } = useAuth();
  const isMobile = useIsMobile();

  const { data: proposal, isLoading } = useGovernanceProposal(proposalId);
  const { data: userVotes } = useGovernanceUserVotes();
  const voteMutation = useVoteGovernanceProposal();

  const userBadgeBalance = user?.badgeBalance as number | undefined;
  const usernameVal = user?.username;

  // Comments — always visible on detail page
  const { data: comments, isLoading: commentsLoading } = useGovernanceComments(proposalId ?? null);
  const submitComment = useSubmitGovernanceComment();
  const deleteComment = useDeleteGovernanceComment();
  const [commentText, setCommentText] = useState('');
  const commentInputRef = useRef<HTMLInputElement>(null);

  const mention = useMention({
    inputRef: commentInputRef,
    onMentionInsert: (_user, newText) => setCommentText(newText.slice(0, 500)),
  });

  const currentVote = userVotes?.[proposalId ?? '']?.type;

  // Resolve avatar — must be before any early return
  const authorAddress = proposal?.author_wallet_address ?? '';
  const resolvedAddress = KNOWN_AVATAR_ADDRESSES[authorAddress.toLowerCase()] || authorAddress;
  const storedAvatarUrl = proposal?.author_avatar ? buildAvatarUrl(resolvedAddress, proposal.author_avatar) : null;
  const dynamicAvatarUrl = useProfileAvatar(resolvedAddress, storedAvatarUrl || undefined);
  const avatarUrl = dynamicAvatarUrl || storedAvatarUrl;

  const handleVote = useCallback(
    (voteType: 1 | -1) => {
      if (!isAuthenticated) { openLoginModal(); return; }
      if (!proposalId) return;
      const { weight, badgeName } = getVoteWeight(userBadgeBalance, usernameVal);
      if (weight === 0) { toast.error(t('governance.mustHoldTokens')); return; }
      voteMutation.mutate({ proposalId, voteType, currentVote, voteWeight: weight, badgeName });
    },
    [isAuthenticated, openLoginModal, proposalId, currentVote, voteMutation, userBadgeBalance, usernameVal, t]
  );

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) { openLoginModal(); return; }
    if (!commentText.trim() || !proposalId) return;
    submitComment.mutate(
      { proposalId, content: commentText },
      { onSuccess: () => setCommentText('') }
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen px-4 pt-6 text-center">
        <ShieldCheck className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
        <h2 className="text-white font-semibold text-lg mb-1">Proposal not found</h2>
        <button onClick={() => navigate('/app/governance')} className="text-zinc-400 text-sm underline">
          Back to Governance
        </button>
      </div>
    );
  }
  const username_raw = proposal.author_username || '';
  const displayName = KNOWN_DISPLAY_NAMES[username_raw.toLowerCase()] || username_raw || proposal.author_wallet_address.slice(0, 6);
  const handle = username_raw ? `@${username_raw}` : `${proposal.author_wallet_address.slice(0, 6)}...${proposal.author_wallet_address.slice(-4)}`;

  const isLiked = currentVote === 1;
  const isDisliked = currentVote === -1;
  const total = (proposal.like_count ?? 0) + (proposal.dislike_count ?? 0);
  const forPct = total > 0 ? Math.round(((proposal.like_count ?? 0) / total) * 100) : 50;
  const againstPct = 100 - forPct;

  const { weight: userWeight } = getVoteWeight(userBadgeBalance, usernameVal);

  return (
    <div className="min-h-screen px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2 max-w-2xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate('/app/governance')}
        className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm mb-3 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('governance.title', 'Governance')}
      </button>

      {/* Proposal card */}
      <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-4">
        <div className="flex items-start justify-between mb-3">
          <CardHeader
            username={displayName}
            handle={handle}
            avatarSeed={avatarUrl || proposal.author_wallet_address}
            verified={false}
            contentType="post"
            creatorId={proposal.author_wallet_address}
            creatorUsername={proposal.author_username || undefined}
          />
          <span className="text-zinc-500 text-[10px] shrink-0 pt-1">{formatTimeAgo(proposal.created_at, t)}</span>
        </div>

        <TranslatableText text={proposal.title} className="text-white font-semibold text-base leading-tight mb-2" as="h1" hideControls />
        <TranslatableText text={proposal.description} className="text-zinc-400 text-sm leading-relaxed mb-4" as="p" />

        {/* Vote ratio bar */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-[10px]">
            <span className="text-emerald-400 font-medium">{forPct}% {t('governance.forLabel', 'For')}</span>
            <span className="text-red-400 font-medium">{againstPct}% {t('governance.againstLabel', 'Against')}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden flex">
            {total > 0 ? (
              <>
                <div className="bg-emerald-500 rounded-l-full transition-all duration-300" style={{ width: `${forPct}%` }} />
                <div className="bg-red-500 rounded-r-full transition-all duration-300" style={{ width: `${againstPct}%` }} />
              </>
            ) : (
              <div className="bg-zinc-700 w-full rounded-full" />
            )}
          </div>
        </div>

        <ActionBar
          postId={proposal.id}
          className="p-0"
          onComment={() => commentInputRef.current?.focus()}
          onLike={() => handleVote(1)}
          onDislike={() => handleVote(-1)}
          isLiked={isLiked}
          isDisliked={isDisliked}
          likeCount={proposal.like_count ?? 0}
          dislikeCount={proposal.dislike_count ?? 0}
          commentCount={proposal.comment_count}
          voteWeight={userWeight}
        />
      </div>

      {/* Comments — always visible */}
      <div className="mt-4 rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-4">
        <h3 className="text-white text-sm font-semibold mb-3">{t('governance.comments', 'Comments')}</h3>

        {commentsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          </div>
        ) : comments && comments.length > 0 ? (
          <div className="space-y-3 mb-4">
            {comments.map((comment) => {
              const commentAvatar = comment.avatar && comment.wallet_address
                ? buildAvatarUrl(comment.wallet_address, comment.avatar) : null;
              const commentName = comment.username
                ? `@${comment.username}`
                : `${comment.wallet_address.slice(0, 6)}...${comment.wallet_address.slice(-4)}`;
              const isOwn = walletAddress?.toLowerCase() === comment.wallet_address.toLowerCase();
              return (
                <div key={comment.id} className="flex gap-2 group">
                  <UserAvatar
                    name={comment.username || comment.wallet_address.slice(0, 6)}
                    handle={comment.username || comment.wallet_address}
                    avatarUrl={commentAvatar}
                    size="sm"
                    className="w-6 h-6 shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-400 text-[11px] font-medium">{commentName}</span>
                      <span className="text-zinc-600 text-[10px]">{formatTimeAgo(comment.created_at, t)}</span>
                      {isOwn && (
                        <button
                          type="button"
                          onClick={() => deleteComment.mutate({ commentId: comment.id, proposalId: proposal.id })}
                          className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                        >
                          <Trash2 className="w-3 h-3 text-zinc-600 hover:text-red-400" />
                        </button>
                      )}
                    </div>
                    <TranslatableText text={comment.content} className="text-zinc-300 text-xs leading-relaxed" as="p" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-zinc-600 text-xs text-center py-3 mb-3">{t('governance.noCommentsYet')}</p>
        )}

        <form onSubmit={handleSubmitComment} className="relative flex gap-2">
          <Input
            ref={commentInputRef}
            value={commentText}
            onChange={(e) => {
              const val = e.target.value;
              setCommentText(val);
              mention.handleInput(val, e.target.selectionStart ?? val.length);
            }}
            onKeyDown={(e) => {
              if (mention.isOpen) {
                const handled = mention.handleKeyDown(e);
                if (handled) {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    const liveResults = (window as any).__mentionResults || [];
                    if (liveResults[mention.selectedIndex]) {
                      mention.handleSelect(liveResults[mention.selectedIndex]);
                    }
                  }
                  return;
                }
              }
            }}
            placeholder={t('governance.addComment')}
            maxLength={500}
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 rounded-xl text-xs h-8"
          />
          <UserMentionDropdown
            query={mention.query}
            isOpen={mention.isOpen}
            position={mention.position}
            selectedIndex={mention.selectedIndex}
            onSelectedIndexChange={mention.setSelectedIndex}
            onSelect={mention.handleSelect}
            onClose={mention.handleClose}
          />
          <button
            type="submit"
            disabled={!commentText.trim() || submitComment.isPending}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white disabled:opacity-30 transition-opacity"
          >
            {submitComment.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
