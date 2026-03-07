/**
 * Governance Page
 * ===============
 * Token-holder governance board with weighted voting based on badge tier.
 * Mirrors the Feature Requests UI pattern but without categories.
 */

import governanceShieldIcon from '@/assets/governance-shield.png';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { Search, Plus, X, Loader2, Sparkles, CheckCircle2, MessageCircle, Send, Trash2, ShieldCheck, Info, Languages, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { TranslatableText, SharedTranslationProvider, useSharedTranslationControl } from '@/components/app/TranslatableText';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { UserAvatar } from '@/components/app/UserAvatar';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { ActionBar } from '@/components/app/cards/ActionBar';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl } from '@/lib/media-url';
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

type PageTab = 'proposals' | 'passed' | 'rejected';

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
  const { t } = useTranslation();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const commentInputRef = useRef<HTMLInputElement>(null);
  const commentSectionRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();
  const navigate = useNavigate();

  const mention = useMention({
    inputRef: commentInputRef,
    onMentionInsert: (_user, newText) => setCommentText(newText.slice(0, 500)),
  });

  const { data: comments, isLoading: commentsLoading } = useGovernanceComments(showComments ? proposal.id : null);
  const submitComment = useSubmitGovernanceComment();
  const deleteComment = useDeleteGovernanceComment();

  const KNOWN_AVATAR_ADDRESSES: Record<string, string> = {
    '0xmaldoteth': '0x9324840523a5d17dd12a2f11a9472e5a199c1937',
    maldoteth: '0x9324840523a5d17dd12a2f11a9472e5a199c1937',
  };

  const KNOWN_DISPLAY_NAMES: Record<string, string> = {
    maldoteth: 'mal',
  };

  const resolvedAddress = KNOWN_AVATAR_ADDRESSES[proposal.author_wallet_address.toLowerCase()] || proposal.author_wallet_address;
  const avatarUrl = proposal.author_avatar
    ? buildAvatarUrl(resolvedAddress, proposal.author_avatar)
    : null;

  const username_raw = proposal.author_username || '';
  const displayName = KNOWN_DISPLAY_NAMES[username_raw.toLowerCase()] || username_raw || proposal.author_wallet_address.slice(0, 6);
  const handle = username_raw ? `@${username_raw}` : `${proposal.author_wallet_address.slice(0, 6)}...${proposal.author_wallet_address.slice(-4)}`;

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
    <div
      className="overflow-visible relative rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3 cursor-pointer hover:bg-white/[0.05] transition-colors"
      onClick={() => navigate(`/app/governance/${proposal.id}`)}
    >
      <div className="flex items-start justify-between">
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

      <SharedTranslationProvider>
        <div className="pt-1 space-y-2">
          <TranslatableText text={proposal.title} className="text-white font-semibold text-sm leading-tight" as="h3" hideControls />
          <TranslatableText text={proposal.description} className="text-zinc-400 text-sm leading-relaxed" as="p" hideControls />
          <ProposalTranslateButton />

        {/* Vote ratio bar */}
        {(() => {
          const total = (proposal.like_count ?? 0) + (proposal.dislike_count ?? 0);
          const forPct = total > 0 ? Math.round(((proposal.like_count ?? 0) / total) * 100) : 50;
          const againstPct = 100 - forPct;
          return (
            <div className="space-y-1">
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
          );
        })()}

        <div onClick={(e) => e.stopPropagation()}>
          <ProposalTranslateButton />
        </div>

        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
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
            voteWeight={userWeight}
          />
        </div>

        {/* Comments Section */}
        {(() => {
          const commentsContent = (
            <div className="border-t border-white/5 pt-3 mt-1" onClick={(e) => e.stopPropagation()}>
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
                <p className="text-zinc-600 text-xs text-center py-2 mb-2">{t('governance.noCommentsYet')}</p>
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
          );

          if (isMobile) {
            return (
              <Drawer open={showComments} onOpenChange={setShowComments}>
                <DrawerContent className="bg-black/60 backdrop-blur-[24px] border-white/10 px-4 pb-6 max-h-[70vh]">
                  <DrawerHeader className="px-0 pt-2 pb-0">
                    <DrawerTitle className="text-white text-sm">{t('governance.comments', 'Comments')}</DrawerTitle>
                  </DrawerHeader>
                  {commentsContent}
                </DrawerContent>
              </Drawer>
            );
          }

          return (
            <AnimatePresence>
              {showComments && (
                <motion.div
                  ref={commentSectionRef}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                  onAnimationComplete={() => {
                    commentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                >
                  {commentsContent}
                </motion.div>
              )}
            </AnimatePresence>
          );
        })()}
        </div>
      </SharedTranslationProvider>
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
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitMutation = useSubmitGovernanceProposal();

  const proposalSchema = useMemo(() => z.object({
    title: z.string().trim().min(1, t('governance.titleRequired')).max(100, t('governance.titleMaxLength')),
    description: z.string().trim().min(1, t('governance.descriptionRequired')).max(1000, t('governance.descriptionMaxLength')),
  }), [t]);

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
          <DrawerTitle className="text-white text-lg font-bold">{t('governance.submitProposal')}</DrawerTitle>
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
            <label className="text-zinc-400 text-xs font-medium mb-1 block">{t('governance.titleLabel')}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('governance.titlePlaceholder')}
              maxLength={100}
              className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 rounded-xl"
            />
            <div className="flex justify-between mt-1">
              {errors.title && <span className="text-red-400 text-[11px]">{errors.title}</span>}
              <span className="text-zinc-600 text-[11px] ml-auto">{title.length}/100</span>
            </div>
          </div>

          <div>
            <label className="text-zinc-400 text-xs font-medium mb-1 block">{t('governance.descriptionLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('governance.descriptionPlaceholder')}
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
                {t('governance.submitProposalBtn')}
              </>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ──────────────────────────────────────────────────
// Inline translate button for proposal cards
// ──────────────────────────────────────────────────
function ProposalTranslateButton() {
  const { isTranslated, handleTranslate, handleShowOriginal } = useSharedTranslationControl();

  return (
    <button
      onClick={(e) => { e.stopPropagation(); isTranslated ? handleShowOriginal() : handleTranslate(); }}
      className="flex items-center gap-1 text-zinc-500 hover:text-white transition-colors text-[11px]"
    >
      {isTranslated ? <RotateCcw className="w-3 h-3" /> : <Languages className="w-3.5 h-3.5" />}
      <span>{isTranslated ? 'Original' : 'Translate'}</span>
    </button>
  );
}

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const isPassed = proposal.status === 'passed' || (proposal.status === 'completed' && proposal.like_count > proposal.dislike_count);

  return (
    <div
      className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3 flex gap-3 cursor-pointer hover:bg-white/[0.05] transition-colors"
      onClick={() => navigate(`/app/governance/${proposal.id}`)}
    >
      <div className="flex flex-col items-center justify-center min-w-[40px]">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPassed ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
          {isPassed
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            : <X className="w-4 h-4 text-red-400" />
          }
        </div>
      </div>

      <SharedTranslationProvider>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1.5">
            <TranslatableText text={proposal.title} className="text-white font-semibold text-sm leading-tight flex-1 min-w-0" as="h3" hideControls />
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0 ${
              isPassed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            }`}>
              {isPassed ? t('governance.passed') : t('governance.rejected')}
            </span>
          </div>

          <TranslatableText text={proposal.description} className={`text-zinc-400 text-xs leading-relaxed mb-2 ${expanded ? '' : 'line-clamp-2'}`} as="p" hideControls />

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-500 text-[11px]">{formatTimeAgo(proposal.updated_at, t)}</span>
            <span className="text-zinc-700 text-[11px]">·</span>
            <span className="text-zinc-500 text-[11px]">{t('governance.weightedVotesFor', { count: proposal.like_count })}</span>
            <span className="text-zinc-700 text-[11px]">·</span>
            <ProposalTranslateButton />
          </div>
        </div>
      </SharedTranslationProvider>
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
  const { t } = useTranslation();
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
              <>{t('governance.yourVoteWeight')} <span className="text-white font-bold">{weight}×</span> ({badgeName})</>
            ) : (
              <span className="text-zinc-500">{t('governance.holdTokensToVote')}</span>
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
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal, user } = useAuth();
  const [activeTab, setActiveTab] = useState<PageTab>('proposals');
  const [sort, setSort] = useState<GovernanceSort>('most_voted');
  const { layerRef: tabLayerRef, setRef: setTabRef, rect: tabRect, onScroll: onTabScroll } = useTabIndicator(activeTab);
  const { layerRef: sortLayerRef, setRef: setSortRef, rect: sortRect, onScroll: onSortScroll } = useTabIndicator(sort);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const SORTS: { id: GovernanceSort; label: string }[] = useMemo(() => [
    { id: 'most_voted', label: t('governance.mostVoted') },
    { id: 'newest', label: t('governance.newest') },
  ], [t]);

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
      console.warn('[GovernancePage] vote attempt', { userBadgeBalance, username, userObj: user });
      const { weight, badgeName } = getVoteWeight(userBadgeBalance, username);
      if (weight === 0) {
        console.warn('[GovernancePage] vote blocked — weight=0', { userBadgeBalance, username, weight, badgeName });
        toast.error(t('governance.mustHoldTokens'));
        return;
      }
      voteMutation.mutate({ proposalId, voteType, currentVote, voteWeight: weight, badgeName });
    },
    [isAuthenticated, openLoginModal, voteMutation, userBadgeBalance, username, t]
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
            <img src={governanceShieldIcon} alt="Governance" className="w-12 h-12 object-contain brightness-75" />
            <div>
              <h1 className="text-xl font-bold text-white">{t('governance.title')}</h1>
              <p className="text-zinc-500 text-sm">{t('governance.proposalCount', { count: totalCount })}</p>
            </div>
          </div>
          <Button
            onClick={handleSubmitClick}
            variant="glass"
            className="rounded-xl font-semibold text-sm"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('governance.propose')}</span>
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
            placeholder={t('governance.searchProposals')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>

        {/* Page Tabs */}
        <div ref={tabLayerRef} className="relative mb-3" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
          <GlassIndicator rect={tabRect} borderRadius="0.5rem" />
          <div className="relative z-20 flex gap-1" onScroll={onTabScroll}>
            <button
              type="button"
              ref={setTabRef('proposals')}
              onClick={() => setActiveTab('proposals')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                activeTab === 'proposals' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t('governance.proposals')}
            </button>
            <button
              type="button"
              ref={setTabRef('passed')}
              onClick={() => setActiveTab('passed')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center justify-center gap-1.5 ${
                activeTab === 'passed' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('governance.passed')}
              {passedCount > 0 && (
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-md font-semibold">{passedCount}</span>
              )}
            </button>
            <button
              type="button"
              ref={setTabRef('rejected')}
              onClick={() => setActiveTab('rejected')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center justify-center gap-1.5 ${
                activeTab === 'rejected' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <X className="w-3.5 h-3.5" />
              {t('governance.rejected')}
              {rejectedCount > 0 && (
                <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-md font-semibold">{rejectedCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* Sort */}
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
                  currentVote={userVotes?.[proposal.id]?.type}
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
              <h3 className="text-white font-semibold mb-1">{t('governance.noProposalsYet')}</h3>
              <p className="text-zinc-500 text-sm mb-4">{t('governance.beFirstToSubmit')}</p>
              <Button
                onClick={handleSubmitClick}
                variant="glass"
                className="rounded-xl font-semibold"
              >
                <Plus className="w-4 h-4" />
                {t('governance.submitProposalBtn')}
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
              <h3 className="text-white font-semibold mb-1">{t('governance.noPassedYet')}</h3>
              <p className="text-zinc-500 text-sm">{t('governance.passedAppearHere')}</p>
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
              <h3 className="text-white font-semibold mb-1">{t('governance.noRejectedYet')}</h3>
              <p className="text-zinc-500 text-sm">{t('governance.rejectedAppearHere')}</p>
            </div>
          )}
        </>
      )}

      {/* Submit Drawer */}
      <SubmitProposalDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
