import { useDraftState } from '@/hooks/use-draft-state';
/**
 * Threaded Comments
 * =================
 * The comment thread under a Supabase-backed thing — a feature request, a
 * governance proposal. One UI for every table that follows the
 * `lib/comment-threads` shape: same row treatment, same thread line through
 * the avatars, same reaction ladder, same "reply to a row by tapping it" as
 * the post comment section (`components/app/cards/CommentsSection.tsx`).
 *
 * It owns no data. Each surface brings its own hook (the table, the reactions
 * table, the cache keys) and its own words, so the two boards can never drift
 * apart on behaviour while still reading in their own voice.
 *
 * @module components/app/comments/ThreadedComments
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation as useI18n } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Square } from "lucide-react";
import Send from "@/components/ui/cut-icons/send";
import X from "@/components/ui/cut-icons/close";
import Paperclip from '@/components/ui/cut-icons/attach';
import Mic from "@/components/ui/cut-icons/mic";

import { Textarea } from '@/components/ui/textarea';
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
import { UserMentionDropdown } from '@/components/app/mentions';
import { EmojiGifPicker } from '@/components/app/chat/EmojiGifPicker';
import { PostCommentRow, CommentCreatorContext } from '@/components/app/cards/CommentsSection';
import { CommentLikersDrawer } from '@/components/app/cards/CommentLikersDrawer';
import { VoiceStripPlayer } from '@/components/app/audio/VoiceStripPlayer';
import { useMention } from '@/hooks/use-mention';
import { isPositiveReaction, reactionForThumbTap, type PostReaction } from '@/lib/reactions';
import { buildAvatarUrl } from '@/lib/media-url';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Comment } from '@/lib/comment-mapper';
import type { CommentLikersResponse } from '@/lib/api/dehub';
import { COMMENT_ATTACH_ACCEPT, COMMENT_ATTACH_LIMITS, commentAttachmentKind, dragHasFiles, firstAttachableFile } from '@/lib/comment-attachments';
import { createVoiceRecorder, voiceRecordingBlob, voiceRecordingFile, VOICE_RECORDING_SECONDS } from '@/lib/voice-recording';
import {
  countThreadComments,
  type CommentMediaInput,
  type CommentThread,
  type ThreadedComment,
} from '@/lib/comment-threads';

/** Replies shown before the thread collapses behind "Show N more". */
const VISIBLE_REPLIES = 1;

/** Every string the thread renders, already translated by the surface. */
export interface ThreadedCommentsLabels {
  /** Composer placeholder for a new top-level comment. */
  addComment: string;
  /** Composer placeholder while replying. */
  writeReply: string;
  /** Aria label on the reply icon. */
  reply: string;
  replyingTo: (name: string) => string;
  /** Shown beside the time on a row its author edited. */
  edited: string;
  /** The thread has no comments. */
  empty: string;
  showMoreReplies: (count: number) => string;
  /** Chip on rows written by the thing's author; none when omitted. */
  authorChip?: string;
  /** When set, a signed-out viewer sees this instead of the composer. */
  signInToComment?: string;
  /** When both are set, deleting asks first. */
  deleteTitle?: string;
  deleteDescription?: string;
}

/**
 * A Supabase row in the post thread's `Comment` shape, so the post section's
 * own row draws it — same avatar, badge, menu, link cards, media and tray.
 */
function toPostComment(comment: ThreadedComment): Comment {
  const address = comment.wallet_address.toLowerCase();
  const handle = comment.username || address;
  const mediaUrl = comment.media_url || undefined;
  const type = comment.media_type;
  return {
    id: comment.id,
    username: handle,
    avatar: comment.avatar ? buildAvatarUrl(address, comment.avatar) || undefined : undefined,
    text: comment.content,
    imageUrl: mediaUrl && (type === 'image' || type === 'gif') ? mediaUrl : undefined,
    videoUrl: mediaUrl && type === 'video' ? mediaUrl : undefined,
    voiceNote: mediaUrl && (type === 'audio' || type === 'voice')
      ? { url: mediaUrl, duration: comment.media_duration ?? 0 }
      : undefined,
    likes: comment.likes,
    dislikes: comment.dislikes,
    views: 0,
    timeAgo: formatTimeAgo(comment.created_at),
    createdAt: new Date(comment.created_at),
    isLiked: !!comment.myReaction && isPositiveReaction(comment.myReaction),
    isDisliked: comment.myReaction === 'dislike',
    myReaction: comment.myReaction,
    reactionCounts: comment.reactionCounts,
    replyToId: comment.parent_id ?? undefined,
    address,
    badgeLookupId: handle,
  };
}

