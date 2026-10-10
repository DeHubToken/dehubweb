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

import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, createContext, useContext, lazy, Suspense, memo } from 'react';
import { useDragTabIndicator } from '@/hooks/use-drag-tab-indicator';
import { saveDraft, loadDraft, clearDraft, type CommentDraft } from '@/lib/comment-draft-cache';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { formatTimeAgo, formatCount } from '@/lib/feed-utils';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { X, Search, ThumbsUp, MessageSquare, Quote, ArrowUpDown, Mic, Square, Play, Pause, Trash2, Share2, Repeat2, Link, Loader2, Reply, Pencil, Check, ImagePlus, Languages, Anchor, Eye, Baby, Pin, PinOff, Flag, Sparkles, Handshake, SpellCheck, Palette, Gauge, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation as useI18n } from 'react-i18next';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';
import { registerOffDocumentMedia } from '@/lib/pause-media-in';
import { useFocusComment } from '@/lib/focus-comment';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { AI_STYLE_OPTIONS } from '@/constants/ai-styles.constants';
import { TranslatableText, useTranslation } from '../TranslatableText';
import { BannedAccountNotice } from '@/components/app/BannedAccountNotice';
import { useBannedAccount } from '@/hooks/use-banned-account';
import { DehubLinkEmbeds, useDehubLinks } from '@/components/app/cards/DehubLinkEmbedsLazy';
import { FeedLinkPreviews } from '@/components/app/cards/FeedLinkPreviews';
import { AssetRefCards, useAssetRefsInText } from '@/components/app/cards/AssetRefCards';
import { AppState } from '@/components/app/AppState';
/** Lazy for the same reason VideoCard is: the visualizer only appears once a
 *  voice note has been recorded, and it drags ~50 KB of canvas painters. */
const AudioVisualizer = lazy(() =>
  import('../audio/AudioVisualizer').then((m) => ({ default: m.AudioVisualizer }))
);
import { checkImpersonation } from '@/lib/impersonation';
import { useAuth } from '@/contexts/AuthContext';
import { useBookBoost, useSuperpowers } from '@/hooks/use-superpowers';
import { BadgedName } from '@/components/app/BadgedName';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import { useIsMobile } from '@/hooks/use-mobile';
import { getNFTCommentPage, postComment, reactToComment, editComment, deleteComment, addImageComment, addGifComment, addVoiceComment, getPostReposters, recordCommentViews, getPostQuotes, getNFTInfo, pinComment, type ApiCommentResponse } from '@/lib/api/dehub';
import {
  applyReactionDelta,
  isPositiveReaction,
  reactionForThumbTap,
  reactionMeta,
  reconcileReactionCounts,
  resolveThumbReaction,
  type PostReaction,
  type ReactionCounts,
} from '@/lib/reactions';
import { ReactionEmoji } from './ReactionEmoji';
import { ReactionPicker } from './ReactionPicker';
import { useReactionTray } from '@/hooks/use-reaction-tray';
import { dehubLinkFor } from '@/lib/dehub-links';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { useCommentTips } from '@/hooks/use-comment-tips';
import { TipGemIcon } from './TipGemIcon';
import { subscribePostTipped, commentTipKey } from '@/lib/tip-events';
import { useAuthorThread } from '@/hooks/use-author-thread';
import { TipModal } from '@/components/app/modals/TipModal';
import { ReportModal } from '@/components/app/modals/ReportModal';
import { CommentLikersDrawer } from './CommentLikersDrawer';
import { FullscreenImageViewerLazy } from './FullscreenImageViewerLazy';
import { toast } from 'sonner';
import { createVoiceRecorder, voiceRecordingBlob, VOICE_RECORDING_SECONDS } from '@/lib/voice-recording';
import { emitCommentCreated, emitCommentsDeleted } from '@/lib/comment-count-events';
import { useMention } from '@/hooks/use-mention';
import { useAssistantPendingReply } from '@/hooks/use-assistant-pending-reply';
import { ASSISTANT_AVATAR, mentionsAssistant, isAssistantAddress } from '@/lib/assistant';
import { UserMentionDropdown } from '@/components/app/mentions';
import { mapApiComment, type Comment, type VoiceNote } from '@/lib/comment-mapper';
import { EmojiGifPicker } from '@/components/app/chat/EmojiGifPicker';
import { hasUnresolvedParent, previewReplies, recordCreatorLifts } from '@/lib/comment-threading';
import { usePostDiscussionSettings, useCommonGroundCompletion } from '@/hooks/use-post-discussion-settings';
import { useConversationCoach, COACH_MIN_CHARS } from '@/hooks/use-conversation-coach';
import { useCoachEnabled } from '@/hooks/use-coach-enabled';
import { CoachSuggestions } from './CoachSuggestions';
import { CommonGroundSheet } from './CommonGroundSheet';

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
   * The post is published for children, so its thread is a Kids Mode room:
   * only a Kids Mode session may write in it. Presentation only — the server
   * refuses the write either way (KidsCommentGuard), and the list is filtered
   * server-side too, so an adult reading here sees the thread as it stands.
   */
  forKids?: boolean;
  /**
   * Post author's wallet address. Set ONLY where the host page renders those
   * comments itself as the author thread above the card: straight comments
   * (top-level, no parentId) written by this address are hidden from the list
   * here so they exist exactly once. Leave unset everywhere else — feed cards
   * have no thread block, and hiding without showing would lose comments.
   */
  postAuthorAddress?: string;
  /**
   * Fires whenever the composer goes from empty to holding something unsent,
   * and back. The host sheet uses it to refuse to close mid-sentence — see
   * CommentsWrapper. Must be stable; it is an effect dependency.
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Laid out on the dedicated post page: no box and no scroll of its own. The
   * list runs full width in the page's own scroll, the tab row pins under the
   * chrome and the composer pins to the bottom of the screen, the way the app's
   * post screen lays out its comments. See the "Post page comments" block in
   * index.css for the pin offsets.
   */
  page?: boolean;
  /**
   * The phone post page ("Stage"), on top of `page`: no tab strip. A plain
   * "Comments N" header with sort (and search) replaces it; quotes and
   * reposts are reached from the repost sheet and shown here with a way
   * back. The composer docks to the bottom of the screen as liquid glass.
   */
  stage?: boolean;
  /** The post's comment total, for the stage header. */
  stageCount?: number;
  /** Tells the host which list the stage is showing, so it can reopen one. */
  onStageTabChange?: (tab: 'replies' | 'quotes' | 'reposts' | 'search') => void;
}

/**
 * Rebuild the "Replying to @x" target from a stored draft.
 *
 * Only the id and the username were worth persisting — the id is what the
 * server needs as `parentId` and the username is all the composer's chip
 * shows — so the rest of the shape is filled in with blanks. Nothing reads
 * them: this object never reaches the list, only the composer.
 */
function draftReplyTarget(draft: CommentDraft | null): Comment | null {
  if (!draft?.parentId) return null;
  return {
    id: draft.parentId,
    username: draft.parentUsername || '',
    text: '',
    likes: 0,
    dislikes: 0,
    views: 0,
    timeAgo: '',
    createdAt: new Date(draft.updatedAt),
  };
}

/**
 * The three orders the header's sort toggle steps through, as translation
 * keys. `short` is the word beside the icon — one word, because it shares a
 * row with the four tabs on a 360px phone — and `sortedBy` is the full
 * sentence for the tooltip and for the button's accessible name, which is all
 * a screen reader gets in the narrow panel where the word is hidden.
 */
const SORT_OPTIONS = [
  { value: 'recent', short: 'comments.sortRecent', sortedBy: 'comments.sortedByRecent' },
  { value: 'oldest', short: 'comments.sortOldest', sortedBy: 'comments.sortedByOldest' },
  { value: 'liked', short: 'comments.sortLiked', sortedBy: 'comments.sortedByLiked' },
] as const;

type SortOrder = (typeof SORT_OPTIONS)[number]['value'];

/** The comment tabs, in header order, with the name each icon-only tab is read out as. */
const COMMENT_TABS = [
  { value: 'replies', label: 'comments.tabReplies' },
  { value: 'quotes', label: 'comments.tabQuotes' },
  { value: 'reposts', label: 'comments.tabReposts' },
  { value: 'search', label: 'comments.tabSearch' },
] as const;

/**
 * The row's `onShare`, which nothing reads — sharing is the row's own menu.
 * Hoisted so every row gets the same function: an inline `() => {}` was a new
 * prop on every render, which alone was enough to re-render every row.
 */
const NOOP_SHARE = () => {};

/**
 * A callback whose identity never changes but which always runs the latest
 * render's version of `fn`.
 *
 * The row handlers read half the section's state — the loaded comments, the
 * vote overrides, the viewer — so a useCallback over them would still get a
 * new identity on nearly every render, and each new identity re-renders every
 * memoised row. Reading `fn` through a ref keeps the prop the rows see fixed
 * while the body still sees current state. The ref is written in a layout
 * effect rather than during render, so a render React throws away never leaks
 * into it; the handlers only ever run from events, after that effect lands.
 */
function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

// Threading itself is unlimited — the server happily accepts a reply to a reply
// at any depth. Nesting is NOT drawn as indentation: every reply sits flush
// with its parent and the thread line through the avatars carries the
// relationship, so a deep chain costs no width. `depth` survives only as
// reading order.
//
// How many replies a thread shows before it needs a tap to open up.
const REPLIES_SHOWN_COLLAPSED = 1;

/**
 * Hit area for the 16px icons on a comment's action row.
 *
 * The icons are `w-4 h-4` with no padding, which is a 16px target — half the
 * size a finger can reliably land on, and small enough with a mouse that the
 * reply control was routinely missed. The negative margin cancels the padding
 * in the layout, so every icon stays exactly where it was and only the
 * clickable box grows.
 */
const COMMENT_ACTION_HIT = '-m-2 p-2';

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
  /** Cast a specific one of the ten — what the hold-open trays route to. */
  onReact: (id: string, reaction: PostReaction) => void;
  onReply: (id: string) => void;
  onShare: (id: string) => void;
  onEdit: (id: string, newContent: string) => void;
  /** Ask to delete. The section confirms first — see its delete dialog. */
  onDelete: (id: string) => void;
  onTip: (id: string) => void;
  /** DHB already tipped to this comment, shown beside the gem when > 0. */
  tipTotal?: number;
  /** This viewer has tipped this comment before. */
  viewerTipped?: boolean;
  onUserPress: (username: string) => void;
  isReply?: boolean;
  /** Draw the thread line up out of this row's avatar to the one above it. */
  threadLineAbove?: boolean;
  /** Draw the thread line down out of this row's avatar to the one below it. */
  threadLineBelow?: boolean;
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
   * Pin this comment to the top of the thread, or undefined when this viewer
   * cannot. Set only for the post's own creator, and only on a top-level
   * comment — the server refuses both cases anyway, and resolving it once in
   * the section keeps the control off rows where it would only ever fail.
   */
  onPin?: (commentId: string) => void;
  /**
   * Straight comment by the post author on their own post — its permalink is
   * the thread-entry sub-URL (/posts/<tokenId>/b/<id>) rather than ?comment=.
   */
  isThreadEntry?: boolean;
  /** The comment a notification or a shared link pointed at — ringed. */
  highlighted?: boolean;
  /**
   * Report this comment to moderation, or undefined when the viewer is not
   * signed in. Never offered on the viewer's own comment — the server refuses
   * a self-report, so the row does not show a door that only ever fails.
   */
  onReport?: (commentId: string) => void;
}

interface VoiceNotePlayerProps {
  voiceNote: VoiceNote;
}

