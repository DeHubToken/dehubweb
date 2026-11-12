/**
 * Author Thread
 * =============
 * The X-style thread under a post on its own page: every straight comment the
 * post's author left on their own post (not a reply to somebody else) renders
 * here, connected to the card above it by a thread line, newest last.
 *
 * These same comments are hidden from the comments list below (CommentsSection
 * receives `postAuthorAddress` and drops them), so each entry exists exactly
 * once. Every entry carries its own sub-URL — /posts/<tokenId>/b/<commentId> —
 * which is what the share action copies and what a tap on the row opens.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Trash2 from "@/components/ui/cut-icons/delete";

import Share2 from "@/components/ui/cut-icons/feedshare";
import AddIcon from "@/components/ui/cut-icons/add";
import SortIcon from "@/components/ui/cut-icons/sort";

import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { emitCommentsDeleted } from '@/lib/comment-count-events';
import { BadgedName } from '@/components/app/BadgedName';
import { TranslatableText } from '../TranslatableText';
import { DehubLinkEmbeds, useDehubLinks } from './DehubLinkEmbedsLazy';
import { FeedLinkPreviews } from './FeedLinkPreviews';
import { reactToComment, deleteComment, setThreadOrder, type ApiCommentResponse } from '@/lib/api/dehub';
import { useDragReorder } from '@/hooks/use-drag-reorder';
import { usePostStage } from '@/components/app/post-stage/post-stage-context';
import {
  applyReactionDelta,
  isPositiveReaction,
  reactionForThumbTap,
  reactionMeta,
  reconcileReactionCounts,
  resolveThumbReaction,
  resolveThumbCount,
  dislikesOutnumberLikes,
  type PostReaction,
  type ReactionCounts,
} from '@/lib/reactions';
import { ReactionEmoji } from './ReactionEmoji';
import { ThumbIcon } from './ThumbIcon';
import { ReactionPicker } from './ReactionPicker';
import { useReactionTray } from '@/hooks/use-reaction-tray';
import { dehubLinkFor } from '@/lib/dehub-links';
import { useAuth } from '@/contexts/AuthContext';
import { ASSISTANT_AVATAR, isAssistantAddress } from '@/lib/assistant';
import { useAuthorThread } from '@/hooks/use-author-thread';
import type { Comment } from '@/lib/comment-mapper';
import { viewerShareUrl } from '@/lib/share-url';
import { trackShare } from '@/lib/analytics';

interface AuthorThreadProps {
  tokenId: string;
  /** Post author's wallet address — the only comments that thread. */
  authorAddress?: string;
  /** Entry to spotlight when the page was opened at a deep link. */
  highlightId?: string;
}

/** Reaction overrides for one entry, mirroring the comments-section semantics:
 *  the ten reactions ride on one vote per viewer, and the polarity of that
 *  reaction is what `isLiked`/`isDisliked` and the two counts keep meaning. */
interface VoteOverride {
  isLiked?: boolean;
  isDisliked?: boolean;
  myReaction?: PostReaction | null;
  likes?: number;
  dislikes?: number;
  reactionCounts?: ReactionCounts;
}

