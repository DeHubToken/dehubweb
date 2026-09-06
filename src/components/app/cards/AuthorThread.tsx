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

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, Share2, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgedName } from '@/components/app/BadgedName';
import { TranslatableText } from '../TranslatableText';
import { DehubLinkEmbeds, useDehubLinks } from './DehubLinkEmbed';
import { FeedLinkPreviews } from './FeedLinkPreviews';
import { reactToComment, deleteComment } from '@/lib/api/dehub';
import {
  applyReactionDelta,
  isPositiveReaction,
  reactionForTap,
  reactionMeta,
  reconcileReactionCounts,
  resolveLeadReaction,
  resolveNegativeLeadReaction,
  type PostReaction,
  type ReactionCounts,
} from '@/lib/reactions';
import { reactionGlowProps } from '@/lib/reaction-glow';
import { ReactionPicker } from './ReactionPicker';
import { useReactionTray } from '@/hooks/use-reaction-tray';
import { dehubLinkFor } from '@/lib/dehub-links';
import { useAuth } from '@/contexts/AuthContext';
import { isAssistantAddress } from '@/lib/assistant';
import { useAuthorThread } from '@/hooks/use-author-thread';
import type { Comment } from '@/lib/comment-mapper';

interface AuthorThreadProps {
  tokenId: string;
  /** Post author's wallet address — the only comments that thread. */
  authorAddress?: string;
  /** Entry to spotlight when the page was opened at a deep link. */
  highlightId?: string;
}

