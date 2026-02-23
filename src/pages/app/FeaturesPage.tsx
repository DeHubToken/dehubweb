/**
 * Feature Requests Page
 * =====================
 * Community-driven feature request board.
 * Users can submit ideas and vote on existing ones.
 * Feature cards use the same UI pattern as text posts (ActionBar + CommentsWrapper).
 */

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, X, Loader2, Sparkles, CheckCircle2, MessageCircle, Send, Trash2 } from 'lucide-react';
import featuresLightbulb from '@/assets/features-lightbulb.png';
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
import { supabase } from '@/integrations/supabase/client';
import {
  useFeatureRequests,
  useShippedFeatures,
  useUserVotes,
  useSubmitFeatureRequest,
  useVoteFeatureRequest,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type FeatureCategory,
  type FeatureSort,
  type FeatureRequest,
  type FeatureStatus,
} from '@/hooks/use-feature-requests';
import { z } from 'zod';
import { useFeatureRequestComments, useSubmitComment, useDeleteComment } from '@/hooks/use-feature-request-comments';

const featureSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100, 'Title must be under 100 characters'),
  description: z.string().trim().min(1, 'Description is required').max(1000, 'Description must be under 1,000 characters'),
  category: z.enum(['ui_ux', 'performance', 'new_feature', 'bug_fix', 'integration', 'other']),
});

const CATEGORIES: { id: FeatureCategory | 'all'; labelKey: string }[] = [
  { id: 'all', labelKey: 'features.all' },
  { id: 'ui_ux', labelKey: 'features.uiUx' },
  { id: 'performance', labelKey: 'features.performance' },
  { id: 'new_feature', labelKey: 'features.newFeature' },
  { id: 'bug_fix', labelKey: 'features.bugFix' },
  { id: 'integration', labelKey: 'features.integration' },
  { id: 'other', labelKey: 'features.other' },
];

type PageTab = 'requests' | 'shipped';

const SORTS: { id: FeatureSort; labelKey: string }[] = [
  { id: 'most_voted', labelKey: 'features.mostVoted' },
  { id: 'newest', labelKey: 'features.newest' },
];

const STATUS_COLORS: Record<FeatureStatus, string> = {
  open: 'text-zinc-300',
  under_review: 'text-amber-400',
  planned: 'text-blue-400',
  in_progress: 'text-purple-400',
  completed: 'text-emerald-400',
  declined: 'text-red-400',
};

