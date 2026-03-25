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

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { saveDraft, loadDraft, clearDraft } from '@/lib/comment-draft-cache';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Search, ThumbsUp, ThumbsDown, MessageSquare, Quote, ArrowUpDown, Mic, Square, Play, Pause, Trash2, Share2, Repeat2, Link, Loader2, Reply, Pencil, Check, ImagePlus, Languages } from 'lucide-react';
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
import { AudioVisualizer } from '../audio';
import { useAuth } from '@/contexts/AuthContext';
import { getBadgeUrl } from '@/lib/staking-badges';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { useIsMobile } from '@/hooks/use-mobile';
import { getNFTComments, postComment, toggleCommentLike, editComment, deleteComment, addCommentWithImage, addVoiceComment, uploadChatImage, getPostReposters, followUser, unfollowUser, type ApiCommentResponse } from '@/lib/api/dehub';
import { toast } from 'sonner';
import { incrementCommentCount } from '@/lib/comment-count-cache';
import { useMention } from '@/hooks/use-mention';
import { UserMentionDropdown } from '@/components/app/mentions';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceNote {
  url: string;
  duration: number;
}

export interface Comment {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  text: string;
  imageUrl?: string;
  likes: number;
  dislikes: number;
  timeAgo: string;
  createdAt: Date; // For sorting
  isLiked?: boolean;
  isDisliked?: boolean;
  voiceNote?: VoiceNote;
  replyToId?: string;
  address?: string;
  badgeBalance?: number;
}

interface CommentsSectionProps {
  tokenId: string;
  onClose: () => void;
  initialTab?: 'replies' | 'quotes' | 'reposts' | 'search';
  bottomAlignInput?: boolean;
}

// formatTimeAgo is now imported from @/lib/feed-utils

