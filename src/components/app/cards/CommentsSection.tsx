/**
 * Comments Section Component
 * ==========================
 * Full-featured comments UI with tabs (Replies/Quotes), search, sorting, and voice notes.
 * Now fetches real comments from the DeHub API.
 * 
 * @example
 * ```tsx
 * <CommentsSection tokenId="123" onClose={() => setShowComments(false)} />
 * ```
 */

import { useState, useMemo, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { useDragTabIndicator } from '@/hooks/use-drag-tab-indicator';
import { saveDraft, loadDraft, clearDraft } from '@/lib/comment-draft-cache';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { formatTimeAgo, formatCount } from '@/lib/feed-utils';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { X, Search, ThumbsUp, ThumbsDown, MessageSquare, Quote, ArrowUpDown, Mic, Square, Play, Pause, Trash2, Share2, Repeat2, Link, Loader2, Reply, Pencil, Check, ImagePlus, Languages, Gem , Anchor, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TranslatableText, useTranslation } from '../TranslatableText';
import { DehubLinkEmbeds, useDehubLinks } from '@/components/app/cards/DehubLinkEmbed';
import { AssetRefCards, useAssetRefsInText } from '@/components/app/cards/AssetRefCards';
import { AudioVisualizer } from '../audio';
import { checkImpersonation } from '@/lib/impersonation';
import { useAuth } from '@/contexts/AuthContext';
import { useBookBoost, useSuperpowers } from '@/hooks/use-superpowers';
import { BadgedName } from '@/components/app/BadgedName';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import { useIsMobile } from '@/hooks/use-mobile';
import { getNFTComments, postComment, toggleCommentLike, toggleCommentDislike, editComment, deleteComment, addCommentWithImage, addVoiceComment, uploadChatImage, getPostReposters, recordCommentViews, getPostQuotes, getNFTInfo } from '@/lib/api/dehub';
import { dehubLinkFor } from '@/lib/dehub-links';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { useCommentTips } from '@/hooks/use-comment-tips';
import { TipModal } from '@/components/app/modals/TipModal';
import { CommentLikersDrawer } from './CommentLikersDrawer';
import { toast } from 'sonner';
import { incrementCommentCount } from '@/lib/comment-count-cache';
import { useMention } from '@/hooks/use-mention';
import { useAssistantPendingReply } from '@/hooks/use-assistant-pending-reply';
import { mentionsAssistant, isAssistantAddress } from '@/lib/assistant';
import { UserMentionDropdown } from '@/components/app/mentions';
import { mapApiComment, type Comment, type VoiceNote } from '@/lib/comment-mapper';

// The comment data shape and its API mapper live in @/lib/comment-mapper so
// non-component consumers can share them. Re-exported here for the surfaces
// that already imported them from this module.
export type { Comment, VoiceNote };

// ============================================================================
// TYPES
// ============================================================================

interface CommentsSectionProps {
  tokenId: string;
  onClose: () => void;
  initialTab?: 'replies' | 'quotes' | 'reposts' | 'search';
  embedded?: boolean;
  /** Creator turned replies off. The composer is replaced with a notice, but
   *  existing comments stay listed — the server refuses new ones either way
   *  (requestCommentFunc), so this is presentation, not the enforcement. */
  commentsDisabled?: boolean;
  /**
   * Post author's wallet address. Set ONLY where the host page renders those
   * comments itself as the author thread above the card: straight comments
   * (top-level, no parentId) written by this address are hidden from the list
   * here so they exist exactly once. Leave unset everywhere else — feed cards
   * have no thread block, and hiding without showing would lose comments.
   */
  postAuthorAddress?: string;
}

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'liked', label: 'Most Liked' },
];

// Threading itself is unlimited — the server happily accepts a reply to a reply
// at any depth. Only the visual indent is capped so a long chain doesn't walk
// off the right edge on a narrow screen.
const MAX_INDENT_DEPTH = 5;
const INDENT_PX = 24;

/** A reply plus how deep it sits under its root comment (1 = direct reply). */
interface ThreadReply {
  comment: Comment;
  depth: number;
}