const STATUS_I18N_KEYS: Record<FeatureStatus, string> = {
  open: 'features.statusOpen',
  under_review: 'features.statusUnderReview',
  planned: 'features.statusPlanned',
  in_progress: 'features.statusInProgress',
  completed: 'features.statusCompleted',
  declined: 'features.statusDeclined',
};

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
// Feature Card Component (PostCard-style UI)
// ──────────────────────────────────────────────────
function FeatureCard({
  feature,
  currentVote,
  onVote,
  voteDisabled,
}: {
  feature: FeatureRequest;
  currentVote: number | undefined;
  onVote: (featureId: string, voteType: 1 | -1, currentVote: number | undefined) => void;
  voteDisabled: boolean;
}) {
  const { t } = useTranslation();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();

  const { data: comments, isLoading: commentsLoading } = useFeatureRequestComments(showComments ? feature.id : null);
  const submitComment = useSubmitComment();
  const deleteComment = useDeleteComment();

  // Known avatar overrides for non-wallet identifiers (username-based accounts)
  const KNOWN_AVATAR_ADDRESSES: Record<string, string> = {
    maldoteth: '0x9324840523a5d17dd12a2f11a9472e5a199c1937',
  };

  const resolvedAddress = KNOWN_AVATAR_ADDRESSES[feature.author_wallet_address.toLowerCase()] || feature.author_wallet_address;
  const storedAvatarUrl = feature.author_avatar
    ? buildAvatarUrl(resolvedAddress, feature.author_avatar)
    : null;
  const dynamicAvatarUrl = useProfileAvatar(resolvedAddress, storedAvatarUrl || undefined);
  const avatarUrl = dynamicAvatarUrl || storedAvatarUrl;

  const displayName = feature.author_username || feature.author_wallet_address.slice(0, 6);
  const handle = feature.author_username || `${feature.author_wallet_address.slice(0, 6)}...${feature.author_wallet_address.slice(-4)}`;

  // Determine like/dislike state from currentVote
  const isLiked = currentVote === 1;
  const isDisliked = currentVote === -1;

  const handleLike = useCallback(() => {
    onVote(feature.id, 1, currentVote);
  }, [feature.id, currentVote, onVote]);

  const handleDislike = useCallback(() => {
    onVote(feature.id, -1, currentVote);
  }, [feature.id, currentVote, onVote]);

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) { openLoginModal(); return; }
    if (!commentText.trim()) return;
    submitComment.mutate(
      { featureRequestId: feature.id, content: commentText },
      { onSuccess: () => setCommentText('') }
    );
  };

  return (
    <div className="overflow-hidden relative">
      {/* Header - PostCard style */}
      <CardHeader
        username={displayName}
        handle={handle}
        avatarSeed={avatarUrl || feature.author_wallet_address}
        verified={false}
        contentType="post"
        creatorId={feature.author_wallet_address}
        creatorUsername={feature.author_username || undefined}
        timestamp={formatTimeAgo(feature.created_at)}
      />

      {/* Status badge - top right, liquid glass style */}
      <div className="absolute top-0 right-0 z-10">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap bg-gradient-to-br from-white/15 via-white/8 to-white/3 backdrop-blur-xl border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.3)] ${STATUS_COLORS[feature.status]}`}>
          {t(STATUS_I18N_KEYS[feature.status])}
        </span>
      </div>

      {/* Content */}
      <div className="pt-1 space-y-2">
        <TranslatableText text={feature.title} className="text-white font-semibold text-sm leading-tight" as="h3" hideControls />
        <TranslatableText text={feature.description} className="text-zinc-400 text-sm leading-relaxed" as="p" />

        {/* Category badge - liquid glass style */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-300 text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gradient-to-br from-white/15 via-white/8 to-white/3 backdrop-blur-xl border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.3)]">
            {CATEGORY_LABELS[feature.category]}
          </span>
        </div>

        {/* Action Bar - same as PostCard */}
        <div className="pt-1">
          <ActionBar
            postId={feature.id}
            className="p-0"
            onComment={() => setShowComments(prev => !prev)}
            onLike={handleLike}
            onDislike={handleDislike}
            isLiked={isLiked}
            isDisliked={isDisliked}
            likeCount={feature.like_count ?? 0}
            dislikeCount={feature.dislike_count ?? 0}
            commentCount={feature.comment_count}
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
                                  onClick={() => deleteComment.mutate({ commentId: comment.id, featureRequestId: feature.id })}
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
                  <p className="text-zinc-600 text-xs text-center py-2 mb-2">{t('features.noComments')}</p>
                )}

                {/* Comment input */}
                <form onSubmit={handleSubmitComment} className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={t('features.addComment')}
                    maxLength={500}
                    className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 rounded-xl text-xs h-8"
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
// Submit Feature Drawer
// ──────────────────────────────────────────────────
function SubmitFeatureDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<FeatureCategory>('new_feature');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitMutation = useSubmitFeatureRequest();

  const handleSubmit = () => {
    const result = featureSchema.safeParse({ title, description, category });
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
      { title: result.data.title, description: result.data.description, category: result.data.category as FeatureCategory },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setCategory('new_feature');
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] border-white/10 max-h-[85vh]">
        <DrawerHeader className="relative">
          <DrawerTitle className="text-white text-lg font-bold">{t('features.submitDrawerTitle')}</DrawerTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4">
          {/* Title */}
          <div>
            <label className="text-zinc-400 text-xs font-medium mb-1 block">{t('features.titleLabel')}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('features.titlePlaceholder')}
              maxLength={100}
              className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 rounded-xl"
            />
            <div className="flex justify-between mt-1">
              {errors.title && <span className="text-red-400 text-[11px]">{errors.title}</span>}
              <span className="text-zinc-600 text-[11px] ml-auto">{title.length}/100</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-zinc-400 text-xs font-medium mb-1 block">{t('features.descriptionLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('features.descriptionPlaceholder')}
              maxLength={1000}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
            />
            <div className="flex justify-between mt-1">
              {errors.description && <span className="text-red-400 text-[11px]">{errors.description}</span>}
              <span className="text-zinc-600 text-[11px] ml-auto">{description.length}/1000</span>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-zinc-400 text-xs font-medium mb-2 block">{t('features.categoryLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id as FeatureCategory)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                    category === cat.id
                      ? 'bg-white text-black'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {t(cat.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
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
                <Sparkles className="w-4 h-4" />
                {t('features.submitRequest')}
              </>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ──────────────────────────────────────────────────
// Skeleton Loader
// ──────────────────────────────────────────────────
function FeatureSkeletons() {
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
// Shipped Feature Card (simpler, no voting)
// ──────────────────────────────────────────────────
function ShippedCard({ feature }: { feature: FeatureRequest }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-zinc-900 rounded-2xl p-4 flex gap-3 cursor-pointer hover:bg-zinc-800/70 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex flex-col items-center justify-center min-w-[40px]">
        <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1.5">
          <TranslatableText text={feature.title} className="text-white font-semibold text-sm leading-tight flex-1 min-w-0" as="h3" hideControls />
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0 bg-emerald-900/40 text-emerald-400">
            {t('features.shippedBadge')}
          </span>
        </div>

        <TranslatableText text={feature.description} className={`text-zinc-400 text-xs leading-relaxed mb-2 ${expanded ? '' : 'line-clamp-2'}`} as="p" />

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-lg text-[10px] font-medium">
            {CATEGORY_LABELS[feature.category]}
          </span>
          <span className="text-zinc-700 text-[11px]">·</span>
          <span className="text-zinc-500 text-[11px]">{formatTimeAgo(feature.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────
export default function FeaturesPage() {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [activeTab, setActiveTab] = useState<PageTab>('requests');
  const [sort, setSort] = useState<FeatureSort>('most_voted');
  const [category, setCategory] = useState<FeatureCategory | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: features, isLoading } = useFeatureRequests(sort, category, search);
  const { data: shippedFeatures, isLoading: isLoadingShipped } = useShippedFeatures();
  const { data: userVotes } = useUserVotes();
  const voteMutation = useVoteFeatureRequest();

  const handleVote = useCallback(
    (featureId: string, voteType: 1 | -1, currentVote: number | undefined) => {
      if (!isAuthenticated) {
        openLoginModal();
        return;
      }
      voteMutation.mutate({ featureRequestId: featureId, voteType, currentVote });
    },
    [isAuthenticated, openLoginModal, voteMutation]
  );

  const handleSubmitClick = () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setDrawerOpen(true);
  };

  const totalCount = features?.length ?? 0;
  const shippedCount = shippedFeatures?.length ?? 0;

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <img src={featuresLightbulb} alt="Features" className="w-12 h-12 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-white">{t('features.title')}</h1>
              <p className="text-zinc-500 text-sm">{totalCount === 1 ? t('features.ideaSubmitted') : t('features.ideasSubmitted', { count: totalCount })}</p>
            </div>
          </div>
          <Button
            onClick={handleSubmitClick}
            variant="glass"
            className="rounded-xl font-semibold text-sm"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('features.submit')}</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder={t('features.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>

        {/* Page Tabs: Requests / Shipped */}
        <div className="relative flex gap-1 bg-zinc-800/40 rounded-xl p-1 mb-3">
          {/* Sliding liquid glass indicator */}
          <div
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-300 ease-out ${
              activeTab === 'shipped' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`relative z-10 flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-300 ${
              activeTab === 'requests' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t('features.requests')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shipped')}
            className={`relative z-10 flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-300 flex items-center justify-center gap-1.5 ${
              activeTab === 'shipped' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('features.shipped')}
            {shippedCount > 0 && (
              <span className="text-[10px] bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded-md font-semibold">
                {shippedCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters (only shown on requests tab) */}
        {activeTab === 'requests' && (
          <>
            {/* Category Pills */}
            <div className="relative mb-3">
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
              <div className="flex gap-2 overflow-x-auto scrollbar-invisible pb-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`relative px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
                      category === cat.id
                        ? 'text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {category === cat.id && (
                      <motion.div
                        layoutId="category-pill"
                        className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4)]"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{t(cat.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Tabs */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-invisible">
              {SORTS.map((s) => {
                const isActive = sort === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSort(s.id)}
                    className={`relative px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="features-sort"
                        className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{t(s.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Feature List (Requests Tab) */}
      {activeTab === 'requests' && (
        <>
          {isLoading ? (
            <FeatureSkeletons />
          ) : features && features.length > 0 ? (
            <div className="space-y-3">
              {features.map((feature) => (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  currentVote={userVotes?.[feature.id]}
                  onVote={handleVote}
                  voteDisabled={voteMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <img src={featuresLightbulb} alt="No features yet" className="w-16 h-16 object-contain opacity-40" />
              </div>
              <h3 className="text-white font-semibold mb-1">{t('features.noRequestsYet')}</h3>
              <p className="text-zinc-500 text-sm mb-4">{t('features.beFirstIdea')}</p>
              <Button
                onClick={handleSubmitClick}
                variant="glass"
                className="rounded-xl font-semibold"
              >
                <Plus className="w-4 h-4" />
                {t('features.submitFeatureRequest')}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Shipped Features Tab */}
      {activeTab === 'shipped' && (
        <>
          {isLoadingShipped ? (
            <FeatureSkeletons />
          ) : shippedFeatures && shippedFeatures.length > 0 ? (
            <div className="space-y-3">
              {shippedFeatures.map((feature) => (
                <ShippedCard key={feature.id} feature={feature} />
              ))}
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-white font-semibold mb-1">{t('features.noShippedYet')}</h3>
              <p className="text-zinc-500 text-sm">{t('features.shippedAppearHere')}</p>
            </div>
          )}
        </>
      )}

      {/* Submit Drawer */}
      <SubmitFeatureDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
