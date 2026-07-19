/**
 * Post Card Component
 * ===================
 * Displays text-based post content with universal styling.
 * 
 * @example
 * ```tsx
 * <PostCard post={postData} />
 * ```
 */

import { useState, memo, useEffect, useCallback, useRef } from 'react';
import { useAutoOpenComments } from '@/hooks/use-auto-open-comments';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, MoreVertical, Link2, Flag, Ban, MessageSquare, Eye, EyeOff, Globe, Info, Trash2, Repeat2, UserPlus, UserCheck, BarChart2, Plus, X, Bookmark, Pin, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsWrapper } from './CommentsWrapper';
import { PostMetadata } from './PostMetadata';
import { QuotedPostEmbed } from './QuotedPostEmbed';
import { FeedLinkPreviews } from './FeedLinkPreviews';
import { CommunityLinkEmbed, extractCommunitySlug, hasCommunityLink, stripCommunityLinks } from '@/components/app/communities/CommunityLinkEmbed';
import { StoreLinkEmbed, extractStoreLinkInfo, hasStoreLink } from '@/components/app/stores/StoreLinkEmbed';
import { TranslatableText, useTranslation, renderTextWithLinks } from '../TranslatableText';
import { useTranslation as useI18n } from 'react-i18next';
import { PostAIChat } from './PostAIChat';
import { buildPostShareImage } from '@/lib/build-post-share-image';
import { ReportModal } from '../modals/ReportModal';
import { DeletePostModal } from '../modals/DeletePostModal';
import { EditPostModal } from '../modals/EditPostModal';
import { applyOptimisticEdit } from '@/lib/optimistic-edit';
import { QuotePostModal } from '../modals/QuotePostModal';
import { TipModal } from '../modals/TipModal';
import { useFeedViewTracking } from '@/hooks/use-view-tracking';
import { usePostTipCount } from '@/hooks/use-post-tip-count';
import { useAuth } from '@/contexts/AuthContext';
import { updateTokenVisibility, repostPost, isFollowing as checkIsFollowing, type TokenVisibility } from '@/lib/api/dehub';
import { useFollow } from '@/hooks/use-follow';
import { cacheTextPostForNavigation } from '@/lib/post-cache';
import { useCreatePoll } from '@/hooks/use-polls';
import { PollCard } from './PollCard';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { useTogglePin } from '@/hooks/use-pins';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  wasDrawerJustDismissed,
} from '@/components/ui/drawer';
import type { TextPost } from '@/types/feed.types';

// Use lg breakpoint (1024px) to determine if we show drawer vs inline
function useIsTabletOrMobile() {
  const [isTabletOrMobile, setIsTabletOrMobile] = useState(false);
  
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsTabletOrMobile(mql.matches);
    mql.addEventListener('change', onChange);
    setIsTabletOrMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  
  return isTabletOrMobile;
}

interface PostCardProps {
  post: TextPost;
}