/** A root comment with every descendant flattened in reading order. */
interface CommentThread {
  comment: Comment;
  replies: ThreadReply[];
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface CommentItemProps {
  comment: Comment;
  tokenId: string;
  onLike: (id: string) => void;
  /** Own comments only: the like button opens the likers list instead. */
  onShowLikers: (id: string) => void;
  onDislike: (id: string) => void;
  onReply: (id: string) => void;
  onShare: (id: string) => void;
  onEdit: (id: string, newContent: string) => void;
  onDelete: (id: string) => void;
  onTip: (id: string) => void;
  /** DHB already tipped to this comment, shown beside the gem when > 0. */
  tipTotal?: number;
  onUserPress: (username: string) => void;
  isReply?: boolean;
  /** Nesting depth: 0 = top-level, 1 = direct reply, 2 = reply-to-reply, … */
  depth?: number;
  isOwnComment?: boolean;
  /**
   * Spend a Comment Anchor on this comment, or undefined when it cannot be.
   *
   * Undefined for a comment that is not yours, on a thread that IS yours, or
   * for an account that has not reached Piranha — the same three refusals the
   * server applies, resolved once by the section rather than by every row.
   */
  onAnchor?: (commentId: string) => void;
  /**
   * Straight comment by the post author on their own post — its permalink is
   * the thread-entry sub-URL (/posts/<tokenId>/b/<id>) rather than ?comment=.
   */
  isThreadEntry?: boolean;
}

interface VoiceNotePlayerProps {
  voiceNote: VoiceNote;
}

function VoiceNotePlayer({ voiceNote }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(voiceNote.url);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <button
      onClick={togglePlay}
      className="flex items-center gap-1.5 bg-zinc-700/50 px-2 py-1 rounded-full text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
    >
      {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      <span>{voiceNote.duration}s</span>
    </button>
  );
}

/**
 * Who wrote the post these comments are on. Provided once by the section and
 * read by every CommentItem, so the impersonation check does not have to be
 * threaded through three render sites and a reply recursion.
 */
const PostCreatorContext = createContext<{
  address?: string | null;
  displayName?: string | null;
  username?: string | null;
} | null>(null);

function CommentItem({ comment, tokenId, onLike, onShowLikers, onDislike, onReply, onShare, onEdit, onDelete, onTip, tipTotal, onUserPress, isReply, depth = 0, isOwnComment, isThreadEntry, onAnchor }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const avatarUrl = comment.avatar;
  const translation = useTranslation(comment.text || '');
  const shownName = comment.displayName || comment.username;

  // Creator on one side, name-wearer on the other. Both chips are about the
  // same question a reader is asking — is this really them — so they live
  // next to the name rather than anywhere cleverer.
  const postCreator = useContext(PostCreatorContext);
  const { isCreator, isImpersonating } = checkImpersonation(
    { address: comment.address, displayName: comment.displayName, username: comment.username },
    postCreator,
  );

  // Comments carry links as often as posts do — a reply pointing at another
  // post, a shop item or a community deserves the same card the post got.
  const commentBody = translation.isTranslated ? translation.translatedText : comment.text;
  const { links: commentLinks, displayText: commentLinkFreeText } = useDehubLinks(commentBody);
  const { refs: commentAssetRefs, displayText: commentDisplayText } =
    useAssetRefsInText(commentLinkFreeText);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 py-3"
      style={depth > 0 ? { marginLeft: Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PX } : undefined}
      data-comment-id={comment.id}
    >
      <button onClick={() => onUserPress(comment.username)} className="flex-shrink-0">
        <Avatar className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity">
          {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover" />}
          <AvatarFallback className="bg-zinc-700">{comment.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
        </Avatar>
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <button 
            onClick={() => onUserPress(comment.username)}
            className="inline-flex items-center gap-1 hover:underline"
          >
            {/* BadgedName shares one badge resolution between the gutter and
                the icon — recomputing getBadgeUrl here left the name's right
                padding out of step with the icon when the viewer's own live
                balance promoted a badge the comment payload didn't carry. */}
            <BadgedName
              badgeBalance={comment.badgeBalance}
              username={comment.username}
              className="font-semibold text-white text-sm max-w-[120px] leading-tight"
            >
              {shownName}
            </BadgedName>
          </button>
          {isCreator && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.12] border border-white/[0.12] text-[10px] font-semibold text-white/75 leading-none flex-shrink-0">
              Creator
            </span>
          )}
          {/* Same name, different account. Said plainly, and never by hiding
              the comment — the reader decides, this only removes the doubt. */}
          {isImpersonating && (
            <span
              title="This account is not the creator of this post"
              className="px-1.5 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-[10px] font-semibold text-red-300 leading-none flex-shrink-0"
            >
              Not the creator
            </span>
          )}
          <NewMemberChip address={comment.address} />
          {/* The bot comments under a normal account, so without this it is
              indistinguishable from a user who picked the handle. */}
          {isAssistantAddress(comment.address) && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.12] border border-white/[0.12] text-[10px] font-semibold text-white/75 leading-none flex-shrink-0">
              AI
            </span>
          )}
          {comment.displayName && (
            <span data-war-readout className="text-zinc-500 text-xs truncate max-w-[100px]">@{comment.username}</span>
          )}
          <span data-war-readout className="text-zinc-500 text-xs">{comment.timeAgo}</span>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-zinc-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onEdit(comment.id, editText);
                  setIsEditing(false);
                } else if (e.key === 'Escape') {
                  setEditText(comment.text);
                  setIsEditing(false);
                }
              }}
            />
            <button
              onClick={() => { onEdit(comment.id, editText); setIsEditing(false); }}
              className="text-green-400 hover:text-green-300 transition-colors"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setEditText(comment.text); setIsEditing(false); }}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {/* auto={false}: the `translation` hook above already translates
                this comment and its output is what gets rendered here. Left on,
                every comment in the thread was translated twice. */}
            {commentDisplayText && (
              <TranslatableText
                text={commentDisplayText}
                className="text-zinc-300 text-sm leading-relaxed break-words"
                as="p"
                hideControls
                auto={false}
              />
            )}
            <DehubLinkEmbeds links={commentLinks} />
            <AssetRefCards refs={commentAssetRefs} />
            {comment.imageUrl && (
              <img
                src={comment.imageUrl}
                alt="Comment media"
                className="mt-1.5 rounded-lg max-w-[240px] max-h-[200px] object-contain cursor-pointer"
                onClick={() => window.open(comment.imageUrl, '_blank')}
                loading="lazy"
              />
            )}
            {comment.voiceNote && (
              <div className="mt-1">
                <VoiceNotePlayer voiceNote={comment.voiceNote} />
              </div>
            )}
          </>
        )}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-4">
            {/* You can't like your own comment — for the author this same
                button opens the likers list instead, count included even at 0
                so the door is visible. */}
            <button
              onClick={() => (isOwnComment ? onShowLikers(comment.id) : onLike(comment.id))}
              className={cn(
                "flex items-center gap-1 transition-colors",
                !isOwnComment && comment.isLiked ? "text-white" : "text-white/70 hover:text-white"
              )}
              aria-label={isOwnComment ? "See who liked" : "Like"}
            >
              <ThumbsUp className={cn("w-4 h-4", !isOwnComment && comment.isLiked && "fill-current")} />
              {(comment.likes > 0 || isOwnComment) && <span className="text-xs">{comment.likes}</span>}
            </button>
            {/* Downvote a comment — the count shows once someone has actually
                disliked. The server swaps polarity with like, one vote per viewer. */}
            <button
              onClick={() => onDislike(comment.id)}
              className={cn(
                "flex items-center gap-1 transition-colors",
                comment.isDisliked ? "text-white" : "text-white/70 hover:text-white"
              )}
              aria-label="Dislike"
            >
              <ThumbsDown className={cn("w-4 h-4", comment.isDisliked && "fill-current")} />
              {comment.dislikes > 0 && <span className="text-xs">{comment.dislikes}</span>}
            </button>
            {/* Every comment is replyable, replies included — threads nest without limit. */}
            <button
              onClick={() => onReply(comment.id)}
              className="text-white hover:text-zinc-400 transition-colors"
              aria-label="Reply"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            {/* Tip the comment's author. Rendered for own comments too so the
                author sees what the comment has earned; the payment hook
                already refuses self-tips. */}
            <button
              onClick={() => onTip(comment.id)}
              className="flex items-center gap-1 text-white hover:text-zinc-400 transition-colors"
              aria-label="Tip"
            >
              <Gem className="w-4 h-4" />
              {(tipTotal ?? 0) > 0 && <span className="text-xs">{formatCount(tipTotal!)}</span>}
            </button>
            {/*
              Comment Anchor — holding your own comment at the top of somebody
              else's thread. Beside Edit and Delete because it is the same kind
              of thing: something only the comment's author can do to it.

              A top-level comment only. A reply is anchored inside a subtree
              nobody sorts, so buying the top of it buys nothing.
            */}
            {isOwnComment && !isEditing && !isReply && onAnchor && (
              <button
                onClick={() => onAnchor(comment.id)}
                className="text-white hover:text-zinc-400 transition-colors"
                aria-label="Anchor this comment to the top"
                title="Anchor to the top of this thread"
              >
                <Anchor className="w-4 h-4" />
              </button>
            )}
            {isOwnComment && !isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-white hover:text-zinc-400 transition-colors"
                  aria-label="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(comment.id)}
                  className="text-white hover:text-red-400 transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="text-white hover:text-zinc-400 transition-colors"
                  aria-label="Share"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" data-comments-dropdown className="min-w-[160px]">
                <DropdownMenuItem
                  onClick={() => {
                    const url = isThreadEntry
                      ? dehubLinkFor.threadEntry(tokenId, comment.id)
                      : `${window.location.origin}/app/post/${tokenId}?comment=${comment.id}`;
                    navigator.clipboard.writeText(url);
                    toast.success('Link copied');
                  }}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Link className="w-4 h-4" />
                  Copy Link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => toast.info('Repost from comments coming soon!')}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Repeat2 className="w-4 h-4" />
                  Repost
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(comment.text);
                    toast.success('Comment text copied');
                  }}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Quote className="w-4 h-4" />
                  Copy Text
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {comment.text && !translation.isTooShort && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => translation.isTranslated ? translation.handleShowOriginal() : translation.handleTranslate()}
                    className={cn(
                      "transition-colors",
                      translation.isLoading ? "text-white/60" : 
                      translation.isTranslated ? "text-white" : "text-white hover:text-zinc-400"
                    )}
                    aria-label="Translate"
                    disabled={translation.isLoading}
                  >
                    {translation.isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Languages className="w-4 h-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{translation.isTranslated ? 'Show original' : 'Translate'}</TooltipContent>
              </Tooltip>
            )}
            {/* Views on the comment itself, recorded by the observer below
                when the row scrolls into a reader's viewport.

                Not a button, and last in the group on purpose: it is the one
                static figure in a row of actions, so it gets no hover state
                and no cursor change, and sitting between two tappable icons
                would have made it read as a third.

                Hidden at 0 — which is what a comment posted seconds ago and
                not yet seen by anyone else reads as. */}
            {comment.views > 0 && (
              <span
                className="flex items-center gap-1 text-white/70"
                aria-label={`${comment.views} views`}
              >
                <Eye className="w-4 h-4" />
                <span className="text-xs">{formatCount(comment.views)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommentsSection({ tokenId, onClose, initialTab, embedded = false, commentsDisabled = false, postAuthorAddress }: CommentsSectionProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, walletAddress } = useAuth();
  const isMobile = useIsMobile();
  
  // Who the post belongs to, for the Creator / Not-the-creator chips. Shares
  // the ['nft-info', tokenId] cache the rest of the app already fills, so on a
  // post page this is a cache read rather than a request.
  const { data: postInfo } = useQuery({
    queryKey: ['nft-info', tokenId],
    queryFn: () => getNFTInfo(tokenId),
    enabled: !!tokenId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const postCreator = useMemo(() => {
    const address = postInfo?.minter || postAuthorAddress;
    if (!address) return null;
    return {
      address,
      displayName: postInfo?.minterDisplayName,
      username: postInfo?.minterUsername || (postInfo as { mintername?: string } | undefined)?.mintername,
    };
  }, [postInfo, postAuthorAddress]);

  const [activeTab, setActiveTab] = useState<'replies' | 'quotes' | 'reposts' | 'search'>(initialTab ?? 'replies');
  // The mount-time initial value alone doesn't cover a section that's already
  // open: tapping the like count while comments are expanded changes initialTab
  // without remounting, and the tab has to follow.
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const commentsIsDraggingRef = useRef(false);
  const { layerRef: commentsTabLayerRef, setRef: setCommentsTabRef, rect: commentsTabRect } = useTabIndicator(activeTab, undefined, commentsIsDraggingRef);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'liked'>('recent');
  const [newComment, setNewComment] = useState(() => loadDraft(tokenId));
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [tipComment, setTipComment] = useState<Comment | null>(null);
  // Which of the viewer's own comments has its likers drawer open.
  const [likersCommentId, setLikersCommentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<Comment[]>([]);
  // Optimistic delete/edit overlays — applied instantly in allComments below,
  // reverted if the server call fails.
  const [deletedCommentIds, setDeletedCommentIds] = useState<Set<string>>(new Set());
  const [editOverrides, setEditOverrides] = useState<Map<string, string>>(new Map());
  // Track like/dislike state overrides for optimistic updates. Every field is
  // optional so a like tap never clobbers a dislike count it didn't touch.
  const [likeOverrides, setLikeOverrides] = useState<Map<string, { isLiked?: boolean; isDisliked?: boolean; likes?: number; dislikes?: number }>>(new Map());
  
  // Voice note recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeRef = useRef(0);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const mention = useMention({
    inputRef,
    onMentionInsert: (_user, newText) => setNewComment(newText),
  });

  // Persist draft to localStorage on every keystroke
  useEffect(() => {
    saveDraft(tokenId, newComment, replyTo?.id);
  }, [newComment, tokenId, replyTo?.id]);

  // Restore draft when switching reply target
  useEffect(() => {
    setNewComment(loadDraft(tokenId, replyTo?.id));
  }, [replyTo?.id, tokenId]);

  const MAX_VOICE_DURATION = 30;

  // Fetch comments from API. Paged: the single-page version capped every
  // thread at its 20 newest roots with no way to read the rest.
  const COMMENTS_PAGE_SIZE = 20;
  const {
    data: commentPages,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['comments', tokenId, walletAddress],
    queryFn: ({ pageParam }) =>
      getNFTComments(tokenId, pageParam as number, COMMENTS_PAGE_SIZE, walletAddress?.toLowerCase()),
    initialPageParam: 0,
    // A short page is the last page — the API exposes no total.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length >= COMMENTS_PAGE_SIZE ? allPages.length : undefined,
    staleTime: 30000,
  });
  const apiComments = useMemo(() => commentPages?.pages.flat(), [commentPages]);

  const loadMoreRow = !isLoading && !error && hasNextPage ? (
    <div className="flex justify-center py-3">
      <button
        type="button"
        onClick={() => fetchNextPage()}
        disabled={isFetchingNextPage}
        className="px-4 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
      >
        {isFetchingNextPage ? 'Loading…' : 'Load more comments'}
      </button>
    </div>
  ) : null;

  // Fetch reposters when tab is active. Follow buttons in the list use the
  // shared optimistic override store — instant flip, cross-surface consistent.
  const followOverrides = useFollowOverrides();
  const { data: repostersData, isLoading: isLoadingReposters } = useQuery({
    queryKey: ['post-reposters', tokenId],
    queryFn: () => getPostReposters(tokenId),
    enabled: activeTab === 'reposts',
    staleTime: 60000,
  });

  // Fetch quotes when quotes tab is active (#13)
  const { data: quotesData, isLoading: isLoadingQuotes } = useQuery({
    queryKey: ['post-quotes', tokenId],
    queryFn: () => getPostQuotes(tokenId),
    enabled: activeTab === 'quotes',
    staleTime: 60000,
    retry: false,
  });

  // Combine API comments with optimistic ones and apply like/edit/delete overrides
  const allComments = useMemo(() => {
    const mapped = apiComments?.map(mapApiComment) || [];
    const apiIds = new Set(mapped.map(c => c.id));
    const pending = optimisticComments.filter(c => !apiIds.has(c.id) && c.id.startsWith('temp-'));
    const combined = [...pending, ...mapped];

    // Apply overrides: optimistic deletes hide rows instantly, optimistic
    // edits swap text instantly — both reconcile with the background refetch.
    return combined
      .filter(c => !deletedCommentIds.has(c.id))
      .map(c => {
        const editedText = editOverrides.get(c.id);
        const override = likeOverrides.get(c.id);
        let result = c;
        if (editedText !== undefined) result = { ...result, text: editedText };
        if (override) result = { ...result, ...override };
        return result;
      });
  }, [apiComments, optimisticComments, likeOverrides, deletedCommentIds, editOverrides]);

  // Tagging @assistant produces a real comment, but only once the model has
  // answered — several seconds after the post returns. This keeps a placeholder
  // in the thread and polls until the reply lands.
  const { isWaiting: isAssistantReplying, arm: armAssistantReply } = useAssistantPendingReply(
    tokenId,
    allComments,
  );

  // Record comment views when visible (#9)
  const viewedIdsRef = useRef(new Set<number>());
  const pendingViewsRef = useRef<number[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!apiComments?.length) return;
    const numericIds = apiComments.map(c => Number(c.id)).filter(Boolean);
    if (!numericIds.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const id = Number((entry.target as HTMLElement).dataset.commentId);
        if (!id || viewedIdsRef.current.has(id)) return;
        viewedIdsRef.current.add(id);
        pendingViewsRef.current.push(id);
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
          const batch = pendingViewsRef.current.splice(0);
          if (batch.length) recordCommentViews(batch).catch(() => {});
        }, 2000);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-comment-id]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [apiComments]);

  // Group comments into threads. Nesting is unbounded: a reply can have replies,
  // which can have replies, and so on — each root carries every descendant
  // flattened in reading order with its depth, so the list renders in one pass.
  const groupedComments = useMemo<CommentThread[]>(() => {
    const byId = new Map(allComments.map(c => [c.id, c]));
    const childrenOf = new Map<string, Comment[]>();
    const roots: Comment[] = [];

    // The author's straight comments on their own post are rendered by the host
    // page as the author thread above the card — drop them here so they don't
    // appear twice. Replies TO those stay listed (promoted to roots, since the
    // parent is not in this list). Only applies when the host opted in by
    // passing postAuthorAddress; a temp/optimistic self-comment carries the
    // viewer address, so it jumps straight into the thread with no flash in
    // this list either.
    const isAuthorThreadEntry = (c: Comment) =>
      !!postAuthorAddress &&
      !c.replyToId &&
      !!c.address &&
      c.address.toLowerCase() === postAuthorAddress.toLowerCase();

    allComments.forEach(c => {
      const parentId = c.replyToId;
      if (!parentId || parentId === c.id || !byId.has(parentId)) {
        // A reply whose parent isn't in this page (the API returns a flat window of
        // comments, so an ancestor can fall outside it) is promoted to a root
        // rather than dropped — losing it would hide real replies entirely.
        if (!isAuthorThreadEntry(c)) roots.push(c);
        return;
      }
      const siblings = childrenOf.get(parentId);
      if (siblings) siblings.push(c);
      else childrenOf.set(parentId, [c]);
    });

    // Oldest-first within a thread, so a conversation reads top to bottom.
    childrenOf.forEach(children =>
      children.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );

    const emitted = new Set<string>();
    const collect = (parent: Comment, depth: number, out: ThreadReply[]) => {
      for (const child of childrenOf.get(parent.id) || []) {
        if (emitted.has(child.id)) continue; // guard against a malformed cycle
        emitted.add(child.id);
        out.push({ comment: child, depth });
        collect(child, depth + 1, out);
      }
    };

    const buildThread = (comment: Comment): CommentThread => {
      emitted.add(comment.id);
      const replies: ThreadReply[] = [];
      collect(comment, 1, replies);
      return { comment, replies };
    };

    const threads = roots.map(buildThread);

    // Safety net: if bad data ever produced a parent cycle, none of its members
    // would look like a root and the whole ring would disappear. Surface any
    // comment the walk never reached as a top-level one instead of losing it —
    // except the author thread entries, which belong to the host page's block.
    allComments.forEach(c => {
      if (!emitted.has(c.id) && !isAuthorThreadEntry(c)) threads.push(buildThread(c));
    });

    return threads;
  }, [allComments, postAuthorAddress]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
        playbackAudioRef.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setVoiceNote({ url, duration: recordingTimeRef.current });
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;

      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);
        
        if (recordingTimeRef.current >= MAX_VOICE_DURATION) {
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const removeVoiceNote = () => {
    if (voiceNote) {
      URL.revokeObjectURL(voiceNote.url);
      setVoiceNote(null);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    setCommentImage(file);
    setCommentImagePreview(URL.createObjectURL(file));
  };

  const removeCommentImage = () => {
    if (commentImagePreview) {
      URL.revokeObjectURL(commentImagePreview);
    }
    setCommentImage(null);
    setCommentImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const togglePreviewPlayback = () => {
    if (!voiceNote) return;

    if (!playbackAudioRef.current) {
      playbackAudioRef.current = new Audio(voiceNote.url);
      playbackAudioRef.current.onended = () => setIsPlayingPreview(false);
    }

    if (isPlayingPreview) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current.currentTime = 0;
      setIsPlayingPreview(false);
    } else {
      playbackAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  // Filter and sort comments
  const filteredGroupedComments = useMemo(() => {
    let filtered = groupedComments;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = groupedComments.filter(
        ({ comment, replies }) =>
          comment.text.toLowerCase().includes(query) ||
          comment.username.toLowerCase().includes(query) ||
          replies.some(({ comment: r }) => r.text.toLowerCase().includes(query) || r.username.toLowerCase().includes(query))
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'liked') {
        // Sort by likes (most liked first)
        return b.comment.likes - a.comment.likes;
      }
      if (sortBy === 'oldest') {
        // Sort by oldest first
        return a.comment.createdAt.getTime() - b.comment.createdAt.getTime();
      }
      // Default: sort by most recent (newest first)
      return b.comment.createdAt.getTime() - a.comment.createdAt.getTime();
    });
  }, [groupedComments, searchQuery, sortBy]);

  /**
   * Comment Anchor — the Piranha rung.
   *
   * The three conditions are resolved once here rather than in every row, and
   * they mirror the server's exactly: the account has to hold the power, the
   * comment has to be theirs (checked per row), and the THREAD has to belong
   * to somebody else. On your own post a pin is already yours, free and
   * permanent, so offering a paid fifteen-minute version of it would be
   * selling somebody something they own.
   */
  const { data: superpowerStatus } = useSuperpowers(!!walletAddress);
  const anchorComment = useBookBoost();
  const isOwnThread =
    !!walletAddress &&
    !!(postInfo?.minter || postAuthorAddress) &&
    (postInfo?.minter || postAuthorAddress)!.toLowerCase() === walletAddress.toLowerCase();
  const canAnchor =
    !isOwnThread &&
    !!superpowerStatus?.powers.some(
      p => p.key === 'comment_anchor' && p.unlocked && p.available,
    ) &&
    (superpowerStatus?.boostsLeft ?? 0) > 0;

  const handleAnchor = (commentId: string) => {
    anchorComment.mutate(
      { tokenId: 0, power: 'comment_anchor', commentId },
      {
        onSuccess: booking =>
          toast.success(`Anchored to the top for ${booking.minutes} minutes`),
        // The server writes these sentences for a person to read.
        onError: (error: any) => toast.error(error?.message || 'Could not anchor that comment'),
      },
    );
  };

  const handleUserPress = useCallback((username: string) => {
    onClose();
    navigate(`/${username}`);
  }, [navigate, onClose]);

  const handleLike = async (commentId: string) => {
    if (!isAuthenticated) {
      toast.error('Please log in to like comments');
      return;
    }
    
    // Find current comment state
    const comment = allComments.find(c => c.id === commentId);
    if (!comment) return;

    // Own comments can't be liked — their like button shows who liked them.
    // CommentItem already routes there; this covers any other caller.
    if (walletAddress && comment.address?.toLowerCase() === walletAddress.toLowerCase()) {
      setLikersCommentId(comment.id);
      return;
    }

    const wasLiked = comment.isLiked;
    const wasDisliked = comment.isDisliked ?? false;
    const newLikes = wasLiked ? Math.max(0, comment.likes - 1) : comment.likes + 1;
    // The server swaps polarity — liking removes this viewer's dislike.
    const newDislikes = wasDisliked ? Math.max(0, comment.dislikes - 1) : comment.dislikes;

    // Optimistic update using overrides
    setLikeOverrides(prev => {
      const next = new Map(prev);
      next.set(commentId, {
        isLiked: !wasLiked,
        isDisliked: false,
        likes: newLikes,
        dislikes: newDislikes,
      });
      return next;
    });

    try {
      const result = await toggleCommentLike({ commentId });
      // Update override with server-confirmed state
      if (result.likeCount !== undefined) {
        setLikeOverrides(prev => {
          const next = new Map(prev);
          next.set(commentId, {
            isLiked: result.isLiked,
            isDisliked: false,
            likes: result.likeCount ?? newLikes,
            dislikes: newDislikes,
          });
          return next;
        });
      }
    } catch (error) {
      // Revert on error
      setLikeOverrides(prev => {
        const next = new Map(prev);
        next.delete(commentId);
        return next;
      });
      toast.error('Failed to like comment');
    }
  };

  const handleDislike = async (commentId: string) => {
    if (!isAuthenticated) {
      toast.error('Please log in to dislike comments');
      return;
    }

    const comment = allComments.find(c => c.id === commentId);
    if (!comment) return;

    const wasDisliked = comment.isDisliked ?? false;
    const wasLiked = comment.isLiked ?? false;
    const newDislikes = wasDisliked ? Math.max(0, comment.dislikes - 1) : comment.dislikes + 1;
    // A dislike replaces a like — same one-vote-per-viewer rule as posts.
    const newLikes = wasLiked && !wasDisliked ? Math.max(0, comment.likes - 1) : comment.likes;

    // Optimistic update
    setLikeOverrides(prev => {
      const next = new Map(prev);
      next.set(commentId, {
        isLiked: false,
        isDisliked: !wasDisliked,
        likes: newLikes,
        dislikes: newDislikes,
      });
      return next;
    });

    try {
      const result = await toggleCommentDislike({ commentId });
      setLikeOverrides(prev => {
        const next = new Map(prev);
        next.set(commentId, {
          isLiked: false,
          isDisliked: result.disliked,
          likes: newLikes,
          dislikes: result.dislikes ?? newDislikes,
        });
        return next;
      });
    } catch {
      // Revert on error
      setLikeOverrides(prev => {
        const next = new Map(prev);
        next.delete(commentId);
        return next;
      });
      toast.error('Failed to dislike comment');
    }
  };

  const handleReply = (commentId: string) => {
    const found = allComments.find(c => c.id === commentId);
    if (found) {
      setReplyTo(found);
      setNewComment(`@${found.username} `);
      // Just focus - let mobile browsers handle keyboard viewport adjustment natively
      // Manual scrollIntoView causes ugly content cutoff on mobile
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleClearReply = () => {
    setReplyTo(null);
    setNewComment('');
  };

  const handleTip = (commentId: string) => {
    const found = allComments.find(c => c.id === commentId);
    if (found) setTipComment(found);
  };

  // One query for every loaded comment's tip total, fanned out per row below.
  const allCommentIds = useMemo(() => allComments.map(c => c.id), [allComments]);
  const { data: commentTips } = useCommentTips(tokenId, allCommentIds);

  const handleDeleteComment = async (commentId: string) => {
    // Optimistic: hide the row instantly, restore it if the server refuses.
    setDeletedCommentIds(prev => new Set(prev).add(commentId));
    try {
      await deleteComment(commentId);
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
    } catch (err) {
      setDeletedCommentIds(prev => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
      console.error('Delete comment error:', err);
      toast.error('Failed to delete comment');
    }
  };

  const handleEditComment = async (commentId: string, newContent: string) => {
    if (!newContent.trim()) return;
    // Optimistic: swap the text instantly, revert if the server refuses.
    setEditOverrides(prev => new Map(prev).set(commentId, newContent));
    try {
      await editComment({ commentId, content: newContent });
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
    } catch (err) {
      setEditOverrides(prev => {
        const next = new Map(prev);
        next.delete(commentId);
        return next;
      });
      console.error('Edit comment error:', err);
      toast.error('Failed to edit comment');
    }
  };

  const handlePostComment = useCallback(async () => {
    if ((!newComment.trim() && !voiceNote && !commentImage) || isSubmitting) return;
    
    if (!isAuthenticated || !user) {
      toast.error('Please log in to comment');
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const userAddress = user.address || user.wallet_address || '';
    const rawAvatarPath = extractAvatarPath(user);
    const resolvedAvatar = userAddress && rawAvatarPath 
      ? buildAvatarUrl(userAddress, rawAvatarPath) 
      : undefined;

    const tempComment: Comment = {
      id: tempId,
      username: user.username || 'you',
      avatar: resolvedAvatar,
      text: newComment,
      likes: 0,
      dislikes: 0,
      // Nobody has scrolled past a comment that does not exist on the server
      // yet; the real count arrives with the refetch.
      views: 0,
      timeAgo: 'Just now',
      createdAt: new Date(),
      voiceNote: voiceNote || undefined,
      replyToId: replyTo?.id,
      address: userAddress,
    };

    setOptimisticComments(prev => [tempComment, ...prev]);
    const replyTarget = replyTo;
    const imageFile = commentImage;
    clearDraft(tokenId, replyTo?.id);
    setReplyTo(null);
    setNewComment('');
    setVoiceNote(null);
    removeCommentImage();
    setIsInputExpanded(false);
    // Reset textarea inline height set by auto-resize
    if (inputRef.current) {
      inputRef.current.style.height = '';
    }
    setIsSubmitting(true);

    try {
      if (voiceNote) {
        // Voice note comment via /api/comment_audio
        const audioBlob = await fetch(voiceNote.url).then(r => r.blob());
        if (audioBlob.size > 2 * 1024 * 1024) {
          toast.error('Voice note must be under 2MB');
          setIsSubmitting(false);
          return;
        }
        await addVoiceComment({
          tokenId: parseInt(tokenId, 10),
          audioFile: audioBlob,
          content: newComment || undefined,
          parentId: replyTarget?.id,
        });
      } else if (imageFile) {
        // Upload image first, then post comment with image
        const { url: imageUrl } = await uploadChatImage(imageFile);
        await addCommentWithImage({
          tokenId: parseInt(tokenId, 10),
          content: newComment,
          imageUrl,
          parentId: replyTarget?.id,
        });
      } else {
        console.log('[CommentsSection] posting comment:', {
          tokenId,
          content: newComment,
          replyToId: replyTarget?.id,
          mentions: newComment.match(/@\w+/g) || [],
        });
        await postComment(tokenId, newComment, replyTarget?.id);
      }
      await queryClient.refetchQueries({ queryKey: ['comments', tokenId] });
      incrementCommentCount(tokenId);
      setOptimisticComments(prev => prev.filter(c => c.id !== tempId));
      // The refetch above is always too early for a tagged assistant — it has
      // to call the model first — so hand off to the poller.
      if (mentionsAssistant(newComment)) armAssistantReply();
    } catch (err) {
      setOptimisticComments(prev => prev.filter(c => c.id !== tempId));
      // The server's own words when it has them — a refusal explains itself
      // ("comments are turned off", a link that cannot be posted) and a
      // generic failure message would leave the author guessing.
      toast.error(err instanceof Error && err.message ? err.message : 'Failed to post comment');
      console.error('Comment error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [newComment, voiceNote, commentImage, isSubmitting, isAuthenticated, user, replyTo, tokenId, queryClient, armAssistantReply]);

  const canPost = (newComment.trim() || voiceNote || commentImage) && !isSubmitting;

  // Drag-to-swipe for comments tab indicator (after all hooks)
  type CommentsTab = 'replies' | 'quotes' | 'reposts' | 'search';
  const commentsTabPositions = useRef<Partial<Record<CommentsTab, HTMLElement | null>>>({});

  const { isDragging: isCommentsDragging, indicatorRef: commentsIndicatorRef, handleDragStart: handleCommentsDragStart, handleDragMove: handleCommentsDragMove, handleDragEnd: handleCommentsDragEnd } = useDragTabIndicator({
    tabRect: commentsTabRect,
    tabLayerRef: commentsTabLayerRef,
    tabButtonPositions: commentsTabPositions,
    tabValues: ['replies', 'quotes', 'reposts', 'search'] as CommentsTab[],
    activeTab,
    onTabChange: setActiveTab,
    isDraggingRef: commentsIsDraggingRef,
  });

  return (
    <PostCreatorContext.Provider value={postCreator}>
    <motion.div
      data-comments-section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        isMobile
          ? "flex flex-col h-full px-2 pt-2 pb-2 relative"
          : embedded
            ? "flex flex-col h-full min-h-0 p-0 mt-0 relative"
            : "flex flex-col min-h-[400px] max-h-[600px] p-4 mt-3 relative"
      )}
    >

      {/* Tab Switcher - Left: Replies, Quotes, Search, Sort | Right: Like, Dislike, Bookmark, Share (desktop/tablet only) */}
      <div data-comment-tabs className={cn("flex justify-between items-center gap-1", isMobile ? "mb-3" : "mb-3")}>
        {/* Mobile close button removed — drawer dismisses via drag-down or tapping overlay */}
        {false && (
          <button
            onClick={onClose}
            className="hidden"
            aria-label="Close comments"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {/* Left side - Tab buttons */}
        <div ref={commentsTabLayerRef} className="relative" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
          <GlassIndicator ref={commentsIndicatorRef} rect={commentsTabRect} enableTransition={!isCommentsDragging} />
          {commentsTabRect.ready && (
            <div
              className="absolute z-30 cursor-grab active:cursor-grabbing"
              style={{
                transform: `translate(${commentsTabRect.x}px, ${commentsTabRect.y}px)`,
                width: commentsTabRect.width,
                height: commentsTabRect.height,
              }}
              onPointerDown={handleCommentsDragStart}
              onPointerMove={handleCommentsDragMove}
              onPointerUp={handleCommentsDragEnd}
              onPointerCancel={handleCommentsDragEnd}
            />
          )}
          <div className="relative z-20 flex gap-1">
            {(['replies', 'quotes', 'reposts', 'search'] as const).map((tab) => (
              <button
                key={tab}
                ref={(el) => {
                  setCommentsTabRef(tab)(el);
                  commentsTabPositions.current[tab] = el;
                }}
                type="button"
                data-tab-btn
                data-active={activeTab === tab ? 'true' : undefined}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "relative z-40 py-1.5 flex items-center justify-center transition-all rounded-xl text-zinc-400 hover:text-zinc-200",
                  // Embedded (shorts viewer side panel) is narrow — tighter tab
                  // padding so the whole header row fits without overflowing
                  // into the panel padding.
                  embedded ? "px-2" : "px-3"
                )}
              >
                <span className={cn("relative z-10", activeTab === tab && "text-white")}>
                  {tab === 'replies' ? <MessageSquare className="w-[17px] h-[17px]" /> : tab === 'quotes' ? <Quote className="w-[17px] h-[17px]" /> : tab === 'reposts' ? <Repeat2 className="w-[22px] h-[22px]" /> : <Search className="w-[17px] h-[17px]" />}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right side - Sort toggle */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setSortBy(prev => prev === 'recent' ? 'oldest' : prev === 'oldest' ? 'liked' : 'recent')}
                className={cn(
                  "py-1.5 flex items-center justify-center gap-1.5 transition-colors rounded-xl text-zinc-400 hover:text-white",
                  embedded ? "px-2" : "px-3"
                )}
              >
                <ArrowUpDown className="w-[17px] h-[17px]" />
                {/* In the narrow embedded panel the label only fits at lg+;
                    below that the icon + tooltip carry the meaning. */}
                <span className={cn("text-[11px]", embedded && "hidden lg:inline")}>{sortBy === 'recent' ? 'Recent' : sortBy === 'oldest' ? 'Oldest' : 'Liked'}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{sortBy === 'recent' ? 'Sorted by Most Recent' : sortBy === 'oldest' ? 'Sorted by Oldest' : 'Sorted by Most Liked'}</TooltipContent>
          </Tooltip>
          {/* Collapse control for the inline expansion on feed cards. The
              embedded shorts side panel has nothing to close, so no X there. */}
          {!embedded && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close comments"
                  className="py-1.5 px-3 flex items-center justify-center transition-colors rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="w-[17px] h-[17px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Close comments</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Duplicate post action buttons removed — already shown in ActionBar above */}
      </div>

      {/* Search Input - always rendered but hidden when not on search tab to maintain consistent height */}
      <div className={`mb-3 ${activeTab === 'search' ? 'visible' : 'invisible h-0 mb-0 overflow-hidden'}`}>
        <Input
          placeholder="Search comments & quotes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-comment-search
          className="bg-white/[0.08] backdrop-blur-xl border-white/[0.12] text-white text-sm h-10 rounded-xl placeholder:text-zinc-500"
          autoFocus={activeTab === 'search'}
        />
      </div>

      {/* Content Area - scrollable, takes remaining space */}
      <div className={`relative flex-1 min-h-0 ${!isMobile && activeTab === 'search' ? 'max-h-[272px]' : ''}`}>
        {/* Replies Tab */}
        {activeTab === 'replies' && (
          <div className="absolute inset-0 overflow-y-auto pt-2 pb-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : error ? (
              <p className="text-zinc-500 text-sm py-6 text-center">Failed to load comments</p>
            ) : (
              <AnimatePresence mode="popLayout">
                {isAssistantReplying && (
                  <motion.div
                    key="assistant-pending"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-400"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>DeHub Assistant is replying…</span>
                  </motion.div>
                )}
                {filteredGroupedComments.length > 0 ? (
                  filteredGroupedComments.map(({ comment, replies }) => (
                    <div key={comment.id}>
                      <CommentItem
                        comment={comment}
                        tokenId={tokenId}
                        onLike={handleLike}
                        onShowLikers={setLikersCommentId}
                        onDislike={handleDislike}
                        onReply={handleReply}
                        onShare={() => {}}
                        onEdit={handleEditComment}
                        onDelete={handleDeleteComment}
                        onTip={handleTip}
                        tipTotal={commentTips?.[comment.id]}
                        onUserPress={handleUserPress}
                        isOwnComment={comment.address?.toLowerCase() === walletAddress?.toLowerCase()}
                        onAnchor={canAnchor ? handleAnchor : undefined}
                        isThreadEntry={
                          !comment.replyToId &&
                          !!postAuthorAddress &&
                          comment.address?.toLowerCase() === postAuthorAddress.toLowerCase()
                        }
                      />
                      {replies.map(({ comment: reply, depth }) => (
                        <CommentItem
                          key={reply.id}
                          comment={reply}
                          tokenId={tokenId}
                          onLike={handleLike}
                          onShowLikers={setLikersCommentId}
                          onDislike={handleDislike}
                          onReply={handleReply}
                          onShare={() => {}}
                          onEdit={handleEditComment}
                          onDelete={handleDeleteComment}
                          onTip={handleTip}
                          tipTotal={commentTips?.[reply.id]}
                          onUserPress={handleUserPress}
                          isReply
                          depth={depth}
                          isOwnComment={reply.address?.toLowerCase() === walletAddress?.toLowerCase()}
                        />
                      ))}
                    </div>
                  ))
                ) : (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-zinc-500 text-sm text-center flex items-center justify-center h-full min-h-[200px]"
                  >
                    No replies yet. Be the first!
                  </motion.p>
                )}
              </AnimatePresence>
            )}
            {loadMoreRow}
          </div>
        )}

        {/* Quotes Tab (#13) */}
        {activeTab === 'quotes' && (
          <div className="absolute inset-0 overflow-y-auto pt-2 pb-2">
            {isLoadingQuotes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : quotesData?.result && quotesData.result.length > 0 ? (
              <div className="space-y-2">
                {quotesData.result.map((post: any) => {
                  // minterUsername/minterUser were never read here, so a quoter
                  // with a username but no displayName fell through to their raw
                  // address — same class of bug QuotedPostEmbed had. The avatar
                  // was hand-built with a raw CDN prefix instead of
                  // buildAvatarUrl/extractAvatarPath, which 403s on the older
                  // "statics/avatars/…" upload path and silently falls back to
                  // the initial.
                  const displayName =
                    post.minterUser?.displayName ||
                    post.minterDisplayName ||
                    post.minterUser?.username ||
                    post.minterUsername ||
                    post.mintername ||
                    post.minter?.slice(0, 8) ||
                    'Unknown';
                  const avatarPath = extractAvatarPath(post) || extractAvatarPath(post.minterUser);
                  const avatarUrl = buildAvatarUrl(post.minter || post.minterUser?.address || '', avatarPath);
                  const preview = (post.description || post.name || '').slice(0, 120);
                  return (
                    <button
                      key={post.tokenId}
                      onClick={() => navigate(`/app/post/${post.tokenId}`)}
                      className="w-full flex items-start gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
                    >
                      <Avatar className="w-9 h-9 rounded-lg flex-shrink-0">
                        {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                        <AvatarFallback className="bg-zinc-800 text-white rounded-lg text-sm">
                          {displayName[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white text-sm truncate">{displayName}</span>
                          <NewMemberChip address={post.minter || post.minterUser?.address} />
                        </div>
                        {preview && <span className="text-zinc-400 text-xs line-clamp-2 mt-0.5">{preview}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-zinc-500 text-sm text-center flex items-center justify-center h-full min-h-[200px]"
              >
                No quotes yet. Be the first!
              </motion.p>
            )}
          </div>
        )}

        {/* Reposts Tab */}
        {activeTab === 'reposts' && (
          <div className="absolute inset-0 overflow-y-auto pt-2 pb-2">
            {isLoadingReposters ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : repostersData?.items && repostersData.items.length > 0 ? (
              <div className="space-y-2">
                {repostersData.items.map((user) => {
                  const displayName = user.displayName || user.username || user.address?.slice(0, 8) || 'Unknown';
                  const avatarUrl = user.avatarImageUrl
                    ? (user.avatarImageUrl.startsWith('http') ? user.avatarImageUrl : `https://api.dehub.io/${user.avatarImageUrl}`)
                    : undefined;
                  return (
                    <button
                      key={user.address}
                      onClick={() => {
                        if (user.username) {
                          navigate(`/${user.username.replace('@', '')}`);
                        } else if (user.address) {
                          navigate(`/app/profile?id=${user.address}`);
                        }
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
                    >
                      <Avatar className="w-10 h-10 rounded-lg">
                        {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                        <AvatarFallback className="bg-zinc-800 text-white rounded-lg text-sm">
                          {displayName[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white text-sm truncate">{displayName}</span>
                          <NewMemberChip address={user.address} />
                        </div>
                        {user.username && (
                          <span className="text-zinc-500 text-xs truncate block">@{user.username.replace('@', '')}</span>
                        )}
                      </div>
                      {user.address?.toLowerCase() !== walletAddress?.toLowerCase() && (() => {
                        const isUserFollowed =
                          followOverrides.get(user.address?.toLowerCase() ?? '') ?? !!user.isFollowing;
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!walletAddress) return;
                              // Optimistic flip via the shared store — no spinner,
                              // no list refetch; rollback + toast handled inside.
                              toggleFollowFor(queryClient, user.address, isUserFollowed, {
                                silent: true,
                              });
                            }}
                            className={cn(
                              "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                              isUserFollowed
                                ? "bg-zinc-800 text-white hover:bg-red-500/20 hover:text-red-400"
                                : "bg-white/10 text-white hover:bg-white/20"
                            )}
                          >
                            {isUserFollowed ? 'Following ✓' : 'Follow'}
                          </button>
                        );
                      })()}
                    </button>
                  );
                })}
              </div>
            ) : (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-zinc-500 text-sm text-center flex items-center justify-center h-full min-h-[200px]"
              >
                No reposts yet
              </motion.p>
            )}
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="absolute inset-0 overflow-y-auto pt-2 pb-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredGroupedComments.length > 0 ? (
                  filteredGroupedComments.map(({ comment, replies }) => (
                    <div key={comment.id}>
                      <CommentItem
                        comment={comment}
                        tokenId={tokenId}
                        onLike={handleLike}
                        onShowLikers={setLikersCommentId}
                        onDislike={handleDislike}
                        onReply={handleReply}
                        onShare={() => {}}
                        onEdit={handleEditComment}
                        onDelete={handleDeleteComment}
                        onTip={handleTip}
                        tipTotal={commentTips?.[comment.id]}
                        onUserPress={handleUserPress}
                        isOwnComment={comment.address?.toLowerCase() === walletAddress?.toLowerCase()}
                        onAnchor={canAnchor ? handleAnchor : undefined}
                        isThreadEntry={
                          !comment.replyToId &&
                          !!postAuthorAddress &&
                          comment.address?.toLowerCase() === postAuthorAddress.toLowerCase()
                        }
                      />
                      {replies.map(({ comment: reply, depth }) => (
                        <CommentItem
                          key={reply.id}
                          comment={reply}
                          tokenId={tokenId}
                          onLike={handleLike}
                          onShowLikers={setLikersCommentId}
                          onDislike={handleDislike}
                          onReply={handleReply}
                          onShare={() => {}}
                          onEdit={handleEditComment}
                          onDelete={handleDeleteComment}
                          onTip={handleTip}
                          tipTotal={commentTips?.[reply.id]}
                          onUserPress={handleUserPress}
                          isReply
                          depth={depth}
                          isOwnComment={reply.address?.toLowerCase() === walletAddress?.toLowerCase()}
                        />
                      ))}
                    </div>
                  ))
                ) : (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-zinc-500 text-sm text-center flex items-center justify-center h-full min-h-[200px]"
                  >
                    {searchQuery ? 'No results found' : 'No comments or quotes yet'}
                  </motion.p>
                )}
              </AnimatePresence>
            )}
            {loadMoreRow}
          </div>
        )}
      </div>

        {/* Composer, or a notice in its place when the creator turned replies
            off. The list above stays as-is on purpose: disabling comments hides
            no history, it only stops new ones. */}
        {commentsDisabled ? (
          <div data-comment-composer="off" className={cn("mt-auto", isMobile ? "pt-2 pb-1" : "pt-3")}>
            <div className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
              <MessageSquare className="w-4 h-4 text-zinc-500 shrink-0" />
              <span className="text-sm text-zinc-400">Comments are turned off for this post</span>
            </div>
          </div>
        ) : (
        <div data-comment-composer className={cn(
          "mt-auto",
          isMobile ? "pt-2 pb-1" : "pt-3"
        )}>
          {/* Reply indicator */}
          {replyTo && (
            <div
              data-comment-reply-tag
              className={cn(
                "flex items-center gap-1.5 px-3 bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-xl",
                isMobile ? "mb-1 py-1.5" : "mb-2 py-2"
              )}
            >
              <Reply className="w-3.5 h-3.5 text-zinc-400" />
              <span className={cn(
                "text-xs text-zinc-400",
                isMobile && "truncate max-w-[70%]"
              )}>
                Replying to @{replyTo.username}
              </span>
              <button 
                onClick={handleClearReply}
                className="ml-auto text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Voice note preview with visualizer */}
          {voiceNote && (
            <div className="mb-3 w-full md:max-w-[320px] rounded-xl overflow-hidden bg-zinc-800">
              <AudioVisualizer
                audioUrl={voiceNote.url}
                isPlaying={isPlayingPreview}
                onPlayPause={togglePreviewPlayback}
                className="w-full h-32"
                showStylePicker={true}
              />
              <div className="flex items-center justify-between px-3 py-2 bg-zinc-800">
                <span className="text-xs text-zinc-400">{voiceNote.duration}s voice note</span>
                <button
                  onClick={removeVoiceNote}
                  className="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            </div>
          )}

          {/* Image preview */}
          {commentImagePreview && (
            <div className="mb-3 relative inline-block">
              <img 
                src={commentImagePreview} 
                alt="Comment attachment" 
                className="max-h-32 rounded-xl object-cover"
              />
              <button
                onClick={removeCommentImage}
                data-keep-dark
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-lg flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />

          <div className={cn("flex flex-col gap-1.5", isMobile ? "pb-0 mt-1" : "pb-1 mt-[18px]")}>
            {isRecording ? (
              /* Recording indicator */
              <div data-comment-recording className="flex-1 flex items-center gap-2 bg-red-500/10 rounded-xl px-4 h-10">
                <div data-live-pulse className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-red-400 flex-1">{recordingTime}s / {MAX_VOICE_DURATION}s</span>
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-medium"
                >
                  <Square className="w-3 h-3 fill-current" />
                  Stop
                </button>
              </div>
            ) : (
            <div
                data-vaul-no-drag
                data-comment-field
                data-expanded={isInputExpanded || undefined}
                /* War dresses this as a chamfered HUD well; the hook is inert
                   under every other theme. See war-comments.css section 2. */
                data-war-cut="sm"
                className={cn(
                  "w-full flex backdrop-blur-xl border rounded-xl relative transition-all duration-200",
                  isInputExpanded
                    ? "items-start flex-col px-3"
                    : "items-center flex-row px-3 pr-1 gap-1.5",
                  isMobile
                    ? "bg-zinc-800/80 border-zinc-700"
                    : "bg-white/[0.08] border-white/[0.12]",
                  isInputExpanded
                    ? (isMobile ? "min-h-[88px]" : "min-h-[96px]")
                    : "min-h-0 h-10"
                )}>
                <textarea
                  ref={inputRef}
                  data-vaul-no-drag
                  placeholder={replyTo ? `Reply to @${replyTo.username}...` : 'Type here...'}
                  value={newComment}
                  onChange={(e) => {
                    setNewComment(e.target.value);
                    mention.handleInput(e.target.value, e.target.selectionStart ?? undefined);
                  }}
                  onFocus={() => setIsInputExpanded(true)}
                  onBlur={() => {
                    // Collapse only if empty and no attachments
                    if (!newComment.trim() && !voiceNote && !commentImage && !replyTo) {
                      setTimeout(() => {
                        setIsInputExpanded(false);
                        if (inputRef.current) inputRef.current.style.height = '';
                      }, 150);
                    }
                  }}
                  className={cn(
                    "flex-1 bg-transparent text-white text-sm resize-none focus:outline-none placeholder:text-zinc-500 w-full",
                    isInputExpanded
                      ? cn("pt-2.5 pb-12 pr-1", isMobile ? "min-h-[72px] max-h-[144px]" : "min-h-[84px] max-h-[160px]")
                      : "self-center h-5 min-h-5 py-0 leading-5 overflow-hidden pr-0"
                  )}
                  rows={isInputExpanded ? 3 : 1}
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
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (canPost) handlePostComment();
                    } else if (e.key === 'Escape') {
                      handleClearReply();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  onInput={(e) => {
                    if (!isInputExpanded) return;
                    const target = e.target as HTMLTextAreaElement;
                    const maxHeight = isMobile ? 144 : 160;
                    requestAnimationFrame(() => {
                      target.style.height = 'auto';
                      target.style.height = Math.min(target.scrollHeight, maxHeight) + 'px';
                    });
                  }}
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
                {/* Buttons - inline when collapsed, bottom-right when expanded */}
                <div className={cn(
                  "flex items-center gap-1.5",
                  isInputExpanded
                    ? "absolute bottom-2 right-2"
                    : "shrink-0 ml-1"
                )}>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    data-comment-tool="image"
                    className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-lg text-zinc-400 hover:text-white transition-colors"
                    aria-label="Attach image"
                  >
                    <ImagePlus className="w-4 h-4" />
                  </button>
                  {!voiceNote && (
                    <button
                      onClick={startRecording}
                      data-comment-tool="mic"
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-lg text-zinc-400 hover:text-red-400 transition-colors"
                      aria-label="Record voice note"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { if (canPost) handlePostComment(); }}
                    disabled={!canPost}
                    data-comment-send
                    className="h-8 px-3 rounded-lg text-xs font-medium transition-colors flex-shrink-0 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10"
                  >
                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Post'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Tip a comment's author. One modal for the whole section, aimed at
            whichever comment's gem was tapped. */}
        <TipModal
          open={!!tipComment}
          onOpenChange={(open) => { if (!open) setTipComment(null); }}
          creatorAddress={tipComment?.address}
          creatorName={tipComment ? (tipComment.displayName || tipComment.username) : undefined}
          tokenId={tokenId}
          commentId={tipComment?.id}
        />

        {/* Who liked one of the viewer's own comments. One drawer for the
            whole section, aimed at whichever comment's like button was tapped. */}
        <CommentLikersDrawer
          open={!!likersCommentId}
          onOpenChange={(open) => { if (!open) setLikersCommentId(null); }}
          commentId={likersCommentId}
        />
    </motion.div>
    </PostCreatorContext.Provider>
  );
}