/** How long a picked audio file plays, for the strip player's label. */
function audioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (seconds: number) => { URL.revokeObjectURL(url); resolve(Math.round(seconds) || 0); };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

interface PendingMedia extends CommentMediaInput {
  /** Local preview while it is attached. */
  preview: string;
}

/** The attachment side of a surface: where files go, and who liked what. */
export interface ThreadedCommentsMedia {
  /** Store one picked or recorded file and hand back its public URL. */
  upload: (file: File) => Promise<string>;
}
export interface ThreadedCommentsProps<C extends ThreadedComment> {
  draftScope: string;
  threads: CommentThread<C>[] | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  /** Whose thing this thread hangs off — their rows get the creator chip. */
  entityAuthorAddress: string;
  /** A comment a notification pointed at — ringed and forced into view. */
  focusCommentId?: string | null;
  labels: ThreadedCommentsLabels;
  /** A reaction is in flight; the thumbs wait for it. */
  busy: boolean;
  submitting: boolean;
  /**
   * Save a comment. Resolves once it is written; the composer clears itself
   * and opens the thread the reply landed in. A rejection leaves the draft
   * in place — the hook has already said why.
   */
  onSubmit: (input: { content: string; parent: C | null; media?: CommentMediaInput | null }) => Promise<unknown>;
  onEdit: (comment: C, content: string) => Promise<unknown>;
  onDelete: (comment: C) => void;
  onReact: (comment: C, reaction: PostReaction) => void;
  /** Turns on the paperclip, GIFs and voice notes — tables with media columns only. */
  media?: ThreadedCommentsMedia;
  /** "Copy link" on a row. */
  permalink?: (commentId: string) => string;
  /** Who liked your own comment, for the likers sheet its thumb opens. */
  loadLikers?: (commentId: string | number, page?: number, limit?: number) => Promise<CommentLikersResponse>;
  /** Tailwind cap on the list before it scrolls; the card variant is shorter. */
  listMaxHeightClass?: string;
}

const NOOP = () => {};

