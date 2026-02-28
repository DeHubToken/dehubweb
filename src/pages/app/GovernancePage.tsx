/**
 * Governance Page
 * ===============
 * Token-holder governance board with weighted voting based on badge tier.
 * Mirrors the Feature Requests UI pattern but without categories.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { Search, Plus, X, Loader2, Sparkles, CheckCircle2, MessageCircle, Send, Trash2, ShieldCheck, Info } from 'lucide-react';
import { toast } from 'sonner';
import { TranslatableText } from '@/components/app/TranslatableText';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { UserAvatar } from '@/components/app/UserAvatar';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { ActionBar } from '@/components/app/cards/ActionBar';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl } from '@/lib/media-url';
import { useProfileAvatar } from '@/hooks/use-profile-avatar-cache';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getBadgeName, getBadgeUrl } from '@/lib/staking-badges';
import { useMention } from '@/hooks/use-mention';
import { UserMentionDropdown } from '@/components/app/mentions';
import {
  useGovernanceProposals,
  useCompletedProposals,
  useGovernanceUserVotes,
  useTotalGovernanceCount,
  useSubmitGovernanceProposal,
  useVoteGovernanceProposal,
  getVoteWeight,
  BADGE_VOTE_WEIGHT,
  type GovernanceSort,
  type GovernanceProposal,
} from '@/hooks/use-governance';
import { useGovernanceComments, useSubmitGovernanceComment, useDeleteGovernanceComment } from '@/hooks/use-governance-comments';
import { z } from 'zod';

const proposalSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100, 'Title must be under 100 characters'),
  description: z.string().trim().min(1, 'Description is required').max(1000, 'Description must be under 1,000 characters'),
});

type PageTab = 'proposals' | 'passed' | 'rejected';

const SORTS: { id: GovernanceSort; label: string }[] = [
  { id: 'most_voted', label: 'Most Voted' },
  { id: 'newest', label: 'Newest' },
];

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ──────────────────────────────────────────────────
// Governance Card
// ──────────────────────────────────────────────────
function GovernanceCard({
  proposal,
  currentVote,
  onVote,
  voteDisabled,
  userBadgeBalance,
  username,
}: {
  proposal: GovernanceProposal;
  currentVote: number | undefined;
  onVote: (proposalId: string, voteType: 1 | -1, currentVote: number | undefined) => void;
  voteDisabled: boolean;
  userBadgeBalance: number | undefined;
  username: string | null | undefined;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const commentInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();

  const mention = useMention({
    inputRef: commentInputRef,
    onMentionInsert: (_user, newText) => setCommentText(newText.slice(0, 500)),
  });

  const { data: comments, isLoading: commentsLoading } = useGovernanceComments(showComments ? proposal.id : null);
  const submitComment = useSubmitGovernanceComment();
  const deleteComment = useDeleteGovernanceComment();

  const KNOWN_AVATAR_ADDRESSES: Record<string, string> = {
    maldoteth: '0x9324840523a5d17dd12a2f11a9472e5a199c1937',
  };

  const resolvedAddress = KNOWN_AVATAR_ADDRESSES[proposal.author_wallet_address.toLowerCase()] || proposal.author_wallet_address;
  const storedAvatarUrl = proposal.author_avatar
    ? buildAvatarUrl(resolvedAddress, proposal.author_avatar)
    : null;
  const dynamicAvatarUrl = useProfileAvatar(resolvedAddress, storedAvatarUrl || undefined);
  const avatarUrl = dynamicAvatarUrl || storedAvatarUrl;

  const displayName = proposal.author_username || proposal.author_wallet_address.slice(0, 6);
  const handle = proposal.author_username ? `@${proposal.author_username}` : `${proposal.author_wallet_address.slice(0, 6)}...${proposal.author_wallet_address.slice(-4)}`;

  const isLiked = currentVote === 1;
  const isDisliked = currentVote === -1;

  const handleLike = useCallback(() => {
    onVote(proposal.id, 1, currentVote);
  }, [proposal.id, currentVote, onVote]);

  const handleDislike = useCallback(() => {
    onVote(proposal.id, -1, currentVote);
  }, [proposal.id, currentVote, onVote]);

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) { openLoginModal(); return; }
    if (!commentText.trim()) return;
    submitComment.mutate(
      { proposalId: proposal.id, content: commentText },
      { onSuccess: () => setCommentText('') }
    );
  };

  // Show user's vote weight
  const { weight: userWeight, badgeName: userBadge } = getVoteWeight(userBadgeBalance, username);
  const badgeImageUrl = getBadgeUrl(userBadgeBalance, username);

  return (
    <div className="overflow-hidden relative">
      <CardHeader
        username={displayName}
        handle={handle}
        avatarSeed={avatarUrl || proposal.author_wallet_address}
        verified={false}
        contentType="post"
        creatorId={proposal.author_wallet_address}
        creatorUsername={proposal.author_username || undefined}
        timestamp={formatTimeAgo(proposal.created_at)}
      />

      <div className="pt-1 space-y-2">
        <TranslatableText text={proposal.title} className="text-white font-semibold text-sm leading-tight" as="h3" hideControls />
        <TranslatableText text={proposal.description} className="text-zinc-400 text-sm leading-relaxed" as="p" />

        {/* Governance badge + vote weight indicator */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-300 text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gradient-to-br from-white/15 via-white/8 to-white/3 backdrop-blur-xl border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.3)]">
            Governance
          </span>
          <span className="text-zinc-500 text-[10px]">
            Weighted: {proposal.like_count} for · {proposal.dislike_count} against
          </span>
        </div>

        <div className="pt-1">
          <ActionBar
            postId={proposal.id}
            className="p-0"
            onComment={() => setShowComments(prev => !prev)}
            onLike={handleLike}
            onDislike={handleDislike}
            isLiked={isLiked}
            isDisliked={isDisliked}
            likeCount={proposal.like_count ?? 0}
            dislikeCount={proposal.dislike_count ?? 0}
            commentCount={proposal.comment_count}
          />
        </div>

        {/* Comments Section */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-t border-white/5 pt-3 mt-1">
                {commentsLoading ? (
                  <div className="flex justify-center py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                  </div>
                ) : comments && comments.length > 0 ? (
                  <div className="space-y-2.5 mb-3 max-h-60 overflow-y-auto scrollbar-invisible">
                    {comments.map((comment) => {
                      const commentAvatar = comment.avatar && comment.wallet_address
                        ? buildAvatarUrl(comment.wallet_address, comment.avatar)
                        : null;
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
                              <span className="text-zinc-600 text-[10px]">{formatTimeAgo(comment.created_at)}</span>
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
                  <p className="text-zinc-600 text-xs text-center py-2 mb-2">No comments yet</p>
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
                    placeholder="Add a comment..."
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Submit Proposal Drawer
// ──────────────────────────────────────────────────
function SubmitProposalDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitMutation = useSubmitGovernanceProposal();

  const handleSubmit = () => {
    const result = proposalSchema.safeParse({ title, description });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    submitMutation.mutate(
      { title: result.data.title, description: result.data.description },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] border-white/10 max-h-[85vh]">
        <DrawerHeader className="relative">
          <DrawerTitle className="text-white text-lg font-bold">Submit Governance Proposal</DrawerTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4">
          <div>
            <label className="text-zinc-400 text-xs font-medium mb-1 block">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Increase staking rewards by 10%"
              maxLength={100}
              className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 rounded-xl"
            />
            <div className="flex justify-between mt-1">
              {errors.title && <span className="text-red-400 text-[11px]">{errors.title}</span>}
              <span className="text-zinc-600 text-[11px] ml-auto">{title.length}/100</span>
            </div>
          </div>

          <div>
            <label className="text-zinc-400 text-xs font-medium mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your proposal in detail..."
              maxLength={1000}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
            />
            <div className="flex justify-between mt-1">
              {errors.description && <span className="text-red-400 text-[11px]">{errors.description}</span>}
              <span className="text-zinc-600 text-[11px] ml-auto">{description.length}/1000</span>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            variant="glass"
            className="w-full rounded-xl font-semibold"
          >
            {submitMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Submit Proposal
              </>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ──────────────────────────────────────────────────
// Skeleton
// ──────────────────────────────────────────────────
function GovernanceSkeletons() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-zinc-900 rounded-2xl p-4 flex gap-3 animate-pulse">
          <div className="flex flex-col items-center gap-1 min-w-[40px]">
            <div className="w-8 h-8 rounded-lg bg-zinc-800" />
            <div className="w-5 h-4 rounded bg-zinc-800" />
            <div className="w-8 h-8 rounded-lg bg-zinc-800" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-zinc-800" />
            <div className="h-3 w-full rounded bg-zinc-800" />
            <div className="h-3 w-1/2 rounded bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Completed Proposal Card
// ──────────────────────────────────────────────────
function CompletedCard({ proposal }: { proposal: GovernanceProposal }) {
  const [expanded, setExpanded] = useState(false);
  const isPassed = proposal.status === 'passed' || (proposal.status === 'completed' && proposal.like_count > proposal.dislike_count);

  return (
    <div
      className="bg-zinc-900 rounded-2xl p-4 flex gap-3 cursor-pointer hover:bg-zinc-800/70 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex flex-col items-center justify-center min-w-[40px]">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPassed ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
          {isPassed
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            : <X className="w-4 h-4 text-red-400" />
          }
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1.5">
          <TranslatableText text={proposal.title} className="text-white font-semibold text-sm leading-tight flex-1 min-w-0" as="h3" hideControls />
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0 ${
            isPassed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {isPassed ? 'Passed' : 'Rejected'}
          </span>
        </div>

        <TranslatableText text={proposal.description} className={`text-zinc-400 text-xs leading-relaxed mb-2 ${expanded ? '' : 'line-clamp-2'}`} as="p" />

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-500 text-[11px]">{formatTimeAgo(proposal.updated_at)}</span>
          <span className="text-zinc-700 text-[11px]">·</span>
          <span className="text-zinc-500 text-[11px]">{proposal.like_count} weighted votes for</span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Infinite Scroll Sentinel
// ──────────────────────────────────────────────────
function InfiniteScrollSentinel({ onIntersect, isFetching }: { onIntersect: () => void; isFetching: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !isFetching) onIntersect(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect, isFetching]);

  return (
    <div ref={ref} className="flex justify-center py-4">
      {isFetching && <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Vote Weight Info Panel
// ──────────────────────────────────────────────────
function VoteWeightInfo({ badgeBalance, username }: { badgeBalance: number | undefined; username: string | null | undefined }) {
  const { weight, badgeName } = getVoteWeight(badgeBalance, username);
  const badgeImageUrl = getBadgeUrl(badgeBalance, username);
  const [showTiers, setShowTiers] = useState(false);

  return (
    <div className="bg-zinc-800/50 rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {badgeImageUrl && <img src={badgeImageUrl} alt={badgeName || ''} className="w-5 h-5" />}
          <span className="text-zinc-300 text-xs font-medium">
            {weight > 0 ? (
              <>Your vote weight: <span className="text-white font-bold">{weight}×</span> ({badgeName})</>
            ) : (
              <span className="text-zinc-500">Hold DHB tokens to vote</span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowTiers(!showTiers)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
      
      <AnimatePresence>
        {showTiers && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-1">
              {Object.entries(BADGE_VOTE_WEIGHT).map(([name, w]) => (
                <div key={name} className={`flex items-center justify-between px-2 py-1 rounded-lg text-[10px] ${
                  name === badgeName ? 'bg-white/10 text-white' : 'text-zinc-500'
                }`}>
                  <span>{name}</span>
                  <span className="font-bold">{w}×</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────
export default function GovernancePage() {
  const { isAuthenticated, openLoginModal, user } = useAuth();
  const [activeTab, setActiveTab] = useState<PageTab>('proposals');
  const [sort, setSort] = useState<GovernanceSort>('most_voted');
  const { layerRef: sortLayerRef, setRef: setSortRef, rect: sortRect, onScroll: onSortScroll } = useTabIndicator(sort);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: proposalsData, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useGovernanceProposals(sort, search);
  const proposals = useMemo(() => proposalsData?.pages.flat() ?? [], [proposalsData]);
  const { data: completedProposals, isLoading: isLoadingCompleted } = useCompletedProposals();
  const { data: userVotes } = useGovernanceUserVotes();
  const voteMutation = useVoteGovernanceProposal();

  // Get user's badge balance for vote weight calculation
  const userBadgeBalance = user?.badgeBalance as number | undefined;
  const username = user?.username;

  const handleVote = useCallback(
    (proposalId: string, voteType: 1 | -1, currentVote: number | undefined) => {
      if (!isAuthenticated) {
        openLoginModal();
        return;
      }
      const { weight, badgeName } = getVoteWeight(userBadgeBalance, username);
      if (weight === 0) {
        toast.error('You must hold DHB tokens to vote on governance proposals.');
        return;
      }
      voteMutation.mutate({ proposalId, voteType, currentVote, voteWeight: weight, badgeName });
    },
    [isAuthenticated, openLoginModal, voteMutation, userBadgeBalance, username]
  );

  const handleSubmitClick = () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setDrawerOpen(true);
  };

  const { data: totalCount = proposals.length } = useTotalGovernanceCount();
  const passedProposals = useMemo(() => (completedProposals ?? []).filter(p => p.status === 'passed' || (p.status === 'completed' && p.like_count > p.dislike_count)), [completedProposals]);
  const rejectedProposals = useMemo(() => (completedProposals ?? []).filter(p => p.status === 'rejected' || (p.status === 'completed' && p.like_count <= p.dislike_count)), [completedProposals]);
  const passedCount = passedProposals.length;
  const rejectedCount = rejectedProposals.length;

  return (
    <div className="min-h-screen px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Governance</h1>
              <p className="text-zinc-500 text-sm">{totalCount} {totalCount === 1 ? 'proposal' : 'proposals'} submitted</p>
            </div>
          </div>
          <Button
            onClick={handleSubmitClick}
            variant="glass"
            className="rounded-xl font-semibold text-sm"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Propose</span>
          </Button>
        </div>

        {/* Vote weight info */}
        {isAuthenticated && (
          <VoteWeightInfo badgeBalance={userBadgeBalance} username={username} />
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search proposals..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>

        {/* Page Tabs */}
        <div className="relative flex gap-1 bg-zinc-800/40 rounded-xl p-1 mb-3">
          <div
            className={`absolute top-1 bottom-1 w-[calc(33.333%-3px)] rounded-lg bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-300 ease-out ${
              activeTab === 'passed' ? 'translate-x-[calc(100%+2px)]' : activeTab === 'rejected' ? 'translate-x-[calc(200%+4px)]' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            onClick={() => setActiveTab('proposals')}
            className={`relative z-10 flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-300 ${
              activeTab === 'proposals' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Proposals
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('passed')}
            className={`relative z-10 flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-300 flex items-center justify-center gap-1.5 ${
              activeTab === 'passed' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Passed
            {passedCount > 0 && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-md font-semibold">
                {passedCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rejected')}
            className={`relative z-10 flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-300 flex items-center justify-center gap-1.5 ${
              activeTab === 'rejected' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            Rejected
            {rejectedCount > 0 && (
              <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-md font-semibold">
                {rejectedCount}
              </span>
            )}
          </button>
        </div>

        {/* Sort (only on proposals tab) */}
        {activeTab === 'proposals' && (
          <div ref={sortLayerRef} className="relative" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
            <GlassIndicator rect={sortRect} borderRadius="0.5rem" />
            <div className="relative z-20 flex gap-1.5 overflow-x-auto scrollbar-invisible" onScroll={onSortScroll}>
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  ref={setSortRef(s.id)}
                  type="button"
                  onClick={() => setSort(s.id)}
                  className={`relative z-40 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    sort === s.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <span className="relative z-10">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Proposals Tab */}
      {activeTab === 'proposals' && (
        <>
          {isLoading ? (
            <GovernanceSkeletons />
          ) : proposals.length > 0 ? (
            <div className="space-y-3">
              {proposals.map((proposal) => (
                <GovernanceCard
                  key={proposal.id}
                  proposal={proposal}
                  currentVote={userVotes?.[proposal.id]}
                  onVote={handleVote}
                  voteDisabled={voteMutation.isPending}
                  userBadgeBalance={userBadgeBalance}
                  username={username}
                />
              ))}
              {hasNextPage && (
                <InfiniteScrollSentinel
                  onIntersect={fetchNextPage}
                  isFetching={isFetchingNextPage}
                />
              )}
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-white font-semibold mb-1">No proposals yet</h3>
              <p className="text-zinc-500 text-sm mb-4">Be the first to submit a governance proposal</p>
              <Button
                onClick={handleSubmitClick}
                variant="glass"
                className="rounded-xl font-semibold"
              >
                <Plus className="w-4 h-4" />
                Submit Proposal
              </Button>
            </div>
          )}
        </>
      )}

      {/* Passed Tab */}
      {activeTab === 'passed' && (
        <>
          {isLoadingCompleted ? (
            <GovernanceSkeletons />
          ) : passedProposals.length > 0 ? (
            <div className="space-y-3">
              {passedProposals.map((proposal) => (
                <CompletedCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-white font-semibold mb-1">No passed proposals yet</h3>
              <p className="text-zinc-500 text-sm">Passed proposals will appear here</p>
            </div>
          )}
        </>
      )}

      {/* Rejected Tab */}
      {activeTab === 'rejected' && (
        <>
          {isLoadingCompleted ? (
            <GovernanceSkeletons />
          ) : rejectedProposals.length > 0 ? (
            <div className="space-y-3">
              {rejectedProposals.map((proposal) => (
                <CompletedCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-white font-semibold mb-1">No rejected proposals yet</h3>
              <p className="text-zinc-500 text-sm">Rejected proposals will appear here</p>
            </div>
          )}
        </>
      )}

      {/* Submit Drawer */}
      <SubmitProposalDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