function ThreadEntry({
  entry,
  tokenId,
  isOwn,
  highlighted,
  onProfile,
}: {
  entry: Comment;
  tokenId: string;
  isOwn: boolean;
  highlighted: boolean;
  onProfile: (username: string) => void;
}) {
  const navigate = useNavigate();
  const { walletAddress, isAuthenticated } = useAuth();
  const [votes, setVotes] = useState<VoteOverride>({});
  const [removed, setRemoved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  /** A reaction's name in the viewer's language. */
  const reactionName = (reaction: PostReaction) =>
    t(`reactionInfo.labels.${reaction}`, { defaultValue: reactionMeta(reaction).label });

  const state = { ...entry, ...votes };
  const bodyText = state.text || '';
  const { links, displayText } = useDehubLinks(bodyText);

  // One tray on the thumbs-up, as on a feed card, holding every reaction
  // with 👎 last. Off entirely on your own entry — the like button there is a
  // readout, not a vote.
  const likeTray = useReactionTray(!isOwn);

  const heldReaction = isOwn
    ? null
    : state.myReaction ?? (state.isDisliked ? 'dislike' : null);
  const leadReaction = isOwn
    ? (dislikesOutnumberLikes(state.reactionCounts) ? 'dislike' : null)
    : resolveThumbReaction(state.reactionCounts, heldReaction);
  const thumbCount = resolveThumbCount(state.likes, state.dislikes ?? 0, leadReaction);
  /** A 👍 or 👎 stays the plain thumb icon; your own fills and nods. */
  const thumbDown = leadReaction === 'dislike';
  const thumbMine = !isOwn && (thumbDown ? heldReaction === 'dislike' : !!state.isLiked);

  if (removed) return null;

  /**
   * Cast one of the ten on this entry — the thread block's copy of
   * CommentsSection.handleReact, holding the same three rules: re-casting what
   * you hold removes it, the counts move only when the polarity changes, and
   * the split moves every time.
   */
  const handleReact = async (reaction: PostReaction) => {
    if (isOwn) return;
    if (!isAuthenticated) {
      toast.error(t('comments.logInToReact'));
      return;
    }
    const previous =
      state.myReaction ?? (state.isLiked ? 'like' : state.isDisliked ? 'dislike' : null);
    const next: PostReaction | null = previous === reaction ? null : reaction;
    const wasPositive = previous ? isPositiveReaction(previous) : null;
    const nowPositive = next ? isPositiveReaction(next) : null;

    let likes = state.likes;
    let dislikes = state.dislikes;
    if (wasPositive !== nowPositive) {
      if (wasPositive === true) likes = Math.max(0, likes - 1);
      if (wasPositive === false) dislikes = Math.max(0, dislikes - 1);
      if (nowPositive === true) likes += 1;
      if (nowPositive === false) dislikes += 1;
    }

    setVotes({
      isLiked: nowPositive === true,
      isDisliked: nowPositive === false,
      myReaction: next,
      likes,
      dislikes,
      reactionCounts: applyReactionDelta(state.reactionCounts, previous, next),
    });

    try {
      const result = await reactToComment({ commentId: entry.id, reaction });
      setVotes({
        isLiked: result.liked,
        isDisliked: result.disliked,
        myReaction: result.currentReaction ?? null,
        likes: result.likes ?? likes,
        dislikes: result.dislikes ?? dislikes,
        reactionCounts: reconcileReactionCounts(
          result.likes ?? likes,
          result.dislikes ?? dislikes,
          (result.reactionCounts as ReactionCounts | undefined) ?? undefined,
        ),
      });
    } catch {
      setVotes({});
      toast.error(
        isPositiveReaction(reaction) ? t('comments.reactFailed') : t('comments.dislikeFailed'),
      );
    }
  };

  /** A plain tap casts whatever the thumb is wearing — see reactionForThumbTap. */
  const handleLike = () => handleReact(reactionForThumbTap(heldReaction, state.reactionCounts));

  const handleShare = () => {
    trackShare('copy_link', { kind: 'comment' });
    navigator.clipboard
      .writeText(viewerShareUrl(dehubLinkFor.threadEntry(tokenId, entry.id)))
      .then(() => toast.success(t('comments.linkCopied')))
      .catch(() => toast.error(t('comments.copyLinkFailed')));
  };

  const handleDelete = async () => {
    // Same optimistic pattern as the comments list: vanish now, come back if
    // the server refuses.
    setRemoved(true);
    try {
      await deleteComment(entry.id);
      // An entry is by definition a comment nobody has replied to, so the
      // delete takes exactly one row off the post's count.
      emitCommentsDeleted(tokenId, 1);
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
    } catch {
      setRemoved(false);
      toast.error(t('toasts.failed_to_delete_comment'));
    }
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'relative flex items-start gap-3 py-2 rounded-xl transition-colors',
        highlighted && 'bg-white/[0.06] ring-1 ring-white/25 px-2 -mx-2',
      )}
      data-comment-id={entry.id}
      onClick={(e) => {
        // Text selection shouldn't throw you to the deep link, same guard the
        // post card uses.
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        navigate(`/posts/${tokenId}/b/${entry.id}`);
      }}
    >
      {/* The avatar is a picture and nothing else, so it needs a name of its
          own or a screen reader announces a bare "button". */}
      <button
        onClick={(e) => { e.stopPropagation(); onProfile(entry.username); }}
        className="flex-shrink-0 relative z-10"
        aria-label={t('feed.viewProfile', { name: entry.displayName || entry.username })}
      >
        <Avatar className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity">
          {(isAssistantAddress(entry.address) || entry.avatar) && (
            <AvatarImage
              src={isAssistantAddress(entry.address) ? ASSISTANT_AVATAR : entry.avatar}
              className="object-cover"
            />
          )}
          <AvatarFallback className="bg-zinc-700">{entry.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
        </Avatar>
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={(e) => { e.stopPropagation(); onProfile(entry.username); }}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <BadgedName
              badgeBalance={entry.badgeBalance}
              badgeLock={entry.badgeLock}
              username={entry.username}
              className="font-semibold text-white text-sm max-w-[160px] leading-tight"
            >
              {entry.displayName || entry.username}
            </BadgedName>
          </button>
          {isAssistantAddress(entry.address) && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.12] border border-white/[0.12] text-[10px] font-semibold text-white/75 leading-none flex-shrink-0">
              {t('editor.rail.agent', 'Agent')}
            </span>
          )}
          <span className="text-zinc-500 text-xs truncate max-w-[120px]">@{entry.username}</span>
          <span className="text-zinc-500 text-xs">{entry.timeAgo}</span>
        </div>
        {displayText && (
          <TranslatableText publicContent
            text={displayText}
            className="text-zinc-300 text-sm leading-relaxed break-words"
            as="p"
            hideControls
            auto={false}
          />
        )}
        <DehubLinkEmbeds links={links} />
        <FeedLinkPreviews text={bodyText} />
        {entry.imageUrl && (
          <img
            src={entry.imageUrl}
            alt=""
            className="mt-1.5 rounded-lg max-w-[240px] max-h-[200px] object-contain"
            loading="lazy"
          />
        )}
        <div className="flex items-center gap-4 mt-1.5">
          {/* Own entries can't be liked — same rule as the comments list; the
              count stays visible so the author sees traction, and the tray is
              off because every reaction it could cast would be refused. */}
          <span className="relative flex items-center gap-1" {...likeTray.areaProps}>
            <ReactionPicker
              open={likeTray.open}
              current={state.myReaction ?? null}
              counts={state.reactionCounts}
              onSelect={(reaction) => { likeTray.close(); handleReact(reaction); }}
              onClose={likeTray.close}
              align="left"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (likeTray.consumePress()) return;
                if (!isOwn) handleLike();
              }}
              {...likeTray.buttonProps}
              className={cn(
                'flex items-center gap-1 transition-colors select-none touch-none',
                heldReaction ? 'text-white' : 'text-white/70 hover:text-white',
              )}
              aria-label={isOwn
                ? t('postInfo.likes')
                : t('comments.holdToReact', { reaction: reactionName(reactionForThumbTap(heldReaction, state.reactionCounts)) })}
              aria-haspopup={isOwn ? undefined : 'menu'}
              aria-expanded={isOwn ? undefined : likeTray.open}
            >
              {leadReaction && !thumbDown ? (
                <span data-engaged-glyph className="w-3.5 h-3.5 flex items-center justify-center text-[0.8rem] leading-none" aria-hidden="true">
                  <ReactionEmoji reaction={leadReaction} animate={leadReaction === heldReaction} />
                </span>
              ) : (
                <ThumbIcon down={thumbDown} nod={thumbMine} className={cn('w-3.5 h-3.5', thumbMine && 'fill-current')} />
              )}
              {(thumbCount > 0 || isOwn) && <span className="text-xs">{thumbCount}</span>}
            </button>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleShare(); }}
            className="text-white/70 hover:text-white transition-colors"
            aria-label={t('postOptions.copyLink')}
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          {isOwn && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }}
              className="text-white/70 hover:text-red-400 transition-colors"
              aria-label={t('common.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
    {/* A delete is permanent, so it is asked first. A sibling of the row
        rather than inside it: the dialog portals out, but React events still
        bubble through the portal, and the row's own click opens the entry. */}
    {isOwn && (
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
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
              onClick={() => { void handleDelete(); }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}
    </>
  );
}

/**
 * The author putting their thread in order. Hold (touch) or press and drag
 * (mouse) a part to move it, or use its arrows; nothing is sent until Save.
 * The server takes the listed parts in this order and reads any other part of
 * theirs after them (lib/comment-threading compareThreadParts).
 */
function ThreadReorder({
  entries,
  tokenId,
  authorAddress,
  onClose,
}: {
  entries: Comment[];
  tokenId: string;
  authorAddress: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ids, setIds] = useState(() => entries.map((e) => e.id));
  const [saving, setSaving] = useState(false);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const { order, draggingId, itemProps, animateNextChange } = useDragReorder({
    ids,
    onCommit: setIds,
    disabled: saving,
    holdMs: 220,
    liftScale: 1.02,
  });
  const changed = ids.some((id, i) => id !== entries[i]?.id);

  const move = (id: string, delta: number) => {
    const from = ids.indexOf(id);
    if (from < 0 || from + delta < 0 || from + delta >= ids.length) return;
    // The two parts glide past each other instead of jumping.
    animateNextChange();
    setIds((current) => {
      const from = current.indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  };

  const save = async () => {
    if (!changed) { onClose(); return; }
    setSaving(true);
    const author = authorAddress.toLowerCase();
    const place = (rows?: ApiCommentResponse[]) => rows?.map((row) => {
      if (row.parentId || row.address?.toLowerCase() !== author) return row;
      const pos = ids.indexOf(String(row.id));
      return { ...row, threadPos: pos >= 0 ? pos : undefined };
    });
    // The thread reads in its new order the moment Save is pressed.
    queryClient.setQueriesData<ApiCommentResponse[]>({ queryKey: ['comments', tokenId, 'author-thread'] }, place);
    try {
      await setThreadOrder(tokenId, ids);
      toast.success(t('comments.threadParts.saved'));
      onClose();
    } catch {
      toast.error(t('comments.threadParts.saveFailed'));
      setSaving(false);
    } finally {
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
    }
  };

  return (
    <div className="mt-2 mb-1" data-no-navigate onClick={(e) => e.stopPropagation()}>
      <p className="text-zinc-400 text-xs mb-2 px-1">{t('comments.threadParts.reorderHint')}</p>
      <div className="flex flex-col gap-1.5">
        {order.map((id, index) => {
          const entry = byId.get(id);
          if (!entry) return null;
          const lifted = draggingId === id;
          return (
            <div
              key={id}
              {...itemProps(id)}
              className={cn(
                'thread-part-row flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.05] pl-2 pr-1 py-2 cursor-grab touch-pan-y',
                lifted && 'cursor-grabbing bg-white/[0.12] shadow-lg shadow-black/40',
              )}
            >
              <span
                className="thread-part-num flex-shrink-0 w-6 h-6 rounded-full bg-white/[0.1] text-white/80 text-[11px] font-semibold flex items-center justify-center tabular-nums"
                aria-hidden
              >
                {index + 1}
              </span>
              <p className="flex-1 min-w-0 text-zinc-200 text-sm leading-snug line-clamp-2 break-words">
                {entry.text?.trim() || (entry.imageUrl ? '🖼' : '…')}
              </p>
              <div className="flex items-center flex-shrink-0">
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => move(id, -1)}
                  disabled={index === 0 || saving}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                  aria-label={`${t('comments.threadParts.moveUp')} (${index + 1})`}
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => move(id, 1)}
                  disabled={index === order.length - 1 || saving}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                  aria-label={`${t('comments.threadParts.moveDown')} (${index + 1})`}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <span className="w-7 h-8 flex items-center justify-center text-white/45" title={t('comments.threadParts.dragPart', { n: index + 1 })} aria-hidden>
                  <GripVertical className="w-4 h-4" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 mt-2.5">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="h-8 px-3.5 rounded-full text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => { void save(); }}
          disabled={saving}
          className="h-8 px-4 rounded-full text-sm font-semibold bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-60"
        >
          {t('comments.threadParts.save')}
        </button>
      </div>
    </div>
  );
}

/** Bring up the comment box to write the next part of your thread. */
function useAddToThread() {
  const stage = usePostStage();
  return () => {
    if (stage) {
      stage.openComments();
      return;
    }
    const box = document.querySelector<HTMLTextAreaElement>('[data-comment-composer] textarea');
    if (!box) return;
    box.focus({ preventScroll: true });
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
}

export function AuthorThread({ tokenId, authorAddress, highlightId }: AuthorThreadProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const { entries } = useAuthorThread(tokenId, authorAddress, walletAddress);
  const [reordering, setReordering] = useState(false);
  const addToThread = useAddToThread();
  const isAuthor = !!walletAddress && !!authorAddress && authorAddress.toLowerCase() === walletAddress.toLowerCase();

  // Fewer than two parts leaves nothing to put in order.
  useEffect(() => { if (entries.length < 2) setReordering(false); }, [entries.length]);

  if (entries.length === 0 && !isAuthor) return null;

  if (reordering && isAuthor && authorAddress) {
    return (
      <ThreadReorder
        entries={entries}
        tokenId={tokenId}
        authorAddress={authorAddress}
        onClose={() => setReordering(false)}
      />
    );
  }

  return (
    <div className="relative mt-1 mb-1">
      {entries.length > 0 && (
        <>
          {/* The thread line — runs through the avatar column, tying the entries
              to each other and visually to the post card above. */}
          <div
            className="absolute left-[19px] top-2 bottom-2 w-px bg-white/[0.14]"
            aria-hidden
          />
          <div className="flex flex-col">
            {entries.map((entry) => (
              <ThreadEntry
                key={entry.id}
                entry={entry}
                tokenId={tokenId}
                isOwn={
                  !!walletAddress &&
                  !!entry.address &&
                  entry.address.toLowerCase() === walletAddress.toLowerCase()
                }
                highlighted={highlightId === entry.id}
                onProfile={(username) => navigate(`/${username}`)}
              />
            ))}
          </div>
        </>
      )}
      {/* The author's own tools: write the next part, and (with two or more)
          put the parts in order. Readers never see this row. */}
      {isAuthor && (
        <div className="relative flex items-center gap-1 pl-1 pt-0.5" data-no-navigate onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={addToThread}
            className="inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full text-[13px] font-medium text-white/75 hover:text-white hover:bg-white/10 transition-colors"
          >
            <span className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center">
              <AddIcon className="w-3.5 h-3.5" />
            </span>
            {t('comments.threadParts.addPart')}
          </button>
          {entries.length >= 2 && (
            <button
              type="button"
              onClick={() => setReordering(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium text-white/75 hover:text-white hover:bg-white/10 transition-colors"
            >
              <SortIcon className="w-4 h-4" />
              {t('comments.threadParts.reorder')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