export function ThreadedComments<C extends ThreadedComment>({
  draftScope,
  threads,
  isLoading,
  isError,
  isFetching,
  onRetry,
  entityAuthorAddress,
  focusCommentId,
  labels,
  busy,
  submitting,
  onSubmit,
  onEdit,
  onDelete,
  onReact,
  media,
  permalink,
  loadLikers,
  listMaxHeightClass = 'max-h-96',
}: ThreadedCommentsProps<C>) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();
  const viewer = walletAddress?.toLowerCase() ?? null;
  const entityAuthor = entityAuthorAddress.toLowerCase();

  const [text, setText] = useDraftState(`${draftScope}:text`, '');
  const [replyTo, setReplyTo] = useDraftState<C | null>(`${draftScope}:reply`, null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<C | null>(null);
  const [likersFor, setLikersFor] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<PendingMedia | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const recordSecondsRef = useRef(0);
  recordSecondsRef.current = recordSeconds;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(140, Math.max(32, input.scrollHeight))}px`;
  }, [text]);

  const mention = useMention({
    inputRef,
    onMentionInsert: (_user, newText) => setText(newText.slice(0, 500)),
  });

  // Every row id to its own comment, so the post row's id-based callbacks
  // find the record they were tapped on.
  const byId = useMemo(() => {
    const map = new Map<string, C>();
    for (const thread of threads ?? []) {
      map.set(thread.comment.id, thread.comment);
      for (const reply of thread.replies) map.set(reply.id, reply);
    }
    return map;
  }, [threads]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  const shaped = useMemo(() => {
    const map = new Map<string, Comment>();
    for (const [id, comment] of byId) map.set(id, toPostComment(comment));
    return map;
  }, [byId]);

  // A thread holding the linked comment opens itself, or the row the
  // notification was about would sit behind "Show N more replies".
  useEffect(() => {
    if (!focusCommentId || !threads) return;
    const owner = threads.find(
      (thread) => thread.comment.id === focusCommentId || thread.replies.some((reply) => reply.id === focusCommentId),
    );
    if (owner) setExpanded((prev) => new Set(prev).add(owner.comment.id));
  }, [focusCommentId, threads]);

  useEffect(() => () => {
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => () => {
    if (attachment?.preview.startsWith('blob:')) URL.revokeObjectURL(attachment.preview);
  }, [attachment]);

  const handleReply = useCallback((id: string) => {
    const comment = byIdRef.current.get(id);
    if (!comment) return;
    if (!isAuthenticated) { openLoginModal(); return; }
    setReplyTo(comment);
    // Every reply that threads on this platform carries the "@name " prefix,
    // so the ones that read like replies and the ones that are replies match.
    const prefix = comment.username ? `@${comment.username} ` : '';
    setText((current) => (current.startsWith(prefix) ? current : prefix + current));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isAuthenticated, openLoginModal, setReplyTo, setText]);

  const handleReact = useCallback((id: string, reaction: PostReaction) => {
    const comment = byIdRef.current.get(id);
    if (!comment) return;
    if (!isAuthenticated) { openLoginModal(); return; }
    onReact(comment, reaction);
  }, [isAuthenticated, openLoginModal, onReact]);

  const handleLike = useCallback((id: string) => {
    const comment = byIdRef.current.get(id);
    if (!comment) return;
    handleReact(id, reactionForThumbTap(comment.myReaction, comment.reactionCounts));
  }, [handleReact]);

  const handleEdit = useCallback(async (id: string, content: string) => {
    const comment = byIdRef.current.get(id);
    if (!comment || !content.trim()) return false;
    try { await onEdit(comment, content); return true; } catch { return false; }
  }, [onEdit]);

  const askDelete = labels.deleteTitle && labels.deleteDescription;
  const handleDelete = useCallback((id: string) => {
    const comment = byIdRef.current.get(id);
    if (!comment) return;
    if (askDelete) setPendingDelete(comment);
    else onDelete(comment);
  }, [askDelete, onDelete]);

  const handleUserPress = useCallback((username: string) => {
    navigate(`/${username.replace(/^@/, '')}`);
  }, [navigate]);

  const handleShowLikers = useCallback((id: string) => {
    if (loadLikers) setLikersFor(id);
  }, [loadLikers]);

  // ── Attachments ───────────────────────────────────────────────────────────

  const attachFile = useCallback(async (file: File, voice = false) => {
    if (!media) return;
    if (!isAuthenticated) { openLoginModal(); return; }
    const kind = commentAttachmentKind(file);
    if (!kind) { toast.error(t('comments.attachUnsupported')); return; }
    if (file.size > COMMENT_ATTACH_LIMITS[kind]) {
      toast.error(t('comments.attachTooLarge', { size: Math.round(COMMENT_ATTACH_LIMITS[kind] / (1024 * 1024)) }));
      return;
    }
    setUploading(true);
    try {
      const [url, duration] = await Promise.all([
        media.upload(file),
        kind === 'audio' ? audioDuration(file) : Promise.resolve(null),
      ]);
      setAttachment({
        url,
        type: voice ? 'voice' : kind,
        duration,
        preview: URL.createObjectURL(file),
      });
    } catch {
      toast.error(t('governance.uploadFailed'));
    } finally {
      setUploading(false);
    }
  }, [media, isAuthenticated, openLoginModal, t]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setRecordSeconds(elapsed);
      if (elapsed >= VOICE_RECORDING_SECONDS) stopRecording();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording, stopRecording]);

  const startRecording = useCallback(async () => {
    if (!media) return;
    if (!isAuthenticated) { openLoginModal(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = createVoiceRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = voiceRecordingBlob(chunksRef.current, recorder.mimeType);
        if (blob.size === 0) return;
        const seconds = Math.max(1, recordSecondsRef.current);
        void attachFile(voiceRecordingFile(blob), true).then(() => {
          setAttachment((current) => (current && current.type === 'voice' ? { ...current, duration: seconds } : current));
        });
      };
      recorderRef.current = recorder;
      setRecordSeconds(0);
      recorder.start();
      setRecording(true);
    } catch {
      toast.error(t('stages.micUnreachable'));
    }
  }, [media, isAuthenticated, openLoginModal, attachFile, t]);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) { openLoginModal(); return; }
    if (!text.trim() && !attachment) return;
    const parent = replyTo;
    const sent = attachment;
    onSubmit({
      content: text,
      parent,
      media: sent ? { url: sent.url, type: sent.type, duration: sent.duration ?? null } : null,
    })
      .then(() => {
        if (parent) setExpanded((prev) => new Set(prev).add(parent.parent_id ?? parent.id));
        if (setText.complete(text, '')) setReplyTo.complete(parent, null);
        setAttachment(null);
      })
      .catch(() => {
        // The hook toasts; the draft stays so nothing typed is lost.
      });
  };

  const totalComments = countThreadComments(threads);
  const canSend = (!!text.trim() || !!attachment) && !submitting && !uploading && !recording;

  const rowFor = (comment: C, extra: { isReply?: boolean; threadLineAbove?: boolean; threadLineBelow?: boolean }) => {
    const row = shaped.get(comment.id);
    if (!row) return null;
    return (
      <PostCommentRow
        key={comment.id}
        comment={row}
        tokenId={draftScope}
        isOwnComment={comment.wallet_address.toLowerCase() === viewer}
        highlighted={comment.id === focusCommentId}
        onLike={busy ? NOOP : handleLike}
        onShowLikers={handleShowLikers}
        onReact={busy ? NOOP : handleReact}
        onReply={handleReply}
        onShare={NOOP}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onUserPress={handleUserPress}
        permalink={permalink}
        {...extra}
      />
    );
  };

  return (
    <CommentCreatorContext.Provider value={creatorValue(entityAuthor)}>
    <div
      className={cn('border-t border-white/5 pt-2 mt-1', dragOver && 'ring-1 ring-white/30 rounded-xl')}
      data-drop-attach={media ? '' : undefined}
      onDragOver={media ? (e) => { if (dragHasFiles(e)) { e.preventDefault(); setDragOver(true); } } : undefined}
      onDragLeave={media ? () => setDragOver(false) : undefined}
      onDrop={media ? (e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const file = firstAttachableFile(e.dataTransfer.files);
        if (file) void attachFile(file);
      } : undefined}
    >
      {isError && (
        <div role="alert" className="flex items-center justify-center gap-3 py-2 text-xs text-zinc-400">
          <span>{t('comments.loadFailed')}</span>
          <button type="button" onClick={onRetry} disabled={isFetching} aria-busy={isFetching}
            className="min-h-10 px-2 text-white underline disabled:opacity-50">
            {t(isFetching ? 'common.loading' : 'common.retry')}
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
        </div>
      ) : totalComments > 0 ? (
        <div className={cn('mb-2 overflow-y-auto scrollbar-invisible', listMaxHeightClass)}>
          {(threads ?? []).map((thread) => {
            const isExpanded = expanded.has(thread.comment.id);
            const shown = isExpanded ? thread.replies : thread.replies.slice(0, VISIBLE_REPLIES);
            const hidden = thread.replies.length - shown.length;
            return (
              <div key={thread.comment.id}>
                {rowFor(thread.comment, { threadLineBelow: shown.length > 0 })}
                {shown.map((reply, i) =>
                  rowFor(reply, {
                    isReply: true,
                    threadLineAbove: true,
                    // The line has to reach the "show more" row too, or it stops
                    // dead above a control that belongs to the thread.
                    threadLineBelow: i < shown.length - 1 || hidden > 0,
                  }),
                )}
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
                    {labels.showMoreReplies(hidden)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : !isError && (
        <p className="text-zinc-500 text-xs text-center py-2 mb-2">{labels.empty}</p>
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
              {labels.replyingTo(replyTo.username ? `@${replyTo.username}` : replyTo.wallet_address.slice(0, 8))}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo.complete(replyTo, null)}
              className="text-zinc-500 hover:text-white transition-colors"
              aria-label={t('common.cancel')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {(attachment || uploading || recording) && (
        <div className="relative mb-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1.5" data-comment-attachment>
          {uploading ? (
            <span className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />{t('toasts.uploading')}
            </span>
          ) : recording ? (
            <span className="flex items-center gap-2 px-2 py-1 text-xs text-white" role="status">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden />
              {`0:${String(recordSeconds).padStart(2, '0')} / 0:${VOICE_RECORDING_SECONDS}`}
            </span>
          ) : attachment && (attachment.type === 'image' || attachment.type === 'gif') ? (
            <img src={attachment.type === 'gif' ? attachment.url : attachment.preview} alt="" className="h-16 max-w-[160px] rounded-lg object-cover" />
          ) : attachment && attachment.type === 'video' ? (
            <video src={attachment.preview} muted playsInline className="h-16 max-w-[160px] rounded-lg bg-black object-cover" />
          ) : attachment ? (
            <div className="w-56 max-w-full"><VoiceStripPlayer src={attachment.preview} duration={attachment.duration ?? 0} /></div>
          ) : null}
          {attachment && !uploading && (
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/60 text-white"
              aria-label={t('common.remove')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {!isAuthenticated && labels.signInToComment ? (
        <button
          type="button"
          onClick={() => openLoginModal()}
          className="w-full h-8 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white text-xs transition-colors"
        >
          {labels.signInToComment}
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
          {media && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={COMMENT_ATTACH_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void attachFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => { if (!isAuthenticated) { openLoginModal(); return; } fileInputRef.current?.click(); }}
                disabled={uploading || recording || !!attachment}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white disabled:opacity-30 transition-opacity"
                aria-label={t('comments.attachMedia')}
              >
                <Paperclip className="w-4 h-4" />
              </button>
            </>
          )}
          <Textarea
            ref={inputRef}
            value={text}
            onChange={(e) => {
              const val = e.target.value;
              setText(val);
              mention.handleInput(val, e.target.selectionStart ?? val.length);
            }}
            onPaste={media ? (e) => {
              const file = firstAttachableFile(e.clipboardData?.files);
              if (file && !attachment) { e.preventDefault(); void attachFile(file); }
            } : undefined}
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
            placeholder={replyTo ? labels.writeReply : labels.addComment}
            maxLength={500}
            rows={1}
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 rounded-xl text-xs min-h-8 max-h-[140px] resize-none py-2"
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
          {media && (
            <EmojiGifPicker
              onEmojiSelect={(emoji) => setText((current) => (current + emoji).slice(0, 500))}
              onGifSelect={(gifUrl) => {
                if (!isAuthenticated) { openLoginModal(); return; }
                setAttachment({ url: gifUrl, type: 'gif', preview: gifUrl });
              }}
              triggerClassName="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white"
              iconClassName="w-4 h-4"
            />
          )}
          {media && !text.trim() && !attachment ? (
            <button
              type="button"
              onClick={() => { if (recording) stopRecording(); else void startRecording(); }}
              disabled={uploading}
              className={cn(
                'w-8 h-8 shrink-0 flex items-center justify-center rounded-xl border text-white disabled:opacity-30 transition-colors',
                recording ? 'bg-red-500/80 border-red-400/60' : 'bg-white/5 border-white/10',
              )}
              aria-label={recording ? t('comments.stopRecording') : t('comments.recordVoiceNote')}
            >
              {recording ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-4 h-4" />}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white disabled:opacity-30 transition-opacity"
              aria-label={t('comments.post')}
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          )}
        </form>
      )}

      {loadLikers && (
        <CommentLikersDrawer
          open={!!likersFor}
          onOpenChange={(open) => { if (!open) setLikersFor(null); }}
          commentId={likersFor}
          loadPage={loadLikers}
          cacheScope={draftScope}
        />
      )}

      {askDelete && (
        <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
          <AlertDialogContent className="bg-black/80 backdrop-blur-[24px] border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">{labels.deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">{labels.deleteDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white">
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-500/80 text-white hover:bg-red-500"
                onClick={() => {
                  if (pendingDelete) onDelete(pendingDelete);
                  setPendingDelete(null);
                }}
              >
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
    </CommentCreatorContext.Provider>
  );
}

/** One stable context value per author, so rows are not re-rendered for it. */
const creatorValues = new Map<string, { address: string }>();
function creatorValue(address: string) {
  let value = creatorValues.get(address);
  if (!value) { value = { address }; creatorValues.set(address, value); }
  return value;
}