export const PostCard = memo(function PostCard({ post }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentsInitialTab, setCommentsInitialTab] = useState<'replies' | 'quotes' | 'reposts' | 'search' | undefined>(undefined);
  useAutoOpenComments(setShowComments);
  const { t } = useI18n();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollExpiry, setPollExpiry] = useState('');
  const createPollMutation = useCreatePoll();
  const { data: tipCount = 0 } = usePostTipCount(post.id);
  const [visibility, setVisibility] = useState<TokenVisibility>('public');
  const isTabletOrMobile = useIsTabletOrMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();
  
  const isOwnPost = walletAddress && post.author.id?.toLowerCase() === walletAddress.toLowerCase();

  const openPostInfoPage = useCallback(() => {
    setShowOptionsDrawer(false);
    navigate(`/app/post/${post.id}/info`);
  }, [navigate, post.id]);

  // Bookmark/pin state for the mobile/tablet three-dot menu (desktop shows
  // these in the ActionBar's left-anchored utility cluster instead).
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(post.id);
  const [isPinned, setIsPinned] = useState(false);
  const togglePinMutation = useTogglePin();
  const postTokenId = parseInt(post.id, 10) || undefined;

  // Follow state for the post author — shared override wins over the lazy check
  const [isFollowingAuthor, setIsFollowingAuthor] = useState<boolean | null>(null);
  const { isFollowing: followOverride, toggleFollow } = useFollow(post.author.id);
  const effectiveFollowingAuthor = followOverride ?? isFollowingAuthor;

  // Lazy: only check follow status when options drawer opens — avoids N API calls on feed mount
  useEffect(() => {
    if (!showOptionsDrawer || !walletAddress || isOwnPost || !post.author.id || isFollowingAuthor !== null || followOverride !== undefined) return;
    let cancelled = false;
    checkIsFollowing(post.author.id).then((res) => {
      if (!cancelled) setIsFollowingAuthor(res);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [showOptionsDrawer, walletAddress, isOwnPost, post.author.id, isFollowingAuthor, followOverride]);

  const handleFollowFromMenu = useCallback(() => {
    if (!walletAddress) { openLoginModal(); return; }
    if (!post.author.id) return;
    toggleFollow(false, { name: post.author.name || post.author.handle || 'user' });
  }, [walletAddress, openLoginModal, post.author.id, post.author.name, post.author.handle, toggleFollow]);
  
  // View tracking - batches views when post is visible for 2+ seconds
  const viewRef = useFeedViewTracking(post.id);

  // Translation hook for post content
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslateLoading,
    error: translateError,
    handleTranslate,
    handleShowOriginal,
  } = useTranslation(post.content);

  // Navigate to single post page when clicking non-interactive areas
  // Pre-cache post data for instant display on the single post page
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Swallow the ghost click left behind when a bottom sheet was just dismissed
    // by tapping the scrim — otherwise that tap navigates into the post.
    if (wasDrawerJustDismissed()) return;
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], [data-no-navigate]');
    if (isInteractive) return;
    // Allow text selection without navigating
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;

    // Cache the post data before navigation for instant display
    cacheTextPostForNavigation(queryClient, post);
    navigate(`/app/post/${post.id}`, { state: { fromFeed: true } });
  }, [navigate, post.id, queryClient, post]);

  const handleRepost = useCallback(async () => {
    if (!walletAddress) { openLoginModal(); return; }
    const numericId = parseInt(post.id, 10);
    if (isNaN(numericId)) return;
    try {
      await repostPost(numericId);
      // Mark caches stale WITHOUT refetching now — refetching the unified feed
      // tears down the infinite-scroll list and snaps the user back to the top.
      // ActionBar already shows optimistic state for the (un)repost.
      queryClient.invalidateQueries({ queryKey: ['unified-feed'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['user-reposts'], refetchType: 'none' });
    } catch (err) {
      toast.error('Failed to repost');
      throw err; // let ActionBar roll back its optimistic repost state
    }
  }, [post.id, walletAddress, openLoginModal, queryClient]);

  const handleQuote = useCallback(() => {
    if (!walletAddress) { openLoginModal(); return; }
    setShowQuoteModal(true);
  }, [walletAddress, openLoginModal]);

  const handleShareAsImage = useCallback(async () => {
    try {
      const blob = await buildPostShareImage({
        authorName: post.author.name,
        authorHandle: post.author.handle,
        authorAvatarUrl: post.author.avatarSeed?.startsWith('http') ? post.author.avatarSeed : undefined,
        title: post.title,
        content: post.content,
        postId: post.id,
        likes: post.stats.likes,
      });

      const file = new File([blob], 'dehub-post.png', { type: 'image/png' });
      const postUrl = `${window.location.origin}/app/post/${post.id}`;

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: post.content?.slice(0, 100) ?? '',
          url: postUrl,
        });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'dehub-post.png';
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success('Image downloaded');
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[ShareAsImage]', err);
        toast.error('Failed to share image');
      }
    }
  }, [post.id, post.content, post.title, post.author]);

  // Build a minimal DeHubNFT for the quote modal from post data
  const postAsNFT = {
    tokenId: parseInt(post.id, 10) || 0,
    name: post.content?.slice(0, 100) || '',
    description: post.content,
    imageUrl: '',
    postType: 'image' as const,
    minter: post.author.id,
    minterUsername: post.author.handle,
    minterDisplayName: post.author.name,
    minterAvatarUrl: post.author.avatarSeed,
    createdAt: post.createdAt || '',
  };

  return (
    <div
      ref={viewRef}
      onClick={handleCardClick}
      className="overflow-visible relative cursor-pointer isolate"
    >
      <CardHeader
        username={post.author.name}
        handle={post.author.handle}
        avatarSeed={post.author.avatarSeed}
        verified={post.author.verified}
        contentType="post"
        creatorId={post.author.id}
        creatorUsername={post.author.handle}
        badgeBalance={post.author.badgeBalance}
      />

      {/* AI Button and Options Drawer - positioned in header area */}
      <div className="absolute top-0 right-0 z-10 flex items-start gap-2">
        <button
          onClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
          className="text-zinc-400 hover:text-white transition-colors active:scale-95"
          aria-label="Ask AI about this post"
        >
          <Sparkles className="w-[23.5px] h-[23.5px]" />
        </button>
        
        <Drawer open={showOptionsDrawer} onOpenChange={setShowOptionsDrawer}>
          <DrawerTrigger asChild>
            <button onClick={(e) => { if (!walletAddress) { e.preventDefault(); openLoginModal(); } }} className="text-zinc-400 hover:text-white transition-colors -mr-0.5">
              <MoreVertical className="w-[23.5px] h-[23.5px]" />
            </button>
          </DrawerTrigger>
          <DrawerContent glass className="px-4 pb-6">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-white text-lg">{t('postOptions.options')}</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-1">
              {/* Bookmark / Post info — mobile/tablet only; desktop shows these
                  anchored left in the bottom action bar instead. */}
              <button
                onClick={() => { toggleBookmark(); }}
                disabled={isBookmarkLoading}
                className={cn(
                  "lg:hidden flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-50",
                  isBookmarked ? "text-yellow-500" : "text-white"
                )}
              >
                <Bookmark className={cn("w-5 h-5", isBookmarked && "fill-current")} />
                {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              </button>
              <button
                onClick={openPostInfoPage}
                className="lg:hidden flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Info className="w-5 h-5" /> Post info
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Flag className="w-5 h-5" /> {t('postOptions.report')}
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/app/post/${post.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success(t('postOptions.postUrlCopied'));
                }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Link2 className="w-5 h-5" /> {t('postOptions.copyPostUrl')}
              </button>
              <button
                onClick={() => {
                  setCommentsInitialTab('reposts');
                  setShowComments(true);
                }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Repeat2 className="w-5 h-5" /> See Engagements
              </button>
              {!isOwnPost && effectiveFollowingAuthor === false && (
                <button
                  onClick={handleFollowFromMenu}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <UserPlus className="w-5 h-5" />
                  Follow
                </button>
              )}
              {!isOwnPost && effectiveFollowingAuthor === true && (
                <button
                  disabled
                  className="flex items-center gap-3 px-4 py-3 text-zinc-500 rounded-xl text-left cursor-default"
                >
                  <UserCheck className="w-5 h-5" /> Following
                </button>
              )}
              <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                <Ban className="w-5 h-5" /> {t('postOptions.blockCreator')}
              </button>
              {isOwnPost && (
                <>
                  <div className="border-t border-white/10 my-1" />
                  <button
                    onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowPollCreator(true), 300); }}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <BarChart2 className="w-5 h-5" /> Create Poll
                  </button>
                  <button
                    onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowEditModal(true), 300); }}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Pencil className="w-5 h-5" /> {t('postOptions.editPost')}
                  </button>
                  <button
                    onClick={() => {
                      if (!postTokenId || togglePinMutation.isPending) return;
                      togglePinMutation.mutate(postTokenId, {
                        onSuccess: (data) => setIsPinned(data.pinned),
                      });
                    }}
                    disabled={!postTokenId || togglePinMutation.isPending}
                    className={cn(
                      "lg:hidden flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-40",
                      isPinned ? "text-blue-400" : "text-white"
                    )}
                  >
                    <Pin className={cn("w-5 h-5", isPinned && "fill-current")} />
                    {isPinned ? 'Unpin post' : 'Pin post'}
                  </button>
                  <button
                    onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowDeleteModal(true), 300); }}
                    className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Trash2 className="w-5 h-5" /> {t('postOptions.deletePost')}
                  </button>
                  <button
                    onClick={async () => {
                      const next: TokenVisibility = visibility === 'public' ? 'private' : 'public';
                      try {
                        await updateTokenVisibility(post.id, next);
                        setVisibility(next);
                        toast.success(`Post set to ${next}`);
                      } catch { toast.error('Failed to update visibility'); }
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    {visibility === 'public' ? <EyeOff className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                    {visibility === 'public' ? 'Make Private' : 'Make Public'}
                  </button>
                </>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Content */}
      <div className="pt-3 space-y-2">
        {/* Title */}
        {post.title && (
          <h3 className="text-white font-semibold text-base sm:text-lg leading-snug">{renderTextWithLinks(post.title)}</h3>
        )}
        {(() => {
          const rawDisplay = isTranslated ? translatedText : post.content;
          const displayText = rawDisplay && hasCommunityLink(rawDisplay) ? stripCommunityLinks(rawDisplay) : rawDisplay;
          return displayText?.trim() ? (
            <TranslatableText text={displayText} className="text-white/90 text-sm sm:text-base" as="p" />
          ) : null;
        })()}

        {/* Quoted post embed (Twitter-style) */}
        {post.isQuotePost && post.quotedPost && (
          <QuotedPostEmbed quotedPost={post.quotedPost} className="mt-2" />
        )}

        {/* Community link embed */}
        {post.content && hasCommunityLink(post.content) && (() => {
          const slug = extractCommunitySlug(post.content);
          return slug ? <CommunityLinkEmbed slug={slug} /> : null;
        })()}

        {/* Store / listing link embed */}
        {post.content && hasStoreLink(post.content) && (() => {
          const info = extractStoreLinkInfo(post.content);
          return info ? <StoreLinkEmbed storeId={info.storeId} listingId={info.listingId} /> : null;
        })()}

        {/* Link previews for URLs in content (skip if community/store link is shown) */}
        {post.content && !hasCommunityLink(post.content) && !hasStoreLink(post.content) && <FeedLinkPreviews text={post.content} />}

        {/* Metadata: timestamp and views */}
        <PostMetadata
          timestamp={post.createdAt}
          viewCount={post.views}
          translateControl={{
            isTranslated,
            isLoading: isTranslateLoading,
            error: translateError,
            onTranslate: handleTranslate,
            onShowOriginal: handleShowOriginal,
          }}
        />

        {parseInt(post.id, 10) > 0 && <PollCard tokenId={parseInt(post.id, 10)} />}

        <div className="pt-1">
          <ActionBar
            postId={post.id}
            tokenId={parseInt(post.id, 10) || undefined}
            isOwnPost={!!isOwnPost}
            utilityDesktopAnchor
            className="p-0"
            onComment={() => {
              setCommentsInitialTab(undefined);
              setShowComments(prev => !prev);
            }}
            onRepost={handleRepost}
            onQuote={handleQuote}
            onShareAsImage={handleShareAsImage}
            isLiked={post.isLiked}
            isDisliked={post.isDisliked}
            likeCount={post.stats.likes}
            commentCount={post.stats.comments}
            repostCount={post.stats.reposts}
            isReposted={post.isReposted}
            isOptimistic={post.isOptimistic}
            tipCount={tipCount}
            onTip={() => setShowTipModal(true)}
            onSeeEngagements={() => {
              setCommentsInitialTab('reposts');
              setShowComments(true);
            }}
          />
        </div>

        {/* Comments */}
        <CommentsWrapper
          open={showComments}
          onOpenChange={setShowComments}
          tokenId={post.id}
          initialTab={commentsInitialTab}
        />
      </div>

      {/* Poll Creator Drawer */}
      <Drawer open={showPollCreator} onOpenChange={setShowPollCreator}>
        <DrawerContent glass className="px-4 pb-8" data-no-navigate onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-white text-lg">Create Poll</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-3 mt-1">
            <input
              className="w-full bg-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="Ask a question…"
              value={pollQuestion}
              onChange={e => setPollQuestion(e.target.value)}
              maxLength={200}
            />
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="flex-1 bg-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    onChange={e => {
                      const next = [...pollOptions];
                      next[i] = e.target.value;
                      setPollOptions(next);
                    }}
                    maxLength={100}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                      className="text-zinc-500 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 4 && (
                <button
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors px-1"
                >
                  <Plus className="w-4 h-4" /> Add option
                </button>
              )}
            </div>
            <label className="flex items-center gap-3 px-1 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-white"
                checked={pollMultiple}
                onChange={e => setPollMultiple(e.target.checked)}
              />
              <span className="text-sm text-zinc-300">Allow multiple choices</span>
            </label>
            <input
              type="datetime-local"
              className="w-full bg-white/10 rounded-xl px-4 py-2.5 text-zinc-300 text-sm outline-none focus:ring-1 focus:ring-white/20"
              value={pollExpiry}
              onChange={e => setPollExpiry(e.target.value)}
            />
            <button
              disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2 || createPollMutation.isPending}
              onClick={async () => {
                const tokenIdNum = parseInt(post.id, 10);
                if (!tokenIdNum) return;
                try {
                  await createPollMutation.mutateAsync({
                    tokenId: tokenIdNum,
                    question: pollQuestion.trim(),
                    options: pollOptions.filter(o => o.trim()),
                    isMultipleChoice: pollMultiple,
                    expiresAt: pollExpiry || undefined,
                  });
                  setShowPollCreator(false);
                  setPollQuestion('');
                  setPollOptions(['', '']);
                  setPollMultiple(false);
                  setPollExpiry('');
                  queryClient.invalidateQueries({ queryKey: ['polls', tokenIdNum] });
                } catch {}
              }}
              className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {createPollMutation.isPending ? 'Creating…' : 'Create Poll'}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* AI Chat */}
      <PostAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          type: 'post',
          author: post.author.name,
          caption: post.content
        }}
      />

      {/* Report Modal */}
      <ReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        tokenId={post.id}
        contentType="post"
      />

      {/* Delete Post Modal */}
      <DeletePostModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        tokenId={post.id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
        }}
      />

      {/* Edit Post Modal */}
      <EditPostModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        tokenId={post.id}
        currentTitle={post.rawName ?? post.title ?? ''}
        currentDescription={post.rawDescription ?? post.content ?? ''}
        currentCategories={post.categories ?? []}
        onSuccess={(edited) => {
          applyOptimisticEdit(queryClient, post.id, edited);
        }}
      />

      {/* Quote Post Modal */}
      <QuotePostModal
        open={showQuoteModal}
        onOpenChange={setShowQuoteModal}
        quotedPost={postAsNFT}
      />

      {/* Tip Modal */}
      <TipModal
        open={showTipModal}
        onOpenChange={setShowTipModal}
        creatorAddress={post.author.id}
        creatorName={post.author.name}
        tokenId={post.id}
      />

    </div>
  );
});