function VoiceNotePlayer({ voiceNote }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /**
   * The element is never put in the document — the button is the only part of
   * this player on screen. PersistentPageCache pauses a page's media by walking
   * its subtree, so it could not see this one at all: a voice note started here
   * played on through every later navigation. Registering it against the button
   * is what puts it on that page's books.
   */
  const unregisterMediaRef = useRef<(() => void) | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) {
      const el = new Audio(voiceNote.url);
      el.onended = () => setIsPlaying(false);
      unregisterMediaRef.current = registerOffDocumentMedia(el, () => buttonRef.current);
      audioRef.current = el;
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
      unregisterMediaRef.current?.();
      unregisterMediaRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <button
      ref={buttonRef}
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

/**
 * Memoised because the composer lives in the same component as the list: every
 * keystroke re-renders the section, and without this every row in the thread —
 * each with its own translation, link-embed and reaction-tray hooks — re-rendered
 * with it. That only holds while every prop is stable across a keystroke: the
 * section passes its handlers through useStableCallback, the no-op share as a
 * module constant, and the per-row figures (tip total, tipped, highlighted) as
 * primitives. A new inline function here would quietly undo all of it.
 */
const CommentItem = memo(function CommentItem({ comment, tokenId, onLike, onShowLikers, onReact, onReply, onShare, onEdit, onDelete, onTip, tipTotal, viewerTipped, onUserPress, isReply, threadLineAbove, threadLineBelow, isOwnComment, isThreadEntry, onAnchor, onPin, highlighted, onReport }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Bumps each time this viewer tips this comment, replaying the gem swirl.
  const [tipBurst, setTipBurst] = useState(0);
  useEffect(() => {
    const key = commentTipKey(comment.id);
    return subscribePostTipped((id) => { if (id === key) setTipBurst((n) => n + 1); });
  }, [comment.id]);
  const [editText, setEditText] = useState(comment.text);
  const [imageFullscreen, setImageFullscreen] = useState(false);
  const avatarUrl = isAssistantAddress(comment.address) ? ASSISTANT_AVATAR : comment.avatar;
  const i18n = useI18n();
  const translation = useTranslation(comment.text || '', true, undefined, true);
  const shownName = comment.displayName || comment.username;
  // Still on its way to the server, under a placeholder id nothing else knows.
  // Every action on the row was aimed at that id: a reply to it went out as
  // parent Number('temp-…'), i.e. NaN, and posted as a top-level comment; a
  // like, edit or delete was simply refused. The real row replaces it the
  // moment the post lands, so until then it offers nothing.
  const isPending = comment.id.startsWith('temp-');

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

  // One tray on the thumbs-up, holding every reaction with 👎 last — the same
  // tray a feed card's action bar has. Off on your own comment: its button is
  // the door to the likers list, and every reaction the tray could cast there
  // would be refused.
  const likeTray = useReactionTray(!isOwnComment);

  /** The glyph the thumbs-up wears — yours (a 👎 included), else the thread's most-used. */
  const myHeldReaction = isOwnComment
    ? null
    : comment.myReaction ?? (comment.isDisliked ? 'dislike' : null);
  const leadReaction = isOwnComment
    ? null
    : resolveThumbReaction(comment.reactionCounts, myHeldReaction);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex items-start gap-3 py-3 cursor-pointer"
      data-comment-id={comment.id}
      /*
        Tap the comment to answer it.

        The reply control was a bare 16px icon with no label, sharing a row with
        five other 16px icons, and it is the only way to attach a comment to the
        one above it. New readers did not find it: they answered in the big
        "Type here…" box at the bottom instead, which posts a top-level comment,
        and the conversation came out as a pile of unconnected remarks. Every
        reply on the platform that did thread carries the "@name " prefix this
        handler writes; the ones that read like replies and are not, don't.

        So the row itself is the target. Anything interactive inside it — the
        avatar, the name, a link, a menu, the edit box, an image that opens
        full size — keeps its own behaviour, and a drag that selected text is
        not a tap.
      */
      onClick={(e) => {
        if (isEditing || isPending) return;
        const target = e.target as HTMLElement;
        // `role="menuitem"` and the app's own `data-no-navigate` are here for
        // the same reason as the tags: they are interactive and they are not a
        // tap on the row. Radix renders a menu item as a div, not a button, and
        // portals it — but React events still bubble through a portal to this
        // handler, so picking "Copy link" or "Report" from a comment's ⋯ menu
        // also opened a reply and replaced whatever was half-typed in the
        // composer with "@name ".
        if (target.closest(
          'button, a, img, input, textarea, select, [role="button"], [role="menuitem"], [contenteditable="true"], [data-no-navigate]',
        )) return;
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        onReply(comment.id);
      }}
    >
      {/* Thread line. Replies sit at the same left edge as their parent — no
          indent — and the line through the avatars is what says "these belong
          together".

          Both segments are positioned against the ROW, not the avatar: a row is
          as tall as its text column, which is far taller than the 32px avatar,
          so anchoring the downward one to the avatar box left it stopping ~40px
          above the next row and the line came out in disconnected stubs. Run
          each segment to the row's own top or bottom edge instead and
          neighbouring rows meet exactly. The avatar is opaque and paints over
          the middle, so the line reads as leaving its rim. `left-4` is the
          avatar's centre: 32px wide, flush with the row's left edge. */}
      {threadLineAbove && (
        <span aria-hidden className="absolute left-4 -ml-px top-0 h-7 w-px bg-white/20" />
      )}
      {threadLineBelow && (
        <span aria-hidden className="absolute left-4 -ml-px top-7 bottom-0 w-px bg-white/20" />
      )}
      {/* The avatar is a picture and nothing else, so without a label a screen
          reader announced it as a bare "button". */}
      <button
        onClick={() => onUserPress(comment.username)}
        className="relative flex-shrink-0"
        aria-label={i18n.t('feed.viewProfile', { name: shownName })}
      >
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
              badgeLock={comment.badgeLock}
              username={comment.username}
              className="font-semibold text-white text-base max-w-[140px] leading-5"
            >
              {shownName}
            </BadgedName>
          </button>
          {isCreator && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.12] border border-white/[0.12] text-[10px] font-semibold text-white/75 leading-none flex-shrink-0">
              {i18n.t('postInfo.creator')}
            </span>
          )}
          {/* Why this comment is at the top. Without it a pinned comment just
              looks like the newest one, and the creator's choice reads as an
              accident of ordering. */}
          {comment.isPinned && (
            <span
              title={i18n.t('comments.pinnedByCreator', 'Pinned by the creator')}
              className="px-1.5 py-0.5 rounded-md bg-white/[0.12] border border-white/[0.12] text-[10px] font-semibold text-white/75 leading-none flex-shrink-0 inline-flex items-center gap-0.5"
            >
              <Pin className="w-2.5 h-2.5" />
              {i18n.t('comments.pinnedBadge', 'Pinned')}
            </span>
          )}
          {/* Same name, different account. Said plainly, and never by hiding
              the comment — the reader decides, this only removes the doubt. */}
          {isImpersonating && (
            <span
              title={i18n.t('comments.notCreatorTitle')}
              className="px-1.5 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-[10px] font-semibold text-red-300 leading-none flex-shrink-0"
            >
              {i18n.t('comments.notCreator')}
            </span>
          )}
          {/* A creator already carries the "Creator" chip above — pairing it
              with "New here" is redundant and just crowds the name. */}
          {!isCreator && <NewMemberChip address={comment.address} />}
          {/* The bot comments under a normal account, so without this it is
              indistinguishable from a user who picked the handle. */}
          {isAssistantAddress(comment.address) && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.12] border border-white/[0.12] text-[10px] font-semibold text-white/75 leading-none flex-shrink-0">
              {i18n.t('editor.rail.agent')}
            </span>
          )}
          {comment.displayName && (
            <span data-war-readout className="text-zinc-500 text-[13px] leading-5 truncate max-w-[110px]">@{comment.username}</span>
          )}
          <span data-war-readout className="text-zinc-500 text-[13px] leading-5">{comment.timeAgo}</span>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-zinc-500"
              autoFocus
              onKeyDown={(e) => {
                // An IME confirms its candidate with Enter, and that keystroke
                // is the composition ending, not the edit being saved — Safari
                // reports it as keyCode 229 with isComposing already false.
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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
              aria-label={i18n.t('common.save')}
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setEditText(comment.text); setIsEditing(false); }}
              className="text-zinc-400 hover:text-white transition-colors"
              aria-label={i18n.t('common.cancel')}
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
              <TranslatableText publicContent
                text={commentDisplayText}
                className={cn("text-zinc-300 text-base leading-6 break-words", highlighted && "reply-text-glow")}
                as="p"
                hideControls
                auto={false}
              />
            )}
            <DehubLinkEmbeds links={commentLinks} />
            <FeedLinkPreviews text={commentBody} />
            <AssetRefCards refs={commentAssetRefs} />
            {comment.imageUrl && (
              <>
                <img
                  src={comment.imageUrl}
                  alt={i18n.t('comments.imageAlt')}
                  className="mt-1.5 rounded-lg max-w-[240px] max-h-[200px] object-contain cursor-zoom-in"
                  onClick={() => setImageFullscreen(true)}
                  loading="lazy"
                />
                {/* The app's own viewer rather than a new browser tab: it
                    portals to the body, so it covers the whole page even from
                    inside the comments drawer, and closing it returns to the
                    thread instead of a tab showing a bare image URL. */}
                <FullscreenImageViewerLazy
                  images={[comment.imageUrl]}
                  initialIndex={0}
                  isOpen={imageFullscreen}
                  onClose={() => setImageFullscreen(false)}
                />
              </>
            )}
            {comment.voiceNote && (
              <div className="mt-1">
                <VoiceNotePlayer voiceNote={comment.voiceNote} />
              </div>
            )}
          </>
        )}
        {/* Hidden rather than removed on a pending row, so the row keeps its
            height and nothing jumps when the real one replaces it. */}
        <div
          className={cn("flex items-center justify-between mt-2", isPending && "invisible")}
          aria-hidden={isPending || undefined}
        >
          <div className="flex items-center gap-4">
            {/* You can't like your own comment — for the author this same
                button opens the likers list instead, count included even at 0
                so the door is visible. On anyone else's, hold it (or hover on
                desktop) for every reaction, 👎 last, and a tap casts whichever
                one the thumb is wearing — or takes back a 👎 it is wearing. No tray on your own comment, because
                every reaction it could cast would be refused. */}
            <span className="relative flex items-center gap-1" {...likeTray.areaProps}>
              <ReactionPicker
                open={likeTray.open}
                current={comment.myReaction ?? null}
                counts={comment.reactionCounts}
                onSelect={(reaction) => { likeTray.close(); onReact(comment.id, reaction); }}
                onClose={likeTray.close}
                align="left"
              />
              <button
                onClick={() => {
                  if (likeTray.consumePress()) return;
                  if (isOwnComment) { onShowLikers(comment.id); return; }
                  onLike(comment.id);
                }}
                {...likeTray.buttonProps}
                className={cn(
                  COMMENT_ACTION_HIT,
                  "flex items-center gap-1 transition-colors select-none touch-none",
                  !isOwnComment && (comment.isLiked || comment.isDisliked) ? "text-white" : "text-white/70 hover:text-white"
                )}
                aria-label={isOwnComment
                  ? i18n.t('comments.seeWhoLiked')
                  : i18n.t('comments.holdToReact', { reaction: reactionMeta(leadReaction ?? 'like').label })}
                aria-haspopup={isOwnComment ? undefined : 'menu'}
                aria-expanded={isOwnComment ? undefined : likeTray.open}
              >
                {leadReaction ? (
                  <span data-engaged-glyph className="w-4 h-4 flex items-center justify-center text-sm leading-none" aria-hidden="true">
                    <ReactionEmoji reaction={leadReaction} animate={leadReaction === myHeldReaction} />
                  </span>
                ) : (
                  <ThumbsUp className={cn("w-4 h-4", !isOwnComment && comment.isLiked && "fill-current")} />
                )}
                {(comment.likes > 0 || isOwnComment) && <span className="text-xs">{comment.likes}</span>}
              </button>
            </span>
            {/* Every comment is replyable, replies included — threads nest without limit. */}
            <button
              onClick={() => onReply(comment.id)}
              className={cn(COMMENT_ACTION_HIT, "text-white hover:text-zinc-400 transition-colors")}
              aria-label={i18n.t('features.replyToComment')}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            {/* Tip the comment's author. Rendered for own comments too so the
                author sees what the comment has earned; the payment hook
                already refuses self-tips. */}
            <button
              onClick={() => onTip(comment.id)}
              className={cn(COMMENT_ACTION_HIT, "flex items-center gap-1 text-white hover:text-zinc-400 transition-colors")}
              aria-label={i18n.t('comments.tip')}
            >
              <TipGemIcon tipped={!!viewerTipped || tipBurst > 0} burstKey={tipBurst} className="w-4 h-4" plainClassName="" />
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
                className={cn(COMMENT_ACTION_HIT, "text-white hover:text-zinc-400 transition-colors")}
                aria-label={i18n.t('comments.anchorAction')}
                title={i18n.t('comments.anchorTitle')}
              >
                <Anchor className="w-4 h-4" />
              </button>
            )}
            {/*
              The creator's pin, beside the anchor because they are the two
              halves of the same idea: this one is free, permanent and the
              THREAD owner's, the anchor is paid, fifteen minutes and the
              comment author's. Shown only to the post's creator, and only on a
              top-level comment — the section resolves both, so the control
              never appears where the server would refuse it.
            */}
            {onPin && !isEditing && (
              <button
                onClick={() => onPin(comment.id)}
                className={cn(
                  COMMENT_ACTION_HIT,
                  'transition-colors',
                  comment.isPinned ? 'text-white' : 'text-white hover:text-zinc-400',
                )}
                aria-label={comment.isPinned
                  ? i18n.t('comments.unpinAction', 'Remove pin')
                  : i18n.t('comments.pinAction', 'Pin to the top')}
                title={comment.isPinned
                  ? i18n.t('comments.unpinAction', 'Remove pin')
                  : i18n.t('comments.pinAction', 'Pin to the top')}
              >
                {comment.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </button>
            )}
            {isOwnComment && !isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className={cn(COMMENT_ACTION_HIT, "text-white hover:text-zinc-400 transition-colors")}
                  aria-label={i18n.t('common.edit')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(comment.id)}
                  className={cn(COMMENT_ACTION_HIT, "text-white hover:text-red-400 transition-colors")}
                  aria-label={i18n.t('common.delete')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(COMMENT_ACTION_HIT, "text-white hover:text-zinc-400 transition-colors")}
                  aria-label={i18n.t('comments.share')}
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
                    toast.success(i18n.t('comments.linkCopied'));
                  }}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Link className="w-4 h-4" />
                  {i18n.t('postOptions.copyLink')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => toast.info(i18n.t('toasts.repost_from_comments_coming_soon'))}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Repeat2 className="w-4 h-4" />
                  {i18n.t('comments.repost')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(comment.text);
                    toast.success(i18n.t('comments.textCopied'));
                  }}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Quote className="w-4 h-4" />
                  {i18n.t('comments.copyText')}
                </DropdownMenuItem>
                {onReport && !isOwnComment && (
                  <DropdownMenuItem
                    onClick={() => onReport(comment.id)}
                    className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                  >
                    <Flag className="w-4 h-4" />
                    {i18n.t('comments.reportComment')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {comment.text && !translation.isTooShort && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => translation.isTranslated ? translation.handleShowOriginal() : translation.handleTranslate()}
                    className={cn(
                      COMMENT_ACTION_HIT,
                      "transition-colors",
                      translation.isLoading ? "text-white/60" : 
                      translation.isTranslated ? "text-white" : "text-white hover:text-zinc-400"
                    )}
                    aria-label={i18n.t('comments.translate')}
                    disabled={translation.isLoading}
                  >
                    {translation.isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Languages className="w-4 h-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{translation.isTranslated ? i18n.t('common.showOriginal') : i18n.t('comments.translate')}</TooltipContent>
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
                aria-label={i18n.t('comments.viewCount', { count: comment.views })}
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
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommentsSection({ tokenId, onClose, initialTab, embedded = false, commentsDisabled = false, forKids = false, postAuthorAddress, onDirtyChange, page = false, stage = false, stageCount, onStageTabChange }: CommentsSectionProps) {
  // A kids post's thread is open to Kids Mode only. The post's own author is
  // exempt server-side, but they are also the one person who can always reach
  // it, so there is nothing to show them here.
  const isKidsMode = useKidsModeLock();
  const kidsOnlyThread = forKids && !isKidsMode;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, walletAddress } = useAuth();
  const { isBanned: accountBanned } = useBannedAccount();
  const isMobile = useIsMobile();
  // A soft keyboard's return key is a bare Enter — there is no Shift to hold —
  // so on touch it has to mean "new line", and Post becomes the only way to
  // send. Hardware keyboards keep Enter = send, Shift+Enter = new line.
  const enterSends = useMemo(
    () => !isMobile && !window.matchMedia?.('(pointer: coarse)').matches,
    [isMobile],
  );

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

  // Common Ground mode: a creator-side switch kept in Supabase and only
  // honoured when the row's creator is this post's minter (see
  // lib/discussion-settings). Off while the composer is off — nothing to gate.
  const { commonGround } = usePostDiscussionSettings(tokenId, postCreator?.address, !commentsDisabled);
  const { isDone: commonGroundDone, markDone: markCommonGroundDone } = useCommonGroundCompletion(tokenId);
  const [commonGroundOpen, setCommonGroundOpen] = useState(false);
  // The tone check on the draft. Destructured because the hook's callbacks
  // are stable and the object is not.
  const coachEnabled = useCoachEnabled();
  const { status: coachStatus, flags: coachFlags, check: coachCheck, dismiss: coachDismiss, reset: coachReset } = useConversationCoach();

  // The ids the host page's author-thread block has already rendered above the
  // card. Same query key as <AuthorThread>, so this is its cached answer rather
  // than a second request, and the two surfaces can never disagree about which
  // comments belong where.
  const { entryIds: authorThreadIds } = useAuthorThread(
    postAuthorAddress ? tokenId : undefined,
    postAuthorAddress,
    walletAddress,
  );

  /**
   * The comment a notification (or a shared link) pointed at, when this
   * section is the one showing that post. Everything below hangs off it: the
   * page-0 fetch pins it, the thread it sits in opens, the row is ringed and
   * scrolled to, and until the reader asks for the rest it is the only thread
   * on screen — a long post's other two hundred comments are not what they
   * came for and paying to render them is what made this feel like a dead end.
   */
  const focusCommentId = useFocusComment(tokenId);
  const { t } = useI18n();
  // On the phone post page the composer docks to the screen. It is portalled
  // to <body> because canvas themes put filters/transforms on the page frame,
  // which would turn `position: fixed` into "fixed to that frame".
  const dockComposer = (el: React.ReactElement) =>
    stage && typeof document !== 'undefined' ? createPortal(el, document.body) : el;
  /** Cleared by "Show all comments", and by arriving with nothing to focus. */
  const [showAllThreads, setShowAllThreads] = useState(!focusCommentId);
  useEffect(() => {
    setShowAllThreads(!focusCommentId);
  }, [focusCommentId]);

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
  const [sortBy, setSortBy] = useState<SortOrder>('recent');
  const sortOption = SORT_OPTIONS.find(option => option.value === sortBy) ?? SORT_OPTIONS[0];
  // Whatever was left unsent last time, restored whole: the text, the reply it
  // was aimed at and a GIF. Read once here rather than in each initialiser so
  // the three can't disagree.
  const [restoredDraft] = useState(() => loadDraft(tokenId));
  const [newComment, setNewComment] = useState(() => restoredDraft?.text ?? '');
  const [aiRewriting, setAiRewriting] = useState(false);
  const [aiMenu, setAiMenu] = useState<'closed' | 'open' | 'vibes'>('closed');
  const aiRewrite = async (mode: 'grammar' | 'style', style?: string) => {
    const text = newComment.trim();
    if (!text || aiRewriting) return;
    setAiMenu('closed');
    setAiRewriting(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-text', { body: { text, mode, style } });
      if (error || !data?.enhancedText) throw error ?? new Error(data?.error);
      setNewComment(data.enhancedText);
    } catch {
      toast.error(t('conversation.coach.rewriteFailed'));
    } finally {
      setAiRewriting(false);
    }
  };
  const [replyTo, setReplyTo] = useState<Comment | null>(() => draftReplyTarget(restoredDraft));
  const [tipComment, setTipComment] = useState<Comment | null>(null);
  // Which of the viewer's own comments has its likers drawer open.
  const [likersCommentId, setLikersCommentId] = useState<string | null>(null);
  /** Root comment ids whose full reply thread the reader has opened. */
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(() => new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A ref closes the gap before React commits isSubmitting, including the
  // pointer-down + click pair used by the touch composer below.
  const submitInFlightRef = useRef(false);
  const [optimisticComments, setOptimisticComments] = useState<Comment[]>([]);
  // Optimistic delete/edit overlays — applied instantly in allComments below,
  // reverted if the server call fails.
  //
  // Every override below carries `base`: the API row it was made against. It
  // only stands while that row is still the one the query holds — see
  // `overrideStands` in allComments.
  const [deletedCommentIds, setDeletedCommentIds] = useState<Set<string>>(new Set());
  const [editOverrides, setEditOverrides] = useState<
    Map<string, { text: string; base?: ApiCommentResponse }>
  >(new Map());
  /**
   * Which comment the creator just pinned or unpinned, before the refetch
   * confirms it. `null` means "no override, read the server". One per post,
   * so a single target rather than a map.
   */
  const [pinOverride, setPinOverride] = useState<
    { id: string; pinned: boolean; base?: ApiCommentResponse } | null
  >(null);
  // Track reaction state overrides for optimistic updates. Every field is
  // optional so a like tap never clobbers a dislike count it didn't touch.
  const [likeOverrides, setLikeOverrides] = useState<
    Map<
      string,
      {
        isLiked?: boolean;
        isDisliked?: boolean;
        myReaction?: PostReaction | null;
        likes?: number;
        dislikes?: number;
        reactionCounts?: ReactionCounts;
        base?: ApiCommentResponse;
      }
    >
  >(new Map());
  
  // Voice note recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeRef = useRef(0);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  /** The preview's claim on this page — see {@link VoiceNotePlayer} above. */
  const unregisterPreviewRef = useRef<(() => void) | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null);
  // A GIF is already hosted (GIPHY), so unlike commentImage it needs no
  // upload step — just the URL, carried straight through to comment_image.
  const [commentGifUrl, setCommentGifUrl] = useState<string | null>(restoredDraft?.gifUrl ?? null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // A restored draft opens the composer already expanded: the collapsed well is
  // one line tall, so anything longer would come back apparently truncated.
  const [isInputExpanded, setIsInputExpanded] = useState(() => Boolean(restoredDraft?.text));
  const mention = useMention({
    inputRef,
    onMentionInsert: (_user, newText) => setNewComment(newText),
  });

  /**
   * Grow the composer a line at a time.
   *
   * Two things had to change for this to do anything at all. The field used to
   * be `flex-1` inside the well, i.e. `flex-basis: 0` — which throws away the
   * height set here and pins the field to the well's `min-h`, so it stayed
   * three lines tall forever and every line past the third scrolled out of
   * sight. And `height: auto` on a textarea resolves to its `rows` height, so
   * measuring at `rows={3}` set a floor under the first two lines of growth.
   * The field is `rows={1}` and sizes itself now; the well follows it.
   */
  const composerMaxHeight = isMobile ? 140 : 180;
  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!isInputExpanded) {
      el.style.height = '';
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, composerMaxHeight)}px`;
  }, [isInputExpanded, composerMaxHeight]);

  // Re-measure on every value change, not just keystrokes: the reply prefill,
  // an emoji, and a restored draft all arrive without an input event.
  useLayoutEffect(resizeInput, [resizeInput, newComment]);

  // Persist the whole composer on every keystroke, GIF and change of reply
  // target. One entry per post, so switching reply target carries the text
  // over instead of filing it under a key nothing reads again.
  useEffect(() => {
    saveDraft(tokenId, {
      text: newComment,
      parentId: replyTo?.id,
      parentUsername: replyTo?.username,
      gifUrl: commentGifUrl ?? undefined,
    });
  }, [newComment, tokenId, replyTo?.id, replyTo?.username, commentGifUrl]);

  // Something unsent in the box. The host sheet reads this to refuse to close
  // mid-sentence; an unmount reports clean so a closed sheet can't latch it on.
  const hasUnsentContent = Boolean(
    newComment.trim() || voiceNote || commentImage || commentGifUrl,
  );
  useEffect(() => {
    onDirtyChange?.(hasUnsentContent);
  }, [hasUnsentContent, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const MAX_VOICE_DURATION = VOICE_RECORDING_SECONDS;

  /**
   * Every comment tip on this post, in one query, plus the five best-tipped
   * ids. Read before the comments themselves because those ids are part of
   * what is asked for: the API floats them onto page 0 so a well-tipped
   * comment deep in a long thread still leads it.
   *
   * On a thread with no tipped comments — which is most of them — the id list
   * is empty, the query parameter is left off entirely, and nothing about the
   * request changes.
   */
  const { data: commentTips } = useCommentTips(tokenId);
  const topTippedIds = commentTips.topTippedIds;
  const topTippedKey = topTippedIds.join(',');

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
    isPlaceholderData,
  } = useInfiniteQuery({
    // topTippedKey is in the key because it changes what the server returns.
    // It arrives one tick after the comments on a thread that has tipped
    // comments — the tip query has to resolve first — so those threads
    // refetch once and settle, and again after a tip reorders the top five.
    // Threads with none (nearly all of them) keep the empty key they started
    // with and never refetch.
    queryKey: ['comments', tokenId, walletAddress, focusCommentId ?? null, topTippedKey],
    queryFn: ({ pageParam }) =>
      getNFTCommentPage(
        tokenId,
        pageParam as number,
        COMMENTS_PAGE_SIZE,
        walletAddress?.toLowerCase(),
        // Only page 0: the server pins the comment there and backfills its
        // ancestors, so one request holds the linked row however deep in the
        // thread it sits.
        pageParam === 0 ? focusCommentId : undefined,
        // Every page, unlike the link above. The server sorts by these ids on
        // every page, not just the first, so a page 1 asked for without them
        // was cut from a differently ordered list: comments at the seam
        // between the two pages were skipped or shown twice.
        topTippedIds,
      ),
    initialPageParam: 0,
    // The server's own answer. Counting rows is not one: a deleted linked
    // comment is dropped from page 0, so a full page came back one short and
    // paging stopped for good.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length : undefined,
    // A new key — tip data arriving, or any tip afterwards — used to blank the
    // list to a spinner until the refetch landed. Keep what is on screen
    // meanwhile, but only for this post: another post's thread is never a
    // placeholder for this one.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === tokenId ? previous : undefined,
    staleTime: 30000,
  });
  /**
   * Every loaded row once, in page order.
   *
   * The same comment can arrive twice: the API appends a linked comment's
   * backfilled ancestors to page 0, and the linked comment itself comes round
   * again on whichever later page it really sits. The first one wins, which
   * is the one placed where the reader was sent.
   */
  const apiComments = useMemo(() => {
    if (!commentPages) return undefined;
    const seen = new Set<string>();
    const rows: ApiCommentResponse[] = [];
    for (const page of commentPages.pages) {
      for (const row of page.items) {
        const id = String(row.id);
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push(row);
      }
    }
    return rows;
  }, [commentPages]);
  const apiRowsById = useMemo(
    () => new Map((apiComments ?? []).map(row => [String(row.id), row])),
    [apiComments],
  );

  // Threads the creator answered, ranked as the API first delivered them.
  // Sticky per comment — see recordCreatorLifts for why a refetch can't move one.
  const creatorLiftSeenRef = useRef(new Set<string>());
  const creatorLiftedRef = useRef(new Set<string>());
  const creatorLiftRanks = useMemo(
    () => recordCreatorLifts(apiComments, creatorLiftSeenRef.current, creatorLiftedRef.current),
    [apiComments],
  );

  /**
   * Pull the pages a loaded reply's parent is sitting on.
   *
   * The API hands back a flat window of comments newest-first, so a reply can
   * easily arrive on page 0 while the comment it answers is on page 2. The
   * grouping below promotes such a reply to a root rather than dropping it, so
   * it rendered as a plain top-level comment with no connection to what it was
   * answering — on a busy post the same author's "👍" appeared three times in a
   * row, apparently addressed to nobody. A missing parent is always older than
   * its reply, so it is always on a later page: keep pulling until every loaded
   * reply has its parent.
   *
   * Bounded, because a reply whose parent was deleted has no page to find and
   * would otherwise walk the whole comment history on every open.
   */
  const MAX_AUTO_PAGES = 5;
  useEffect(() => {
    // Not on a placeholder: those pages belong to the previous key, and
    // paging past them would be asking the new one for page 2 before page 1.
    if (!apiComments?.length || !hasNextPage || isFetchingNextPage || isPlaceholderData) return;
    // Nothing but the linked thread is on screen yet, and the server already
    // backfilled that thread's ancestors — so walking up to four more pages
    // here would be a hundred comments fetched to render one. It resumes the
    // moment the reader asks for the rest.
    if (focusCommentId && !showAllThreads) return;
    if ((commentPages?.pages.length ?? 0) >= MAX_AUTO_PAGES) return;
    if (hasUnresolvedParent(apiComments)) fetchNextPage();
  }, [apiComments, commentPages, hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage, focusCommentId, showAllThreads]);

  const loadMoreRow = !isLoading && !error && hasNextPage ? (
    <div className="flex justify-center py-3">
      <button
        type="button"
        onClick={() => fetchNextPage()}
        disabled={isFetchingNextPage || isPlaceholderData}
        className="px-4 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
      >
        {isFetchingNextPage ? t('common.loading') : t('common.loadMore')}
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

    /**
     * Does an override still speak for this row, or has the server since?
     *
     * They used to stand for the life of the section, so a liked comment kept
     * the count from the moment of the tap while the real one moved on. React
     * Query hands back the same row object when a refetch brings it back
     * unchanged and a new one when anything on it moved, so a different
     * object means fresh server data, and that wins. Comparing a timestamp
     * with the query's `dataUpdatedAt` cannot tell this: "Load more" bumps it
     * without refetching the page the row is on.
     */
    const overrideStands = (id: string, base: ApiCommentResponse | undefined) =>
      base === apiRowsById.get(id);

    // Apply overrides: optimistic deletes hide rows instantly, optimistic
    // edits swap text instantly — both reconcile with the background refetch.
    return combined
      .filter(c => !deletedCommentIds.has(c.id))
      .map(c => {
        const edit = editOverrides.get(c.id);
        const vote = likeOverrides.get(c.id);
        let result = c;
        if (edit && overrideStands(c.id, edit.base)) result = { ...result, text: edit.text };
        if (vote && overrideStands(c.id, vote.base)) {
          const { base: _base, ...fields } = vote;
          result = { ...result, ...fields };
        }
        // The pin moves instantly. It is one per post, so the override is a
        // single id rather than a map — and it has to clear the flag on every
        // OTHER row, not just set it on this one, or the comment that held
        // the pin a moment ago keeps its badge until the refetch lands.
        if (pinOverride && overrideStands(pinOverride.id, pinOverride.base)) {
          result = { ...result, isPinned: pinOverride.pinned && result.id === pinOverride.id };
        }
        return result;
      });
  }, [apiComments, apiRowsById, optimisticComments, likeOverrides, deletedCommentIds, editOverrides, pinOverride]);

  // Tagging @assistant produces a real comment, but only once the model has
  // answered — several seconds after the post returns. This keeps a placeholder
  // in the thread and polls until the reply lands.
  const { isWaiting: isAssistantReplying, arm: armAssistantReply } = useAssistantPendingReply(
    tokenId,
    allComments,
  );

  // Record comment views when visible (#9)
  const sectionRef = useRef<HTMLDivElement>(null);
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
    // This section's own rows, not every row in the document.
    //
    // Two sections can be mounted at once — a feed card with comments open
    // beside the desktop shorts panel, or the panel and its fullscreen rail —
    // and each keeps a separate viewedIdsRef. A document-wide query had each
    // one observing the other's rows, so one scroll past a comment recorded a
    // view from both.
    const root = sectionRef.current;
    if (!root) return;

    const observeRows = (within: ParentNode) =>
      within.querySelectorAll('[data-comment-id]').forEach(el => observer.observe(el));
    observeRows(root);

    // Rows that appear later. The effect is keyed on the fetched page, so
    // replies revealed by "show more" were never picked up and never counted
    // until something refetched.
    const watcher = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches('[data-comment-id]')) observer.observe(node);
          observeRows(node);
        });
      }
    });
    watcher.observe(root, { childList: true, subtree: true });

    return () => {
      watcher.disconnect();
      observer.disconnect();
    };
  }, [apiComments]);

  // Group comments into threads. Nesting is unbounded: a reply can have replies,
  // which can have replies, and so on — each root carries every descendant
  // flattened in reading order with its depth, so the list renders in one pass.
  const groupedComments = useMemo<CommentThread[]>(() => {
    const byId = new Map(allComments.map(c => [c.id, c]));
    const childrenOf = new Map<string, Comment[]>();
    const roots: Comment[] = [];

    // The comments the host page has already rendered as the author thread above
    // the card — drop them here so each one exists exactly once. useAuthorThread
    // owns that rule and this reads its answer, so the two can never disagree
    // about a comment and show it twice or nowhere. It only ever contains the
    // author's opening continuation, so nothing that belongs beside another
    // comment is taken out of this list.
    const isAuthorThreadEntry = (c: Comment) => authorThreadIds.has(c.id);

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
  }, [allComments, authorThreadIds]);

  /**
   * The root of the thread the linked comment sits in, once it has loaded.
   *
   * Undefined while the fetch is in flight, and undefined for good if the
   * comment was deleted between the notification being written and the tap —
   * which is what makes the narrowing below fail open rather than showing an
   * empty list.
   */
  const focusThreadId = useMemo(() => {
    if (!focusCommentId) return undefined;
    return groupedComments.find(
      ({ comment, replies }) =>
        comment.id === focusCommentId || replies.some(({ comment: r }) => r.id === focusCommentId),
    )?.comment.id;
  }, [groupedComments, focusCommentId]);

  // A thread shows one reply until asked; a linked reply is usually not that
  // one, so open its thread or the row nobody was sent to is the row on screen.
  useEffect(() => {
    if (!focusThreadId) return;
    setExpandedThreads(prev => (prev.has(focusThreadId) ? prev : new Set(prev).add(focusThreadId)));
  }, [focusThreadId]);

  /** Set on unmount, so a recorder that finishes afterwards touches no state. */
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      // Closing the sheet mid-recording left the microphone live: the timer
      // stopped, but nothing stopped the recorder or released its stream, so
      // the browser kept recording — indicator and all — with no section left
      // to stop it from.
      const recorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      if (recorder) {
        if (recorder.state !== 'inactive') recorder.stop();
        recorder.stream.getTracks().forEach(track => track.stop());
      }
      unregisterPreviewRef.current?.();
      unregisterPreviewRef.current = null;
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
        playbackAudioRef.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Closed while the permission prompt was up: hand the microphone
      // straight back rather than start a recording nothing can stop.
      if (unmountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const mediaRecorder = createVoiceRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        // Stopped by the unmount cleanup: there is no composer left to take
        // the note, and an object URL minted now would only leak.
        if (unmountedRef.current) return;
        const blob = voiceRecordingBlob(chunksRef.current, mediaRecorder.mimeType);
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setVoiceNote({ url, duration: recordingTimeRef.current });
        }
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
      mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      console.error('Failed to start recording:', err);
      toast.error(t('stages.micUnreachable'));
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

  /**
   * Drop the composer's preview player.
   *
   * It is built once, on the first play, from whichever note was there at the
   * time — so kept past that note, the next recording's play button replayed
   * the old one. Called whenever the note leaves the composer.
   */
  const releasePreviewAudio = () => {
    unregisterPreviewRef.current?.();
    unregisterPreviewRef.current = null;
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
    }
    setIsPlayingPreview(false);
  };

  const removeVoiceNote = () => {
    releasePreviewAudio();
    if (voiceNote) {
      URL.revokeObjectURL(voiceNote.url);
      setVoiceNote(null);
    }
  };

  const acceptCommentImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(t('toasts.please_select_an_image_file'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('comments.imageTooLarge'));
      return;
    }
    setCommentGifUrl(null);
    setCommentImage(file);
    setCommentImagePreview(URL.createObjectURL(file));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    acceptCommentImage(file);
  };

  // Pasting a screenshot is the fastest way to answer with a picture, and the
  // textarea would otherwise swallow it silently. Only claim the paste when
  // the clipboard carries no text — a rich copy brings its images along and
  // the words are what was meant.
  const handleCommentPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.getData('text/plain')) return;
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    setIsInputExpanded(true);
    acceptCommentImage(file);
  };

  const removeCommentImage = () => {
    if (commentImagePreview) {
      URL.revokeObjectURL(commentImagePreview);
    }
    setCommentImage(null);
    setCommentImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleCommentEmojiSelect = (emoji: string) => {
    const newVal = newComment + emoji;
    setNewComment(newVal);
    mention.handleInput(newVal, newVal.length);
    inputRef.current?.focus();
  };

  const handleCommentGifSelect = (gifUrl: string) => {
    removeCommentImage();
    setCommentGifUrl(gifUrl);
    setIsInputExpanded(true);
  };

  const removeCommentGif = () => setCommentGifUrl(null);

  const togglePreviewPlayback = () => {
    if (!voiceNote) return;

    if (!playbackAudioRef.current) {
      const el = new Audio(voiceNote.url);
      el.onended = () => setIsPlayingPreview(false);
      // Anchored on the section root rather than a button: the composer's own
      // preview outlives every row in the list, because an unsent draft keeps
      // it alive across a tab switch.
      unregisterPreviewRef.current = registerOffDocumentMedia(el, () => sectionRef.current);
      playbackAudioRef.current = el;
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

  /**
   * Showing the linked thread on its own, with the rest a tap away.
   *
   * Only on the replies tab, and only while the linked comment is actually in
   * the list: a search is a different question, and a comment that has since
   * been deleted must not leave the reader staring at nothing.
   */
  const focusOnlyThread = activeTab === 'replies' && !showAllThreads && !!focusThreadId;

  // Filter and sort comments
  const filteredGroupedComments = useMemo(() => {
    let filtered = groupedComments;

    if (focusOnlyThread) {
      return groupedComments.filter(({ comment }) => comment.id === focusThreadId);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = groupedComments.filter(
        ({ comment, replies }) =>
          comment.text.toLowerCase().includes(query) ||
          comment.username.toLowerCase().includes(query) ||
          replies.some(({ comment: r }) => r.text.toLowerCase().includes(query) || r.username.toLowerCase().includes(query))
      );
    }

    /**
     * Three things sit above whatever order the reader picked, and they are
     * read in this order:
     *
     *   0. the creator's pinned comment — theirs, free, one per post;
     *   1. a paid Comment Anchor, while its window is still open;
     *   2. the five best-tipped comments, most tipped first.
     *
     * Applied on top of Recent / Oldest / Most Liked rather than as another
     * option beside them: a pin is the creator saying "read this one", and it
     * has to hold whichever way the reader sorted. The API sorts the same way,
     * and this list re-sorts client-side on every tab and search — which is
     * exactly how a bought anchor used to lose the top of the thread the
     * moment the page it arrived on was rendered.
     *
     * Under those, on Recent only, the threads the creator has answered, most
     * recently answered first. Oldest and Most Liked are the reader asking for
     * a specific order, and a ranking signal has no business overriding it.
     */
    const now = Date.now();
    const lift = ({ comment }: CommentThread) => {
      if (comment.isPinned) return 0;
      if (comment.anchoredUntil && comment.anchoredUntil.getTime() > now) return 1;
      const tipped = topTippedIds.indexOf(comment.id);
      if (tipped !== -1) return 2 + tipped;
      const answered = sortBy === 'recent' ? creatorLiftRanks.get(comment.id) : undefined;
      return answered === undefined ? Number.MAX_SAFE_INTEGER : 2 + topTippedIds.length + answered;
    };

    return [...filtered].sort((a, b) => {
      const lifted = lift(a) - lift(b);
      if (lifted !== 0) return lifted;
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
  }, [groupedComments, searchQuery, sortBy, focusOnlyThread, focusThreadId, topTippedIds, creatorLiftRanks]);

  /**
   * Bring the linked comment into view once it has actually rendered.
   *
   * Once per id: a second pass would yank the list back under a reader who had
   * started scrolling. `scrollIntoView` walks every scrolling ancestor, which
   * is what also brings the comments panel itself up the page on the
   * standalone post route.
   */
  const scrolledToFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusCommentId || scrolledToFocusRef.current === focusCommentId) return;
    const root = sectionRef.current;
    if (!root) return;
    const row = root.querySelector(`[data-comment-id="${CSS.escape(focusCommentId)}"]`);
    if (!row) return;
    scrolledToFocusRef.current = focusCommentId;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusCommentId, filteredGroupedComments]);

  /**
   * The way out of the focused view. Sits where "Load more comments" would,
   * because it is the same question one step earlier.
   */
  const showAllCommentsRow = focusOnlyThread ? (
    <div className="flex justify-center py-3">
      <button
        type="button"
        onClick={() => setShowAllThreads(true)}
        className="px-4 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"
      >
        {t('comments.showAll', 'Show all comments')}
      </button>
    </div>
  ) : null;

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

  // Report a comment. The row hides the item on your own comments and when
  // signed out; this is the one door in for every other comment in the thread.
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  // Every handler below that a row receives as a prop goes through
  // useStableCallback: they are props on the memoised CommentItem, and a fresh
  // function per render would re-render the whole thread on every keystroke in
  // the composer.
  const handleReportComment = useStableCallback((commentId: string) => {
    if (!isAuthenticated) return;
    setReportCommentId(commentId);
  });

  const handleAnchor = useStableCallback((commentId: string) => {
    anchorComment.mutate(
      { tokenId: 0, power: 'comment_anchor', commentId },
      {
        onSuccess: booking =>
          toast.success(t('comments.anchoredToast', { count: booking.minutes })),
        // The server writes these sentences for a person to read.
        onError: (error: any) => toast.error(error?.message || t('comments.anchorFailed')),
      },
    );
  });

  /**
   * Pin a comment to the top of your own thread, or take the pin off.
   *
   * The creator's, free, one per post — the opposite side of the anchor above.
   * The override moves the badge and the row instantly; the refetch behind it
   * is what makes the change survive a reload, and a refusal puts the list
   * back exactly as it was.
   */
  const handlePinComment = useStableCallback(async (commentId: string) => {
    const wasPinned = allComments.find(c => c.id === commentId)?.isPinned === true;
    const previous = pinOverride;
    setPinOverride({ id: commentId, pinned: !wasPinned, base: apiRowsById.get(commentId) });
    try {
      const { pinned } = await pinComment(commentId);
      toast.success(
        pinned
          ? t('comments.pinnedToast', 'Pinned to the top of this post')
          : t('comments.unpinnedToast', 'Pin removed'),
      );
      await queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
    } catch (err: any) {
      setPinOverride(previous);
      toast.error(err?.message || t('comments.pinFailed', 'Could not pin that comment'));
    }
  });

  // Stable rather than useCallback over [navigate, onClose]: `onClose` is the
  // host's, and a host that passes an inline arrow would otherwise hand every
  // row a new prop on each of its renders.
  const handleUserPress = useStableCallback((username: string) => {
    onClose();
    navigate(`/${username}`);
  });

  /**
   * Cast one of the ten reactions on a comment.
   *
   * The single vote path for a comment row, the way ActionBar.handleReaction is
   * for a post — the plain thumbs below just pick which reaction a tap means.
   *
   * The optimistic arithmetic is the same three rules the server follows:
   * re-casting the reaction you already hold removes it, `likes`/`dislikes`
   * move only when the polarity changes, and the per-reaction split moves
   * every time. A comment reaction is worth one, never a badge weight — see
   * the note on the API's Comment model.
   */
  const handleReact = useStableCallback(async (commentId: string, reaction: PostReaction) => {
    if (!isAuthenticated) {
      toast.error(t('comments.logInToReact'));
      return;
    }

    const comment = allComments.find(c => c.id === commentId);
    if (!comment) return;

    // Your own comment's thumbs-up is the door to the likers list, not a vote
    // — so it offers no tray, and a positive reaction can only arrive here
    // from some other caller. Downvoting yourself was always allowed.
    if (
      walletAddress &&
      comment.address?.toLowerCase() === walletAddress.toLowerCase() &&
      isPositiveReaction(reaction)
    ) {
      setLikersCommentId(comment.id);
      return;
    }

    const previous =
      comment.myReaction ??
      (comment.isLiked ? 'like' : comment.isDisliked ? 'dislike' : null);
    const next: PostReaction | null = previous === reaction ? null : reaction;

    const wasPositive = previous ? isPositiveReaction(previous) : null;
    const nowPositive = next ? isPositiveReaction(next) : null;
    let likes = comment.likes;
    let dislikes = comment.dislikes;
    if (wasPositive !== nowPositive) {
      if (wasPositive === true) likes = Math.max(0, likes - 1);
      if (wasPositive === false) dislikes = Math.max(0, dislikes - 1);
      if (nowPositive === true) likes += 1;
      if (nowPositive === false) dislikes += 1;
    }

    const optimistic = {
      isLiked: nowPositive === true,
      isDisliked: nowPositive === false,
      myReaction: next,
      likes,
      dislikes,
      reactionCounts: applyReactionDelta(comment.reactionCounts, previous, next),
    };
    // The row this tap was made against. Both writes below carry it, so the
    // first refetch that brings the row back changed replaces them both.
    const base = apiRowsById.get(commentId);
    setLikeOverrides(prev => new Map(prev).set(commentId, { ...optimistic, base }));

    try {
      const result = await reactToComment({ commentId, reaction });
      setLikeOverrides(prev =>
        new Map(prev).set(commentId, {
          isLiked: result.liked,
          isDisliked: result.disliked,
          myReaction: result.currentReaction ?? null,
          likes: result.likes ?? optimistic.likes,
          dislikes: result.dislikes ?? optimistic.dislikes,
          reactionCounts: reconcileReactionCounts(
            result.likes ?? optimistic.likes,
            result.dislikes ?? optimistic.dislikes,
            (result.reactionCounts as ReactionCounts | undefined) ?? optimistic.reactionCounts,
          ),
          base,
        }),
      );
    } catch (error) {
      // Revert — the row goes back to whatever the last fetch said.
      setLikeOverrides(prev => {
        const next = new Map(prev);
        next.delete(commentId);
        return next;
      });
      toast.error(
        isPositiveReaction(reaction) ? t('comments.reactFailed') : t('comments.dislikeFailed'),
      );
    }
  });

  /**
   * A plain tap on the comment's thumbs-up.
   *
   * Casts whatever the thumb is WEARING, not always a 👍 — a comment leading
   * with 🔥 draws a 🔥 thumb, and tapping it has to mean that, or the button
   * lies about what it does. Same promise `reactionForTap` keeps on a post.
   * There is no thumbs-down beside it, so while the viewer holds a 👎 the
   * thumb wears that, and a tap takes it back.
   */
  const handleLike = useStableCallback((commentId: string) => {
    const comment = allComments.find(c => c.id === commentId);
    if (!comment) return;
    // Own comments can't be liked — their thumb shows who liked them instead.
    // CommentItem already routes there; this covers any other caller.
    if (walletAddress && comment.address?.toLowerCase() === walletAddress.toLowerCase()) {
      setLikersCommentId(comment.id);
      return;
    }
    const held = comment.myReaction ?? (comment.isDisliked ? 'dislike' : null);
    return handleReact(commentId, reactionForThumbTap(held, comment.reactionCounts));
  });

  const handleReply = useStableCallback((commentId: string) => {
    // A row still posting has no id the server knows — see CommentItem.
    if (commentId.startsWith('temp-')) return;
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
  });

  /**
   * Drop the reply target, keep what was typed — it posts as a top-level
   * comment instead. This used to blank the box as well, which meant the X on
   * the "Replying to" chip, and Escape in the field, both threw away a written
   * comment. That was load-bearing when drafts were stored per reply target
   * (clearing the target reloaded the top-level draft over it); one draft per
   * post now, so the text simply stays.
   */
  const handleClearReply = () => {
    setReplyTo(null);
  };

  const handleTip = useStableCallback((commentId: string) => {
    const found = allComments.find(c => c.id === commentId);
    if (found) setTipComment(found);
  });

  /** The comment whose trash button was tapped, waiting on the confirmation. */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleDeleteComment = async (commentId: string) => {
    // The server deletes the comment's whole reply subtree with it, so hide
    // all of it now. Hiding the comment alone promoted its replies to
    // top-level rows until the refetch, and the card's count has to come
    // down by every row that went.
    const childrenOf = new Map<string, string[]>();
    for (const c of allComments) {
      if (!c.replyToId) continue;
      const siblings = childrenOf.get(c.replyToId);
      if (siblings) siblings.push(c.id);
      else childrenOf.set(c.replyToId, [c.id]);
    }
    const removed = new Set<string>();
    const stack = [commentId];
    while (stack.length) {
      const id = stack.pop()!;
      if (removed.has(id)) continue;
      removed.add(id);
      stack.push(...(childrenOf.get(id) ?? []));
    }

    // Optimistic: hide the rows instantly, restore them if the server refuses.
    setDeletedCommentIds(prev => new Set([...prev, ...removed]));
    try {
      await deleteComment(commentId);
      // Rows still posting were never counted, so they come off nothing.
      emitCommentsDeleted(tokenId, [...removed].filter(id => !id.startsWith('temp-')).length);
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
    } catch (err) {
      setDeletedCommentIds(prev => {
        const next = new Set(prev);
        removed.forEach(id => next.delete(id));
        return next;
      });
      console.error('Delete comment error:', err);
      toast.error(t('toasts.failed_to_delete_comment'));
    }
  };

  const handleEditComment = useStableCallback(async (commentId: string, newContent: string) => {
    if (!newContent.trim()) return;
    // Optimistic: swap the text instantly, revert if the server refuses.
    setEditOverrides(prev =>
      new Map(prev).set(commentId, { text: newContent, base: apiRowsById.get(commentId) }),
    );
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
      toast.error(t('comments.editFailed'));
    }
  });

  const submitComment = useCallback(async () => {
    if ((!newComment.trim() && !voiceNote && !commentImage && !commentGifUrl) || isSubmitting || submitInFlightRef.current) return;

    if (!isAuthenticated || !user) {
      toast.error(t('toasts.please_log_in_to_comment'));
      return;
    }

    submitInFlightRef.current = true;
    const tempId = `temp-${Date.now()}`;
    const userAddress = user.address || user.wallet_address || '';
    const rawAvatarPath = extractAvatarPath(user);
    const resolvedAvatar = userAddress && rawAvatarPath 
      ? buildAvatarUrl(userAddress, rawAvatarPath) 
      : undefined;

    const tempComment: Comment = {
      id: tempId,
      username: user.username || t('comments.youFallback'),
      avatar: resolvedAvatar,
      text: newComment,
      likes: 0,
      dislikes: 0,
      // Nobody has scrolled past a comment that does not exist on the server
      // yet; the real count arrives with the refetch.
      views: 0,
      timeAgo: t('comments.justNow'),
      createdAt: new Date(),
      voiceNote: voiceNote || undefined,
      replyToId: replyTo?.id,
      address: userAddress,
    };

    setOptimisticComments(prev => [tempComment, ...prev]);
    const replyTarget = replyTo;
    // Your own reply has to land somewhere you can see it, so open the thread
    // it belongs to. Replying to a reply still means the root's thread.
    if (replyTo) {
      const root = groupedComments.find(
        thread => thread.comment.id === replyTo.id || thread.replies.some(({ comment: r }) => r.id === replyTo.id),
      );
      if (root) setExpandedThreads(prev => new Set(prev).add(root.comment.id));
    }
    const imageFile = commentImage;
    const gifUrl = commentGifUrl;
    const audioNote = voiceNote;
    const submittedText = newComment;
    clearDraft(tokenId);
    coachReset();
    setReplyTo(null);
    setNewComment('');
    setVoiceNote(null);
    // Not removeVoiceNote: the URL has to outlive this, to be put back if the
    // post fails. The player built on it goes now, though.
    releasePreviewAudio();
    removeCommentImage();
    removeCommentGif();
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
        // Thrown rather than returned: the refusal path below is what takes
        // the optimistic row back off the list and puts the draft back in the
        // composer. An early return here left both behind.
        if (audioBlob.size > 2 * 1024 * 1024) {
          throw new Error(t('comments.voiceNoteTooLarge'));
        }
        await addVoiceComment({
          tokenId: parseInt(tokenId, 10),
          audioFile: audioBlob,
          content: newComment || undefined,
          parentId: replyTarget?.id,
        });
      } else if (gifUrl) {
        // Already hosted on GIPHY's CDN — no upload step needed. This has to
        // be the dedicated GIF endpoint: /api/comment_image only ever looks
        // at an uploaded file, so a hosted URL posted through it would save
        // as a caption with no GIF attached.
        await addGifComment({
          tokenId: parseInt(tokenId, 10),
          content: newComment,
          gifUrl,
          parentId: replyTarget?.id,
        });
      } else if (imageFile) {
        // /api/comment_image only reads the image from an uploaded file, so
        // this has to go straight there as multipart/form-data — no separate
        // upload-then-post-URL step (that silently dropped the image, since
        // the backend never looks at a JSON imageUrl).
        await addImageComment({
          tokenId: parseInt(tokenId, 10),
          imageFile,
          content: newComment,
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
      emitCommentCreated(tokenId);
      setOptimisticComments(prev => prev.filter(c => c.id !== tempId));
      // Posted, and the row that played it from here is gone with the line
      // above: nothing reads the recording's object URL any more.
      if (audioNote) URL.revokeObjectURL(audioNote.url);
      // The refetch above is always too early for a tagged assistant — it has
      // to call the model first — so hand off to the poller.
      if (mentionsAssistant(newComment)) armAssistantReply();
    } catch (err) {
      setOptimisticComments(prev => prev.filter(c => c.id !== tempId));
      // Put the message back in the composer. The box was cleared the moment
      // Post was tapped, so a refusal used to destroy what the author wrote —
      // the one moment losing it hurts most. The image and the voice note are
      // still in this closure, which is the only place they can come back from
      // (an object URL means nothing to the next page load); the preview URL
      // was revoked with the old state, so mint a fresh one.
      setNewComment(submittedText);
      setReplyTo(replyTarget);
      setVoiceNote(audioNote);
      if (gifUrl) setCommentGifUrl(gifUrl);
      if (imageFile) {
        setCommentImage(imageFile);
        setCommentImagePreview(URL.createObjectURL(imageFile));
      }
      setIsInputExpanded(true);
      // The server's own words when it has them — a refusal explains itself
      // ("comments are turned off", a link that cannot be posted) and a
      // generic failure message would leave the author guessing.
      toast.error(err instanceof Error && err.message ? err.message : t('toasts.failed_to_post_comment'));
      console.error('Comment error:', err);
    } finally {
      setIsSubmitting(false);
      submitInFlightRef.current = false;
    }
  }, [newComment, voiceNote, commentImage, commentGifUrl, isSubmitting, isAuthenticated, user, replyTo, tokenId, queryClient, armAssistantReply, coachReset, t]);

  /**
   * What every Post control calls. On a Common Ground thread the first reply
   * of the session goes through the sheet first; the sheet's own Post button
   * then calls submitComment. The creator is never asked on their own post,
   * and the same guards as submitComment apply so an empty tap opens nothing.
   */
  const handlePostComment = useCallback(async () => {
    const hasContent = !!(newComment.trim() || voiceNote || commentImage || commentGifUrl);
    if (!hasContent || isSubmitting || submitInFlightRef.current) return;
    if (commonGround && !isOwnThread && !commonGroundDone()) {
      if (!isAuthenticated || !user) {
        toast.error(t('toasts.please_log_in_to_comment'));
        return;
      }
      setCommonGroundOpen(true);
      return;
    }
    await submitComment();
  }, [newComment, voiceNote, commentImage, commentGifUrl, isSubmitting, commonGround, isOwnThread, commonGroundDone, isAuthenticated, user, submitComment, t]);

  const handleCommonGroundConfirm = useCallback(() => {
    markCommonGroundDone();
    setCommonGroundOpen(false);
    void submitComment();
  }, [markCommonGroundDone, submitComment]);

  // A banned account reads every comment on DeHub and writes none of them.
  const canPost = !accountBanned && (newComment.trim() || voiceNote || commentImage || commentGifUrl) && !isSubmitting;

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

  /**
   * One root comment and its thread, collapsed to a single reply until asked.
   *
   * A busy post used to open with fifty rows of other people's back-and-forth
   * between the first comment and the second, so the list read as one argument
   * rather than as a set of comments. The rest are a tap away and stay open for
   * the life of the section.
   *
   * Both the replies tab and the search tab render threads, so this lives here
   * rather than being written twice.
   */
  const renderThread = ({ comment, replies }: CommentThread) => {
    // A search hit can be the reply itself — collapsing the thread would hide
    // the very row the query matched, so searching opens every thread.
    const isExpanded = expandedThreads.has(comment.id) || !!searchQuery.trim();
    const shown = isExpanded
      ? replies
      : previewReplies(replies, postCreator?.address, REPLIES_SHOWN_COLLAPSED);
    const hiddenCount = replies.length - shown.length;

    return (
      <div key={comment.id}>
        <CommentItem
          comment={comment}
          tokenId={tokenId}
          onLike={handleLike}
          onReact={handleReact}
          onShowLikers={setLikersCommentId}
          onReply={handleReply}
          onShare={NOOP_SHARE}
          onEdit={handleEditComment}
          onDelete={setPendingDeleteId}
          onTip={handleTip}
          tipTotal={commentTips.totals[comment.id]}
          viewerTipped={!!walletAddress && !!commentTips.tippers[comment.id]?.includes(walletAddress.toLowerCase())}
          onUserPress={handleUserPress}
          isOwnComment={comment.address?.toLowerCase() === walletAddress?.toLowerCase()}
          onAnchor={canAnchor ? handleAnchor : undefined}
          // Root comments only — a reply is sorted inside a subtree nothing
          // re-orders, so pinning one would move nothing.
          onPin={isOwnThread ? handlePinComment : undefined}
          threadLineBelow={shown.length > 0}
          isThreadEntry={authorThreadIds.has(comment.id)}
          highlighted={comment.id === focusCommentId}
          onReport={isAuthenticated ? handleReportComment : undefined}
        />
        {shown.map(({ comment: reply }, i) => (
          <CommentItem
            key={reply.id}
            comment={reply}
            tokenId={tokenId}
            onLike={handleLike}
            onReact={handleReact}
            onShowLikers={setLikersCommentId}
              onReply={handleReply}
            onShare={NOOP_SHARE}
            onEdit={handleEditComment}
            onDelete={setPendingDeleteId}
            onTip={handleTip}
            tipTotal={commentTips.totals[reply.id]}
            viewerTipped={!!walletAddress && !!commentTips.tippers[reply.id]?.includes(walletAddress.toLowerCase())}
            onUserPress={handleUserPress}
            isReply
            threadLineAbove
            // The line has to reach the "show more" row too, or it stops dead
            // above a control that belongs to the thread.
            threadLineBelow={i < shown.length - 1 || hiddenCount > 0}
            isOwnComment={reply.address?.toLowerCase() === walletAddress?.toLowerCase()}
            highlighted={reply.id === focusCommentId}
            onReport={isAuthenticated ? handleReportComment : undefined}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpandedThreads(prev => new Set(prev).add(comment.id))}
            // Hangs off the end of the thread line on an elbow, and its label
            // starts on the same 44px text column as every comment body.
            className="relative flex h-8 items-center pl-11 mb-1 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <span aria-hidden className="absolute left-4 -ml-px top-0 bottom-1/2 w-px bg-white/20" />
            <span aria-hidden className="absolute left-4 top-1/2 -mt-px w-5 h-px bg-white/20" />
            {hiddenCount === 1 ? t('features.showOneMoreReply') : t('features.showMoreReplies', { count: hiddenCount })}
          </button>
        )}
      </div>
    );
  };

  return (
    <PostCreatorContext.Provider value={postCreator}>
    <motion.div
      ref={sectionRef}
      data-comments-section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      data-comments-page={page || undefined}
      className={cn(
        page
          ? "flex flex-col relative"
          : isMobile
          ? "flex flex-col h-full px-2 pt-2 pb-2 relative"
          : embedded
            ? "flex flex-col h-full min-h-0 p-0 mt-0 relative"
            : "flex flex-col min-h-[400px] max-h-[600px] p-4 mt-3 relative"
      )}
    >

      {/* Tab Switcher - Left: Replies, Quotes, Search, Sort | Right: Like, Dislike, Bookmark, Share (desktop/tablet only) */}
      {stage ? (
        /* Stage header: the count, sort and search. Quotes and reposts open
           from the repost sheet and get a back arrow to the comments. */
        <div data-stage-comments-head className="flex items-center justify-between gap-2 pb-1 pt-3">
          {activeTab === 'quotes' || activeTab === 'reposts' ? (
            <button
              type="button"
              onClick={() => { setActiveTab('replies'); onStageTabChange?.('replies'); }}
              className="flex min-w-0 items-center gap-1.5 text-left"
              aria-label={t('postStage.backToComments', 'Back to comments')}
            >
              <ChevronLeft className="h-5 w-5 shrink-0" />
              <span data-stage-ink className="text-[17px] font-bold">
                {activeTab === 'quotes' ? t('postStage.quotes', 'Quotes') : t('postStage.reposts', 'Reposts')}
              </span>
            </button>
          ) : (
            <h2 data-stage-ink className="text-[17px] font-bold">
              {t('postStage.comments', 'Comments')}
              {typeof stageCount === 'number' && (
                <span data-stage-muted className="ml-1.5 font-semibold tabular-nums">{stageCount}</span>
              )}
            </h2>
          )}
          {activeTab !== 'quotes' && activeTab !== 'reposts' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-stage-chip
                data-active={activeTab === 'search' ? 'true' : undefined}
                onClick={() => {
                  const next = activeTab === 'search' ? 'replies' : 'search';
                  setActiveTab(next);
                  onStageTabChange?.(next);
                }}
                aria-label={t('comments.tabSearch')}
                className="flex h-8 w-8 items-center justify-center rounded-lg"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                type="button"
                data-stage-chip
                onClick={() => setSortBy(prev => prev === 'recent' ? 'oldest' : prev === 'oldest' ? 'liked' : 'recent')}
                aria-label={t(sortOption.sortedBy)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {t(sortOption.short)}
              </button>
            </div>
          )}
        </div>
      ) : (
      <div
        data-comment-tabs
        data-comment-tabs-pin={page || undefined}
        className={cn(
          "flex justify-between items-center gap-1",
          page ? "sticky top-0 z-20 -mx-2 sm:-mx-3 px-2 sm:px-3 py-2" : "mb-3"
        )}
      >
        {/* Mobile close button removed — drawer dismisses via drag-down or tapping overlay */}
        {false && (
          <button
            onClick={onClose}
            className="hidden"
            aria-label={t('comments.close')}
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
          {/* The tabs are icons only, so each carries its name and the row says
              it is a set of tabs — without either, a screen reader heard four
              unlabelled buttons and no hint of which one was open. */}
          <div className="relative z-20 flex gap-1" role="tablist" aria-label={t('postInfo.comments')}>
            {COMMENT_TABS.map(({ value: tab, label }) => (
              <button
                key={tab}
                ref={(el) => {
                  setCommentsTabRef(tab)(el);
                  commentsTabPositions.current[tab] = el;
                }}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-label={t(label)}
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
                // The full sentence, not the one word: below lg in the embedded
                // panel the word is hidden and a tooltip is invisible to a
                // screen reader, so this is the only name the button has there.
                aria-label={t(sortOption.sortedBy)}
                className={cn(
                  "py-1.5 flex items-center justify-center gap-1.5 transition-colors rounded-xl text-zinc-400 hover:text-white",
                  embedded ? "px-2" : "px-3"
                )}
              >
                <ArrowUpDown className="w-[17px] h-[17px]" />
                {/* In the narrow embedded panel the label only fits at lg+;
                    below that the icon + tooltip carry the meaning. */}
                <span className={cn("text-[11px]", embedded && "hidden lg:inline")}>{t(sortOption.short)}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{t(sortOption.sortedBy)}</TooltipContent>
          </Tooltip>
          {/* Collapse control for the inline expansion on feed cards. The
              embedded shorts side panel has nothing to close, so no X there. */}
          {!embedded && !page && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('comments.close')}
                  className="py-1.5 px-3 flex items-center justify-center transition-colors rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="w-[17px] h-[17px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('comments.close')}</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Duplicate post action buttons removed — already shown in ActionBar above */}
      </div>
      )}

      {/* Search Input - always rendered but hidden when not on search tab to maintain consistent height */}
      <div className={`mb-3 ${activeTab === 'search' ? 'visible' : 'invisible h-0 mb-0 overflow-hidden'}`}>
        <Input
          placeholder={t('comments.searchPlaceholder')}
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
          <div className={page ? "pb-2" : "absolute inset-0 overflow-y-auto pt-2 pb-2"}>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : error ? (
              <p className="text-zinc-500 text-sm py-6 text-center">{t('comments.loadFailed')}</p>
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
                    <span>{t('comments.assistantReplying')}</span>
                  </motion.div>
                )}
                {filteredGroupedComments.length > 0 ? (
                  filteredGroupedComments.map(renderThread)
                ) : (
                  <AppState icon="posts" title={t('comments.emptyRepliesTitle')} description={t('comments.emptyRepliesBody')} size="section" />
                )}
              </AnimatePresence>
            )}
            {showAllCommentsRow ?? loadMoreRow}
          </div>
        )}

        {/* Quotes Tab (#13) */}
        {activeTab === 'quotes' && (
          <div className={page ? "pb-2" : "absolute inset-0 overflow-y-auto pt-2 pb-2"}>
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
                    t('comments.unknownUser');
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
                          <BadgedName
                            badgeBalance={post.minterUser?.hideBadgeAndBalance ? 0 : post.minterUser?.badgeBalance}
                            lookupId={post.minter || post.minterUser?.address}
                            username={post.minterUser?.username || post.minterUsername}
                            className="font-semibold text-white text-sm"
                          >
                            {displayName}
                          </BadgedName>
                          <NewMemberChip address={post.minter || post.minterUser?.address} />
                        </div>
                        {preview && <span className="text-zinc-400 text-xs line-clamp-2 mt-0.5">{preview}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <AppState icon="posts" title={t('comments.emptyQuotesTitle')} description={t('comments.emptyQuotesBody')} size="section" />
            )}
          </div>
        )}

        {/* Reposts Tab */}
        {activeTab === 'reposts' && (
          <div className={page ? "pb-2" : "absolute inset-0 overflow-y-auto pt-2 pb-2"}>
            {isLoadingReposters ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : repostersData?.items && repostersData.items.length > 0 ? (
              <div className="space-y-2">
                {repostersData.items.map((user) => {
                  const displayName = user.displayName || user.username || user.address?.slice(0, 8) || t('comments.unknownUser');
                  const avatarUrl = buildAvatarUrl(user.address, extractAvatarPath(user));
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
                          <BadgedName
                            badgeBalance={user.hideBadgeAndBalance ? 0 : user.badgeBalance}
                            lookupId={user.address || user.username}
                            username={user.username}
                            className="font-semibold text-white text-sm"
                          >
                            {displayName}
                          </BadgedName>
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
                            {isUserFollowed ? `${t('follow.following')} ✓` : t('follow.follow')}
                          </button>
                        );
                      })()}
                    </button>
                  );
                })}
              </div>
            ) : (
              <AppState icon="subscriptions" title={t('comments.emptyRepostsTitle')} description={t('comments.emptyRepostsBody')} size="section" />
            )}
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className={page ? "pb-2" : "absolute inset-0 overflow-y-auto pt-2 pb-2"}>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredGroupedComments.length > 0 ? (
                  filteredGroupedComments.map(renderThread)
                ) : (
                  <AppState
                    icon={searchQuery ? 'search' : 'posts'}
                    title={searchQuery ? t('comments.searchEmptyTitle') : t('comments.emptySearchTabTitle')}
                    description={searchQuery ? t('comments.searchEmptyBody') : t('comments.emptySearchTabBody')}
                    kind={searchQuery ? 'search-empty' : 'empty'}
                    size="section"
                  />
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
              <span className="text-sm text-zinc-400">{t('comments.turnedOff')}</span>
            </div>
          </div>
        ) : kidsOnlyThread ? (
          /* Same shape as the notice above, and for a related reason: the
             thread is readable and not writable. Says WHY, because "nothing
             happens when I tap the box" is the alternative. */
          <div data-comment-composer="kids-only" className={cn("mt-auto", isMobile ? "pt-2 pb-1" : "pt-3")}>
            <div className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
              <Baby className="w-4 h-4 text-zinc-500 shrink-0" />
              <span className="text-sm text-zinc-400 text-center">
                {t('comments.kidsOnlyThread', 'This post is for kids. Only Kids Mode can comment on it.')}
              </span>
            </div>
          </div>
        ) : dockComposer(
        <div
          data-comment-composer
          data-comment-composer-pin={page || undefined}
          data-stage-composer={stage || undefined}
          className={cn(
            stage
              // Docked to the bottom of the screen for the whole page, over a
              // soft blurred fade (post-stage.css) so comments never read
              // through it. The bottom nav is hidden on this page.
              ? "fixed inset-x-0 bottom-0 z-[45] px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
              : page
              // The app's reply bar: full width, pinned to the bottom of the
              // screen while the thread is in view, released at its end.
              ? "sticky bottom-0 z-20 -mx-2 sm:-mx-3 px-2 sm:px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
              : "mt-auto",
            !page && (isMobile ? "pt-2 pb-1" : "pt-3")
          )}
        >
          {stage && <div data-stage-composer-fade aria-hidden="true" />}
          {/* Common Ground: say up front that the first reply goes through the
              steps, so the sheet is not a surprise when Post is tapped. */}
          {commonGround && !isOwnThread && (
            <div data-common-ground-banner className="mb-2 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <Handshake className="w-4 h-4 mt-0.5 shrink-0 text-zinc-300" />
              <p className="text-xs text-zinc-300">{t('conversation.commonGround.banner')}</p>
            </div>
          )}
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
                {t('features.replyingTo', { name: `@${replyTo.username}` })}
              </span>
              <button
                onClick={handleClearReply}
                className="ml-auto text-zinc-500 hover:text-white transition-colors"
                aria-label={t('comments.cancelReply')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Voice note preview with visualizer */}
          {voiceNote && (
            <div className="mb-3 w-full md:max-w-[320px] rounded-xl overflow-hidden bg-zinc-800">
              <Suspense fallback={<div className="w-full h-32 rounded-xl bg-black/40" />}>
                <AudioVisualizer
                  audioUrl={voiceNote.url}
                  isPlaying={isPlayingPreview}
                  onPlayPause={togglePreviewPlayback}
                  className="w-full h-32"
                  showStylePicker={true}
                />
              </Suspense>
              <div className="flex items-center justify-between px-3 py-2 bg-zinc-800">
                <span className="text-xs text-zinc-400">{t('comments.voiceNoteDuration', { duration: voiceNote.duration })}</span>
                <button
                  onClick={removeVoiceNote}
                  className="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('comments.remove')}
                </button>
              </div>
            </div>
          )}

          {/* Image preview */}
          {commentImagePreview && (
            <div className="mb-3 relative inline-block">
              <img 
                src={commentImagePreview} 
                alt={t('comments.imageAttachmentAlt')}
                className="max-h-32 rounded-xl object-cover"
              />
              <button
                onClick={removeCommentImage}
                aria-label={t('comments.removeImage')}
                data-keep-dark
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-lg flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* GIF preview */}
          {commentGifUrl && (
            <div className="mb-3 relative inline-block">
              <img
                src={commentGifUrl}
                alt={t('comments.gifAttachmentAlt')}
                className="max-h-32 rounded-xl object-cover"
              />
              <button
                onClick={removeCommentGif}
                aria-label={t('comments.removeGif')}
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

          <BannedAccountNotice variant="line" className="mt-2" />

          <div className={cn("flex flex-col gap-1.5", page ? "pb-0 mt-0" : isMobile ? "pb-0 mt-1" : "pb-1 mt-[18px]")}>
            {/* The coach's cards sit above the field. Advice only — Post stays
                live underneath, and "Post anyway" is the same call. */}
            <CoachSuggestions
              status={coachStatus}
              flags={coachFlags}
              onDismiss={coachDismiss}
              onClear={coachReset}
              onPostAnyway={canPost ? () => { void handlePostComment(); } : undefined}
            />
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
                  {t('comments.stopRecording')}
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
                    ? "items-stretch flex-col px-3 pb-2"
                    : "items-center flex-row px-3 pr-1 gap-1.5",
                  isMobile
                    ? "bg-zinc-800/80 border-zinc-700"
                    : "bg-white/[0.08] border-white/[0.12]",
                  // The expanded floor is the three-line resting size the field
                  // sizes itself to anyway — kept so a shorter field can never
                  // shrink the well under its own tool row.
                  isInputExpanded ? "min-h-[118px]" : "min-h-0 h-10"
                )}>
                <textarea
                  ref={inputRef}
                  data-vaul-no-drag
                  placeholder={replyTo ? t('comments.replyPlaceholder', { name: replyTo.username }) : t('comments.composerPlaceholder')}
                  value={newComment}
                  onChange={(e) => {
                    setNewComment(e.target.value);
                    mention.handleInput(e.target.value, e.target.selectionStart ?? undefined);
                  }}
                  onFocus={() => setIsInputExpanded(true)}
                  onBlur={() => {
                    // Collapse only if empty and no attachments
                    if (!newComment.trim() && !voiceNote && !commentImage && !commentGifUrl && !replyTo) {
                      setTimeout(() => {
                        setIsInputExpanded(false);
                        if (inputRef.current) inputRef.current.style.height = '';
                      }, 150);
                    }
                  }}
                  className={cn(
                    "bg-transparent text-white text-sm resize-none focus:outline-none placeholder:text-zinc-500 w-full min-w-0",
                    isInputExpanded
                      ? cn("shrink-0 pt-2.5 pb-1 pr-1 min-h-[74px]", isMobile ? "max-h-[140px]" : "max-h-[180px]")
                      : "flex-1 self-center h-5 min-h-5 py-0 leading-5 overflow-hidden whitespace-nowrap text-ellipsis pr-0"
                  )}
                  rows={1}
                  // The return key writes a line break on touch, so don't let the
                  // keyboard advertise itself as a send key there.
                  enterKeyHint={enterSends ? 'send' : 'enter'}
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
                    // keyCode 229 as well as isComposing: Safari ends an IME
                    // composition with an Enter whose isComposing is already
                    // false, and that keystroke is picking a candidate.
                    if (e.key === 'Enter' && !e.shiftKey && enterSends && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      e.preventDefault();
                      if (canPost) handlePostComment();
                    } else if (e.key === 'Escape') {
                      handleClearReply();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  onInput={resizeInput}
                  onPaste={handleCommentPaste}
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
                {/* Inline when collapsed; a row under the text when expanded.
                    Deliberately in flow rather than absolutely positioned over
                    the field: floating it meant the text only cleared it by way
                    of a matching `pb-12`, which a scrolled textarea does not
                    honour on every engine, and the line being typed ended up
                    behind the buttons. */}
                <div className={cn(
                  "flex items-center gap-1.5",
                  isInputExpanded
                    ? "shrink-0 justify-end mt-auto pt-1"
                    : "shrink-0 ml-1"
                )}>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    data-comment-tool="image"
                    className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-lg text-zinc-400 hover:text-white transition-colors"
                    aria-label={t('comments.attachImage')}
                  >
                    <ImagePlus className="w-4 h-4" />
                  </button>
                  <EmojiGifPicker
                    onEmojiSelect={handleCommentEmojiSelect}
                    onGifSelect={handleCommentGifSelect}
                    triggerClassName="bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                    iconClassName="w-4 h-4"
                  />
                  {/* One AI button: tone check, a vibe rewrite (the AI Assistant
                      styles) and a spelling/grammar pass. Icon-only while the
                      field is a single line, so the row stays put. */}
                  {newComment.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAiMenu('open')}
                      disabled={coachStatus === 'loading' || aiRewriting}
                      data-comment-tool="ai"
                      aria-label={t('conversation.coach.aiMenu')}
                      title={t('conversation.coach.aiMenu')}
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-lg text-zinc-400 hover:text-white transition-colors disabled:opacity-60"
                    >
                      {aiRewriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    </button>
                  )}
                  <Drawer open={aiMenu !== 'closed'} onOpenChange={(open) => { if (!open) setAiMenu('closed'); }}>
                    <DrawerContent column glass className="border-t border-white/10 max-h-[90dvh]">
                      <DrawerHeader className="border-b border-white/10">
                        <DrawerTitle className="text-white flex items-center gap-2">
                          {aiMenu === 'vibes' ? (
                            <button
                              type="button"
                              onClick={() => setAiMenu('open')}
                              aria-label={t('conversation.coach.aiMenu')}
                              className="text-zinc-400 hover:text-white transition-colors"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                          ) : (
                            <Sparkles className="w-5 h-5 text-white" />
                          )}
                          {aiMenu === 'vibes' ? t('conversation.coach.changeVibe') : t('conversation.coach.aiMenu')}
                        </DrawerTitle>
                      </DrawerHeader>
                      <div className="flex flex-col max-h-[50vh] overflow-y-auto pb-4">
                        {aiMenu === 'vibes' ? (
                          AI_STYLE_OPTIONS.map((style) => (
                            <button
                              key={style.id}
                              type="button"
                              onClick={() => { void aiRewrite('style', style.id); }}
                              className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                            >
                              <span className="text-lg">{style.emoji}</span>
                              {t(`aiStyles.${style.id}`)}
                            </button>
                          ))
                        ) : (
                          <>
                            {coachEnabled && (
                              <button
                                type="button"
                                disabled={newComment.trim().length < COACH_MIN_CHARS}
                                onClick={() => { setAiMenu('closed'); void coachCheck(newComment); }}
                                className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                              >
                                <Gauge className="w-5 h-5 text-white" />
                                {t('conversation.coach.checkTone')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setAiMenu('vibes')}
                              className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent justify-between"
                            >
                              <span className="flex items-center gap-3">
                                <Palette className="w-5 h-5 text-white" />
                                {t('conversation.coach.changeVibe')}
                              </span>
                              <ChevronRight className="w-4 h-4 text-zinc-500" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { void aiRewrite('grammar'); }}
                              className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                            >
                              <SpellCheck className="w-5 h-5 text-white" />
                              {t('conversation.coach.fixSpelling')}
                            </button>
                          </>
                        )}
                      </div>
                    </DrawerContent>
                  </Drawer>
                  {!voiceNote && (
                    <button
                      onClick={startRecording}
                      data-comment-tool="mic"
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-lg text-zinc-400 hover:text-red-400 transition-colors"
                      aria-label={t('comments.recordVoiceNote')}
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      // Mobile viewport/keyboard changes can move the button
                      // before touch-up and cancel click. Latch touch while the
                      // pointer is still down; mouse and keyboard keep onClick.
                      if ((event.pointerType === 'touch' || event.pointerType === 'pen') && canPost) {
                        // Keep focus from moving until the send is already
                        // latched; that prevents the keyboard resize from
                        // swallowing this gesture on touch browsers.
                        event.preventDefault();
                        void handlePostComment();
                      }
                    }}
                    onClick={() => { if (canPost) handlePostComment(); }}
                    disabled={!canPost}
                    // Named outright because while a post is in flight the
                    // word is swapped for a spinner and the button has no text.
                    aria-label={t('comments.post')}
                    data-comment-send
                    className="h-8 px-3 rounded-lg text-xs font-medium transition-colors flex-shrink-0 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10"
                  >
                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('comments.post')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Common Ground steps, opened by the first Post of the session on a
            thread that has the mode on. Its own Post button sends the reply. */}
        <CommonGroundSheet
          open={commonGroundOpen}
          onOpenChange={setCommonGroundOpen}
          draft={newComment}
          onConfirm={handleCommonGroundConfirm}
        />

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

        {/* Report somebody else's comment. One drawer for the whole section,
            aimed at whichever comment's Report item was picked. */}
        <ReportModal
          open={!!reportCommentId}
          onOpenChange={(open) => { if (!open) setReportCommentId(null); }}
          reportType="comment"
          commentId={reportCommentId ?? undefined}
          tokenId={tokenId}
        />

        {/* Delete one of the viewer's own comments. Asked first because it is
            permanent and takes every reply under the comment with it — the
            trash icon sits right beside Edit and used to fire on one tap.
            Lifted over the default z-50: the section lives inside the phone
            sheet (z-[100]) and the shorts viewer (z-[60]), and the dialog
            would open behind either. */}
        <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
          <AlertDialogContent className="z-[10000] bg-black/80 backdrop-blur-[24px] border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">{t('governance.discussion.deleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">{t('governance.discussion.deleteDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white">
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-500/80 text-white hover:bg-red-500"
                onClick={() => {
                  if (pendingDeleteId) void handleDeleteComment(pendingDeleteId);
                  setPendingDeleteId(null);
                }}
              >
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </motion.div>
    </PostCreatorContext.Provider>
  );
}
