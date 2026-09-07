/**
 * Feature Request Comments
 * ========================
 * The comment thread under a feature request.
 *
 * Written to read and behave like the post comment section
 * (`components/app/cards/CommentsSection.tsx`) rather than like a guestbook:
 * same row shape, same thread-line treatment, same reaction ladder, same
 * "reply to a row by tapping it". It is a separate component only because
 * feature requests live in Supabase while posts live on the DeHub API — when
 * they converge, this is the file that goes.
 *
 * @module components/app/features/FeatureRequestComments
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation as useI18n } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, MessageSquare, Pencil, Send, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { BadgedName } from '@/components/app/BadgedName';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import { TranslatableText } from '@/components/app/TranslatableText';
import { ReactionPicker } from '@/components/app/cards/ReactionPicker';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { useReactionTray } from '@/hooks/use-reaction-tray';
import { reactionGlowProps } from '@/lib/reaction-glow';
import {
  reactionForTap,
  reactionMeta,
  resolveLeadReaction,
  resolveNegativeLeadReaction,
  isPositiveReaction,
  negativeThumbLabel,
  HAS_NEGATIVE_TRAY,
  type PostReaction,
} from '@/lib/reactions';
import { buildAvatarUrl } from '@/lib/media-url';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  useFeatureRequestComments,
  useSubmitComment,
  useEditComment,
  useDeleteComment,
  useReactToComment,
  type FeatureRequestComment,
} from '@/hooks/use-feature-request-comments';

/** Grows an icon's tap target without moving it — the post section's constant. */
const ACTION_HIT = '-m-2 p-2';

/** Replies shown before the thread collapses behind "Show N more". */
const VISIBLE_REPLIES = 1;

interface RowProps {
  comment: FeatureRequestComment;
  isOwn: boolean;
  isRequestAuthor: boolean;
  threadLineAbove?: boolean;
  threadLineBelow?: boolean;
  highlighted?: boolean;
  busy: boolean;
  onReply: (comment: FeatureRequestComment) => void;
  onReact: (comment: FeatureRequestComment, reaction: PostReaction) => void;
  onEdit: (comment: FeatureRequestComment, content: string) => void;
  onDelete: (comment: FeatureRequestComment) => void;
}

