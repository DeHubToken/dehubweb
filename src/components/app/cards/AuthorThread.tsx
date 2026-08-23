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

import { useState } from 'react';
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
import {
  toggleCommentLike,
  toggleCommentDislike,
  deleteComment,
} from '@/lib/api/dehub';
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
 *  like and dislike swap polarity, one vote per viewer. */
interface VoteOverride {
  isLiked?: boolean;
  isDisliked?: boolean;
  likes?: number;
  dislikes?: number;
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

  if (removed) return null;

  const handleLike = async () => {
    if (isOwn) return;
    if (!isAuthenticated) {
      toast.error('Please log in to like comments');
      return;
    }
    const wasLiked = !!state.isLiked;
    const wasDisliked = !!state.isDisliked;
    setVotes((prev) => ({
      ...prev,
      isLiked: !wasLiked,
      isDisliked: false,
      likes: wasLiked ? Math.max(0, state.likes - 1) : state.likes + 1,
      dislikes: wasDisliked ? Math.max(0, state.dislikes - 1) : state.dislikes,
    }));
    try {
      const result = await toggleCommentLike({ commentId: entry.id });
      setVotes((prev) => ({
        ...prev,
        isLiked: result.isLiked,
        isDisliked: false,
        likes: result.likeCount ?? prev.likes,
      }));
    } catch {
      setVotes({});
      toast.error('Failed to like comment');
    }
  };

  const handleDislike = async () => {
    if (isOwn) return;
    if (!isAuthenticated) {
      toast.error('Please log in to react to comments');
      return;
    }
    const wasDisliked = !!state.isDisliked;
    const wasLiked = !!state.isLiked;
    setVotes((prev) => ({
      ...prev,
      isLiked: false,
      isDisliked: !wasDisliked,
      dislikes: wasDisliked ? Math.max(0, state.dislikes - 1) : state.dislikes + 1,
      likes: wasLiked && !wasDisliked ? Math.max(0, state.likes - 1) : state.likes,
    }));
    try {
      const result = await toggleCommentDislike({ commentId: entry.id });
      setVotes((prev) => ({
        ...prev,
        isLiked: false,
        isDisliked: result.disliked,
        dislikes: result.dislikes ?? prev.dislikes,
      }));
    } catch {
      setVotes({});
      toast.error('Failed to dislike comment');
    }
  };

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
              count stays visible so the author sees traction. */}
          <button
            onClick={(e) => { e.stopPropagation(); if (!isOwn) handleLike(); }}
            className={cn(
              'flex items-center gap-1 transition-colors',
              !isOwn && state.isLiked ? 'text-white' : 'text-white/70 hover:text-white',
            )}
            aria-label={isOwn ? 'Likes' : 'Like'}
          >
            <ThumbsUp className={cn('w-3.5 h-3.5', !isOwn && state.isLiked && 'fill-current')} />
            {(state.likes > 0 || isOwn) && <span className="text-xs">{state.likes}</span>}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (!isOwn) handleDislike(); }}
            className={cn(
              'flex items-center gap-1 transition-colors',
              state.isDisliked ? 'text-white' : 'text-white/70 hover:text-white',
            )}
            aria-label="Dislike"
          >
            <ThumbsDown className={cn('w-3.5 h-3.5', state.isDisliked && 'fill-current')} />
            {state.dislikes > 0 && <span className="text-xs">{state.dislikes}</span>}
          </button>
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