function mapApiComment(apiComment: ApiCommentResponse): Comment {
  // Debug: log all keys of each comment to find GIF field
  console.log('[Comment] raw keys:', apiComment.id, Object.keys(apiComment), 'imageUrl:', apiComment.imageUrl);
  const address = apiComment.address;
  // Use centralized utility for avatar field extraction
  const rawAvatarPath = extractAvatarPath(apiComment.writor);
  
  // Build avatar URL - use buildAvatarUrl for proper CDN path resolution
  const resolvedAvatar = address && rawAvatarPath 
    ? buildAvatarUrl(address, rawAvatarPath) 
    : undefined;
  
  // Parse createdAt for sorting - fallback to current time if parsing fails
  const createdAt = apiComment.createdAt ? new Date(apiComment.createdAt) : new Date();
  
  const voiceNote = (apiComment as any).audioUrl ? {
    url: (apiComment as any).audioUrl.startsWith('http') 
      ? (apiComment as any).audioUrl 
      : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${(apiComment as any).audioUrl}`,
    duration: (apiComment as any).audioDuration || 0,
  } : undefined;

  // Resolve imageUrl (GIF comments or image comments)
  // API may return gif in imageUrl, gifUrl, or image field
  let commentImageUrl: string | undefined;
  const rawImageUrl = apiComment.imageUrl || (apiComment as any).gifUrl || (apiComment as any).image || (apiComment as any).gif;
  if (rawImageUrl) {
    commentImageUrl = rawImageUrl.startsWith('http')
      ? rawImageUrl
      : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${rawImageUrl}`;
  }
  
  // Debug: log comments that have any media-related fields
  if (rawImageUrl || (apiComment as any).gifUrl || (apiComment as any).image || (apiComment as any).gif) {
    console.log('[Comment] media fields:', { id: apiComment.id, imageUrl: apiComment.imageUrl, gifUrl: (apiComment as any).gifUrl, image: (apiComment as any).image, gif: (apiComment as any).gif, resolved: commentImageUrl });
  }

  return {
    id: String(apiComment.id),
    username: apiComment.writor?.username || 'Anonymous',
    displayName: apiComment.writor?.displayName || undefined,
    avatar: resolvedAvatar,
    text: apiComment.content || (apiComment as any).text || (apiComment as any).body || '',
    imageUrl: commentImageUrl,
    likes: apiComment.likeCount ?? 0,
    dislikes: 0,
    timeAgo: formatTimeAgo(apiComment.createdAt),
    createdAt,
    isLiked: apiComment.isLiked ?? false,
    replyToId: apiComment.parentId ? String(apiComment.parentId) : undefined,
    address,
    voiceNote,
    badgeBalance: apiComment.writor?.badgeBalance,
  };
}

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'liked', label: 'Most Liked' },
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface CommentItemProps {
  comment: Comment;
  tokenId: string;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onReply: (id: string) => void;
  onShare: (id: string) => void;
  onEdit: (id: string, newContent: string) => void;
  onDelete: (id: string) => void;
  onUserPress: (username: string) => void;
  isReply?: boolean;
  isOwnComment?: boolean;
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

function CommentItem({ comment, tokenId, onLike, onDislike, onReply, onShare, onEdit, onDelete, onUserPress, isReply, isOwnComment }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const avatarUrl = comment.avatar;
  const translation = useTranslation(comment.text || '');
  const badgeUrl = getBadgeUrl(comment.badgeBalance, comment.username);
  const shownName = comment.displayName || comment.username;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex items-start gap-3 py-3", isReply && "ml-8")}
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
            <span className={`relative inline-flex items-baseline shrink min-w-0${badgeUrl ? ' pr-3' : ''}`}>
              <span className="font-semibold text-white text-sm truncate max-w-[120px] leading-tight">{shownName}</span>
              <BadgeIcon badgeBalance={comment.badgeBalance} username={comment.username} className="w-[9px] h-[9px] absolute -top-0.5 right-0" />
            </span>
          </button>
          {comment.displayName && (
            <span className="text-zinc-500 text-xs truncate max-w-[100px]">@{comment.username}</span>
          )}
          <span className="text-zinc-500 text-xs">{comment.timeAgo}</span>
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
            {comment.text && (
              <TranslatableText 
                text={translation.isTranslated ? translation.translatedText : comment.text} 
                className="text-zinc-300 text-sm leading-relaxed break-words" 
                as="p" 
                hideControls 
              />
            )}
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
            <button
              onClick={() => onLike(comment.id)}
              className={cn(
                "flex items-center gap-1 transition-colors",
                comment.isLiked ? "text-white" : "text-white/70 hover:text-white"
              )}
              aria-label="Like"
            >
              <ThumbsUp className={cn("w-4 h-4", comment.isLiked && "fill-current")} />
              {comment.likes > 0 && <span className="text-xs">{comment.likes}</span>}
            </button>
            {!isReply && (
              <button
                onClick={() => onReply(comment.id)}
                className="text-white hover:text-zinc-400 transition-colors"
                aria-label="Reply"
              >
                <MessageSquare className="w-4 h-4" />
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
              <DropdownMenuContent align="start" className="min-w-[160px]">
                <DropdownMenuItem
                  onClick={() => {
                    const url = `${window.location.origin}/app/post/${tokenId}?comment=${comment.id}`;
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
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommentsSection({ tokenId, onClose, initialTab, bottomAlignInput = false }: CommentsSectionProps) {
...
      className={cn(
        isMobile
          ? "flex flex-col h-full px-2 pt-2 pb-2 relative"
          : "flex flex-col min-h-[400px] max-h-[600px] p-4 mt-3 relative",
        !isMobile && bottomAlignInput && "h-full min-h-0 max-h-none p-0 mt-0"
      )}
...
          <div className={cn("flex flex-col gap-1.5", isMobile ? "pb-0 mt-1" : bottomAlignInput ? "pb-1 mt-0" : "pb-1 mt-[18px]")}>
            {isRecording ? (
              /* Recording indicator */
              <div className="flex-1 flex items-center gap-2 bg-red-500/10 rounded-xl px-4 h-10">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
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
                className={cn(
                  "flex-1 flex backdrop-blur-xl border rounded-xl relative transition-all duration-200",
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
                  placeholder={replyTo ? `Reply to @${replyTo.username}...` : 'Add a reply...'}
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
                      : "h-10 py-0 leading-10 overflow-hidden pr-0"
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
                    target.style.height = 'auto';
                    const maxHeight = isMobile ? 144 : 160;
                    target.style.height = Math.min(target.scrollHeight, maxHeight) + 'px';
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
                    className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-lg text-zinc-400 hover:text-white transition-colors"
                    aria-label="Attach image"
                  >
                    <ImagePlus className="w-4 h-4" />
                  </button>
                  {!voiceNote && (
                    <button
                      onClick={startRecording}
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
                    className="h-8 px-3 rounded-lg text-xs font-medium transition-colors flex-shrink-0 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10"
                  >
                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Post'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
    </motion.div>
  );
}