function CommentRow({
  comment,
  isOwn,
  isRequestAuthor,
  threadLineAbove,
  threadLineBelow,
  highlighted,
  busy,
  onReply,
  onReact,
  onEdit,
  onDelete,
}: RowProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);

  // No tray on your own comment: every reaction it could cast is one you are
  // not allowed to cast on yourself, so the button would open onto refusals.
  const likeTray = useReactionTray(!isOwn);
  // With one negative reaction left, a hold-to-open menu of one option is worse
  // than no menu — the hold swallows the press that would have cast the
  // downvote. Same guard the post comment section applies; it comes back on its
  // own the day a second negative reaction exists.
  const dislikeTray = useReactionTray(!isOwn && HAS_NEGATIVE_TRAY);

  const leadReaction = isOwn ? null : resolveLeadReaction(comment.reactionCounts, comment.myReaction);
  const negativeLead = resolveNegativeLeadReaction(comment.myReaction);
  const myPositive = comment.myReaction && isPositiveReaction(comment.myReaction) ? comment.myReaction : null;
  // Which side the viewer's reaction fell on, read through the shared predicate
  // rather than compared against 'dislike' — reactions move between the two
  // sides (poo just did), and a literal here would quietly stop lighting up.
  const myNegative = !!comment.myReaction && !isPositiveReaction(comment.myReaction);

  const avatarUrl = comment.avatar ? buildAvatarUrl(comment.wallet_address, comment.avatar) : null;
  const handle = comment.username || `${comment.wallet_address.slice(0, 6)}...${comment.wallet_address.slice(-4)}`;
  const openProfile = () => navigate(`/${comment.username || comment.wallet_address}`);

  return (
    <div
      className={cn(
        'relative flex gap-3 py-2',
        highlighted && 'rounded-xl ring-1 ring-white/30 bg-white/[0.04] px-2 -mx-2',
      )}
      // The row is the reply target, not just the 16px icon in it. Anything
      // interactive inside keeps its own behaviour, and a drag that selected
      // text is not a tap — both the same rules the post section applies.
      onClick={(e) => {
        if (isEditing) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')) return;
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        onReply(comment);
      }}
    >
      {/* Thread line. Replies sit at the same left edge as their parent and the
          line through the avatars is what says they belong together. Both
          segments are positioned against the ROW, not the avatar, so
          neighbouring rows meet exactly however tall their text runs. */}
      {threadLineAbove && <span aria-hidden className="absolute left-4 -ml-px top-0 h-7 w-px bg-white/20" />}
      {threadLineBelow && <span aria-hidden className="absolute left-4 -ml-px top-7 bottom-0 w-px bg-white/20" />}

      <button type="button" onClick={openProfile} className="relative flex-shrink-0">
        <Avatar className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity">
          {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover" />}
          <AvatarFallback className="bg-zinc-700">{(comment.username || comment.wallet_address)[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <button type="button" onClick={openProfile} className="inline-flex items-center gap-1 hover:underline">
            <BadgedName
              lookupId={comment.username || comment.wallet_address}
              username={comment.username}
              className="font-semibold text-white text-sm max-w-[140px] leading-tight"
            >
              {handle}
            </BadgedName>
          </button>
          {isRequestAuthor && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.12] border border-white/[0.12] text-[10px] font-semibold text-white/75 leading-none flex-shrink-0">
              {t('features.requestAuthorChip')}
            </span>
          )}
          {!isRequestAuthor && <NewMemberChip address={comment.wallet_address} />}
          <span data-war-readout className="text-zinc-500 text-xs">{formatTimeAgo(comment.created_at)}</span>
          {comment.updated_at && (
            <span data-war-readout className="text-zinc-600 text-[10px]">{t('features.commentEdited')}</span>
          )}
        </div>

        {isEditing ? (
          <div className="flex items-center gap-2 mt-1">
            <Input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              maxLength={500}
              autoFocus
              className="flex-1 bg-zinc-800 text-white text-sm rounded-lg h-8 border-zinc-700"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onEdit(comment, editText);
                  setIsEditing(false);
                } else if (e.key === 'Escape') {
                  setEditText(comment.content);
                  setIsEditing(false);
                }
              }}
            />
            <button
              type="button"
              onClick={() => { onEdit(comment, editText); setIsEditing(false); }}
              className="text-white/80 hover:text-white transition-colors"
              aria-label={t('common.save')}
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setEditText(comment.content); setIsEditing(false); }}
              className="text-zinc-400 hover:text-white transition-colors"
              aria-label={t('common.cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <TranslatableText text={comment.content} className="text-zinc-300 text-sm leading-relaxed break-words" as="p" />
        )}

        {!isEditing && (
          <div className="flex items-center gap-4 mt-1.5">
            <span className="relative flex items-center gap-1" {...likeTray.areaProps}>
              <ReactionPicker
                open={likeTray.open}
                current={comment.myReaction}
                counts={comment.reactionCounts}
                onSelect={(reaction) => { likeTray.close(); onReact(comment, reaction); }}
                onClose={likeTray.close}
                align="left"
              />
              <button
                type="button"
                disabled={isOwn || busy}
                onClick={() => {
                  if (likeTray.consumePress()) return;
                  onReact(comment, reactionForTap(true, comment.myReaction, comment.reactionCounts));
                }}
                {...likeTray.buttonProps}
                {...reactionGlowProps(isOwn ? null : myPositive)}
                className={cn(
                  ACTION_HIT,
                  'flex items-center gap-1 transition-colors select-none touch-none disabled:opacity-60',
                  myPositive ? 'text-white' : 'text-white/70 hover:text-white',
                )}
                aria-label={reactionMeta(leadReaction ?? 'like').label}
                aria-haspopup={isOwn ? undefined : 'menu'}
                aria-expanded={isOwn ? undefined : likeTray.open}
              >
                {leadReaction ? (
                  <span data-engaged-glyph className="w-4 h-4 flex items-center justify-center text-sm leading-none" aria-hidden="true">
                    {reactionMeta(leadReaction).emoji}
                  </span>
                ) : (
                  <ThumbsUp className={cn('w-4 h-4', myPositive && 'fill-current')} />
                )}
                {comment.likes > 0 && <span className="text-xs">{comment.likes}</span>}
              </button>
            </span>

            <span className="relative flex items-center gap-1" {...dislikeTray.areaProps}>
              <ReactionPicker
                open={dislikeTray.open}
                polarity="negative"
                current={comment.myReaction}
                counts={comment.reactionCounts}
                onSelect={(reaction) => { dislikeTray.close(); onReact(comment, reaction); }}
                onClose={dislikeTray.close}
                align="left"
              />
              <button
                type="button"
                disabled={isOwn || busy}
                onClick={() => {
                  if (dislikeTray.consumePress()) return;
                  onReact(comment, reactionForTap(false, comment.myReaction, comment.reactionCounts));
                }}
                {...dislikeTray.buttonProps}
                {...reactionGlowProps(negativeLead)}
                className={cn(
                  ACTION_HIT,
                  'flex items-center gap-1 transition-colors select-none touch-none disabled:opacity-60',
                  myNegative ? 'text-white' : 'text-white/70 hover:text-white',
                )}
                aria-label={negativeThumbLabel(comment.myReaction)}
                aria-haspopup={!isOwn && HAS_NEGATIVE_TRAY ? 'menu' : undefined}
                aria-expanded={!isOwn && HAS_NEGATIVE_TRAY ? dislikeTray.open : undefined}
              >
                {negativeLead ? (
                  <span data-engaged-glyph className="w-4 h-4 flex items-center justify-center text-sm leading-none" aria-hidden="true">
                    {reactionMeta(negativeLead).emoji}
                  </span>
                ) : (
                  <ThumbsDown className={cn('w-4 h-4', myNegative && 'fill-current')} />
                )}
                {comment.dislikes > 0 && <span className="text-xs">{comment.dislikes}</span>}
              </button>
            </span>

            <button
              type="button"
              onClick={() => onReply(comment)}
              className={cn(ACTION_HIT, 'text-white hover:text-zinc-400 transition-colors')}
              aria-label={t('features.replyToComment')}
            >
              <MessageSquare className="w-4 h-4" />
            </button>

            {isOwn && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className={cn(ACTION_HIT, 'text-white hover:text-zinc-400 transition-colors')}
                  aria-label={t('common.edit')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(comment)}
                  className={cn(ACTION_HIT, 'text-white hover:text-red-400 transition-colors')}
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface FeatureRequestCommentsProps {
  featureRequestId: string;
  featureTitle: string;
  featureAuthorAddress: string;
  /** A comment a notification pointed at — ringed and forced into view. */
  focusCommentId?: string | null;
}

export function FeatureRequestComments({
  featureRequestId,
  featureTitle,
  featureAuthorAddress,
  focusCommentId,
}: FeatureRequestCommentsProps) {
  const { t } = useI18n();
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();
  const viewer = walletAddress?.toLowerCase() ?? null;

  const { data: threads, isLoading } = useFeatureRequestComments(featureRequestId);
  const submitComment = useSubmitComment();
  const editComment = useEditComment();
  const deleteComment = useDeleteComment();
  const reactToComment = useReactToComment();

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<FeatureRequestComment | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const mention = useMention({
    inputRef,
    onMentionInsert: (_user, newText) => setText(newText.slice(0, 500)),
  });

  // A thread holding the linked comment opens itself, or the row the
  // notification was about would sit behind "Show N more replies".
  useEffect(() => {
    if (!focusCommentId || !threads) return;
    const owner = threads.find(
      (thread) => thread.comment.id === focusCommentId || thread.replies.some((reply) => reply.id === focusCommentId),
    );
    if (owner) setExpanded((prev) => new Set(prev).add(owner.comment.id));
  }, [focusCommentId, threads]);

  const handleReply = useCallback((comment: FeatureRequestComment) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    setReplyTo(comment);
    // Every reply that threads on this platform carries the "@name " prefix,
    // so the ones that read like replies and the ones that are replies match.
    const prefix = comment.username ? `@${comment.username} ` : '';
    setText((current) => (current.startsWith(prefix) ? current : prefix + current));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isAuthenticated, openLoginModal]);

  const handleReact = useCallback((comment: FeatureRequestComment, reaction: PostReaction) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    reactToComment.mutate({
      commentId: comment.id,
      reaction,
      current: comment.myReaction,
      featureRequestId,
    });
  }, [featureRequestId, isAuthenticated, openLoginModal, reactToComment]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) { openLoginModal(); return; }
    if (!text.trim()) return;
    submitComment.mutate(
      {
        featureRequestId,
        content: text,
        parentId: replyTo?.id ?? null,
        featureTitle,
        featureAuthorAddress,
        parentAuthorAddress: replyTo?.wallet_address ?? null,
      },
      {
        onSuccess: () => {
          if (replyTo) setExpanded((prev) => new Set(prev).add(replyTo.parent_id ?? replyTo.id));
          setText('');
          setReplyTo(null);
        },
      },
    );
  };

  const totalComments = useMemo(
    () => (threads ?? []).reduce((sum, thread) => sum + 1 + thread.replies.length, 0),
    [threads],
  );

  return (
    <div className="border-t border-white/5 pt-2 mt-1">
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
        </div>
      ) : totalComments > 0 ? (
        <div className="mb-2 max-h-96 overflow-y-auto scrollbar-invisible">
          {(threads ?? []).map((thread) => {
            const isExpanded = expanded.has(thread.comment.id);
            const shown = isExpanded ? thread.replies : thread.replies.slice(0, VISIBLE_REPLIES);
            const hidden = thread.replies.length - shown.length;
            return (
              <div key={thread.comment.id}>
                <CommentRow
                  comment={thread.comment}
                  isOwn={thread.comment.wallet_address.toLowerCase() === viewer}
                  isRequestAuthor={thread.comment.wallet_address.toLowerCase() === featureAuthorAddress.toLowerCase()}
                  threadLineBelow={shown.length > 0}
                  highlighted={thread.comment.id === focusCommentId}
                  busy={reactToComment.isPending}
                  onReply={handleReply}
                  onReact={handleReact}
                  onEdit={(comment, content) => editComment.mutate({ commentId: comment.id, content, featureRequestId })}
                  onDelete={(comment) => deleteComment.mutate({ commentId: comment.id, featureRequestId })}
                />
                {shown.map((reply, i) => (
                  <CommentRow
                    key={reply.id}
                    comment={reply}
                    isOwn={reply.wallet_address.toLowerCase() === viewer}
                    isRequestAuthor={reply.wallet_address.toLowerCase() === featureAuthorAddress.toLowerCase()}
                    threadLineAbove
                    // The line has to reach the "show more" row too, or it stops
                    // dead above a control that belongs to the thread.
                    threadLineBelow={i < shown.length - 1 || hidden > 0}
                    highlighted={reply.id === focusCommentId}
                    busy={reactToComment.isPending}
                    onReply={handleReply}
                    onReact={handleReact}
                    onEdit={(comment, content) => editComment.mutate({ commentId: comment.id, content, featureRequestId })}
                    onDelete={(comment) => deleteComment.mutate({ commentId: comment.id, featureRequestId })}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => new Set(prev).add(thread.comment.id))}
                    // Hangs off the end of the thread line on an elbow, its
                    // label starting on the same text column as every body.
                    className="relative flex h-8 items-center pl-11 mb-1 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    <span aria-hidden className="absolute left-4 -ml-px top-0 bottom-1/2 w-px bg-white/20" />
                    <span aria-hidden className="absolute left-4 top-1/2 -mt-px w-5 h-px bg-white/20" />
                    {hidden === 1 ? t('features.showOneMoreReply') : t('features.showMoreReplies', { count: hidden })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-zinc-500 text-xs text-center py-2 mb-2">{t('features.noComments')}</p>
      )}

      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between text-xs text-zinc-400 pb-1.5 overflow-hidden"
          >
            <span className="truncate">
              {t('features.replyingTo', { name: replyTo.username ? `@${replyTo.username}` : replyTo.wallet_address.slice(0, 8) })}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-zinc-500 hover:text-white transition-colors"
              aria-label={t('common.cancel')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="relative flex gap-2">
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            setText(val);
            mention.handleInput(val, e.target.selectionStart ?? val.length);
          }}
          onKeyDown={(e) => {
            if (mention.isOpen) {
              const handled = mention.handleKeyDown(e);
              if (handled) {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const liveResults = (window as any).__mentionResults || [];
                  if (liveResults[mention.selectedIndex]) {
                    mention.handleSelect(liveResults[mention.selectedIndex]);
                  }
                }
                return;
              }
            }
          }}
          placeholder={replyTo ? t('features.writeReply') : t('features.addComment')}
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
          disabled={!text.trim() || submitComment.isPending}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white disabled:opacity-30 transition-opacity"
        >
          {submitComment.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </form>
    </div>
  );
}