/** Reaction overrides for one entry, mirroring the comments-section semantics:
 *  the nine reactions ride on one vote per viewer, and the polarity of that
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
  const queryClient = useQueryClient();

  const state = { ...entry, ...votes };
  const bodyText = state.text || '';
  const { links, displayText } = useDehubLinks(bodyText);

  // One tray per thumb, as on a feed card. Off entirely on your own entry —
  // the like button there is a readout, not a vote.
  const likeTray = useReactionTray(!isOwn);
  const dislikeTray = useReactionTray(!isOwn);
  // Deps are the tray's OWN `open` plus the sibling's `close`, which the hook
  // keeps stable — not the tray objects, which are new on every render. With
  // the objects in there both effects ran on every render, so a moment where
  // both were open (a hold landing inside the other's 220ms hover grace) had
  // each of them closing the other and the tray the reader just asked for shut
  // with the one they were leaving. Keyed on `open`, only the newly opened one
  // runs, and it wins.
  useEffect(() => { if (likeTray.open) dislikeTray.close(); }, [likeTray.open, dislikeTray.close]);
  useEffect(() => { if (dislikeTray.open) likeTray.close(); }, [dislikeTray.open, likeTray.close]);

  const leadReaction = isOwn ? null : resolveLeadReaction(state.reactionCounts, state.myReaction);
  const myPositiveReaction =
    state.myReaction && isPositiveReaction(state.myReaction) ? state.myReaction : null;
  const myNegativeReaction =
    state.myReaction && !isPositiveReaction(state.myReaction) ? state.myReaction : null;
  const negativeLeadReaction = resolveNegativeLeadReaction(state.myReaction);

  if (removed) return null;

  /**
   * Cast one of the nine on this entry — the thread block's copy of
   * CommentsSection.handleReact, holding the same three rules: re-casting what
   * you hold removes it, the counts move only when the polarity changes, and
   * the split moves every time.
   */
  const handleReact = async (reaction: PostReaction) => {
    if (isOwn) return;
    if (!isAuthenticated) {
      toast.error('Please log in to react to comments');
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
        isPositiveReaction(reaction) ? 'Failed to react to comment' : 'Failed to dislike comment',
      );
    }
  };

  /** A plain tap casts whatever the thumb is wearing — see reactionForTap. */
  const handleLike = () =>
    handleReact(reactionForTap(true, state.myReaction, state.reactionCounts));
  const handleDislike = () => handleReact(reactionForTap(false, state.myReaction));

  const handleShare = () => {
    navigator.clipboard
      .writeText(dehubLinkFor.threadEntry(tokenId, entry.id))
      .then(() => toast.success('Link copied'))
      .catch(() => toast.error('Could not copy link'));
  };

  const handleDelete = async () => {
    // Same optimistic pattern as the comments list: vanish now, come back if
    // the server refuses.
    setRemoved(true);
    try {
      await deleteComment(entry.id);
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
    } catch {
      setRemoved(false);
      toast.error('Failed to delete comment');
    }
  };

  return (
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
      <button
        onClick={(e) => { e.stopPropagation(); onProfile(entry.username); }}
        className="flex-shrink-0 relative z-10"
      >
        <Avatar className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity">
          {entry.avatar && <AvatarImage src={entry.avatar} className="object-cover" />}
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
              username={entry.username}
              className="font-semibold text-white text-sm max-w-[160px] leading-tight"
            >
              {entry.displayName || entry.username}
            </BadgedName>
          </button>
          {isAssistantAddress(entry.address) && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.12] border border-white/[0.12] text-[10px] font-semibold text-white/75 leading-none flex-shrink-0">
              AI
            </span>
          )}
          <span className="text-zinc-500 text-xs truncate max-w-[120px]">@{entry.username}</span>
          <span className="text-zinc-500 text-xs">{entry.timeAgo}</span>
        </div>
        {displayText && (
          <TranslatableText
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
              {...reactionGlowProps(isOwn ? null : myPositiveReaction)}
              className={cn(
                'flex items-center gap-1 transition-colors select-none touch-none',
                !isOwn && state.isLiked ? 'text-white' : 'text-white/70 hover:text-white',
              )}
              aria-label={isOwn ? 'Likes' : `${reactionMeta(leadReaction ?? 'like').label} — hold to react`}
              aria-haspopup={isOwn ? undefined : 'menu'}
              aria-expanded={isOwn ? undefined : likeTray.open}
            >
              {leadReaction ? (
                <span data-engaged-glyph className="w-3.5 h-3.5 flex items-center justify-center text-[0.8rem] leading-none" aria-hidden="true">
                  {reactionMeta(leadReaction).emoji}
                </span>
              ) : (
                <ThumbsUp className={cn('w-3.5 h-3.5', !isOwn && state.isLiked && 'fill-current')} />
              )}
              {(state.likes > 0 || isOwn) && <span className="text-xs">{state.likes}</span>}
            </button>
          </span>
          <span className="relative flex items-center gap-1" {...dislikeTray.areaProps}>
            <ReactionPicker
              open={dislikeTray.open}
              polarity="negative"
              current={state.myReaction ?? null}
              counts={state.reactionCounts}
              onSelect={(reaction) => { dislikeTray.close(); handleReact(reaction); }}
              onClose={dislikeTray.close}
              align="left"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (dislikeTray.consumePress()) return;
                if (!isOwn) handleDislike();
              }}
              {...dislikeTray.buttonProps}
              {...reactionGlowProps(myNegativeReaction)}
              className={cn(
                'flex items-center gap-1 transition-colors select-none touch-none',
                state.isDisliked ? 'text-white' : 'text-white/70 hover:text-white',
              )}
              aria-label={
                myNegativeReaction
                  ? `${reactionMeta(myNegativeReaction).label} — hold to change your reaction`
                  : 'Dislike — hold to react'
              }
              aria-haspopup={isOwn ? undefined : 'menu'}
              aria-expanded={isOwn ? undefined : dislikeTray.open}
            >
              {negativeLeadReaction ? (
                <span data-engaged-glyph className="w-3.5 h-3.5 flex items-center justify-center text-[0.8rem] leading-none" aria-hidden="true">
                  {reactionMeta(negativeLeadReaction).emoji}
                </span>
              ) : (
                <ThumbsDown className={cn('w-3.5 h-3.5', state.isDisliked && 'fill-current')} />
              )}
              {state.dislikes > 0 && <span className="text-xs">{state.dislikes}</span>}
            </button>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleShare(); }}
            className="text-white/70 hover:text-white transition-colors"
            aria-label="Copy link"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          {isOwn && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              className="text-white/70 hover:text-red-400 transition-colors"
              aria-label="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function AuthorThread({ tokenId, authorAddress, highlightId }: AuthorThreadProps) {
  const navigate = useNavigate();
  const { walletAddress } = useAuth();
  const { entries } = useAuthorThread(tokenId, authorAddress, walletAddress);

  if (entries.length === 0) return null;

  return (
    <div className="relative mt-1 mb-1">
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
    </div>
  );
}
