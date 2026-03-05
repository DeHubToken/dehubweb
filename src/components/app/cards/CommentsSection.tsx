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
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Search, ThumbsUp, ThumbsDown, MessageSquare, Quote, ArrowUpDown, Mic, Square, Play, Pause, Trash2, Share2, Bookmark, Repeat2, Link, Loader2, Reply, Pencil, Check, ImagePlus, Languages } from 'lucide-react';
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
  avatar?: string;
  text: string;
  likes: number;
  dislikes: number;
  timeAgo: string;
  createdAt: Date; // For sorting
  isLiked?: boolean;
  isDisliked?: boolean;
  voiceNote?: VoiceNote;
  replyToId?: string;
  address?: string;
}

interface CommentsSectionProps {
  tokenId: string;
  onClose: () => void;
}

// formatTimeAgo is now imported from @/lib/feed-utils

function mapApiComment(apiComment: ApiCommentResponse): Comment {
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

  return {
    id: String(apiComment.id),
    username: apiComment.writor?.username || 'Anonymous',
    avatar: resolvedAvatar,
    text: apiComment.content || (apiComment as any).text || (apiComment as any).body || '',
    likes: apiComment.likeCount ?? 0,
    dislikes: 0,
    timeAgo: formatTimeAgo(apiComment.createdAt),
    createdAt,
    isLiked: apiComment.isLiked ?? false,
    replyToId: apiComment.parentId ? String(apiComment.parentId) : undefined,
    address,
    voiceNote,
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
        <div className="flex items-center gap-2 mb-1">
          <button 
            onClick={() => onUserPress(comment.username)}
            className="font-semibold text-white text-sm hover:underline"
          >
            {comment.username}
          </button>
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
            <button
              onClick={() => onDislike(comment.id)}
              className={cn(
                "transition-colors",
                comment.isDisliked ? "text-zinc-400" : "text-white/70 hover:text-zinc-400"
              )}
              aria-label="Dislike"
            >
              <ThumbsDown className="w-4 h-4" />
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
                    toast.success(`Copied: ${url}`);
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
                      translation.isLoading ? "text-blue-400" : 
                      translation.isTranslated ? "text-blue-400" : "text-white hover:text-zinc-400"
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

export function CommentsSection({ tokenId, onClose }: CommentsSectionProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, walletAddress } = useAuth();
  const isMobile = useIsMobile();
  
  const [activeTab, setActiveTab] = useState<'replies' | 'quotes' | 'reposts' | 'search'>('replies');
  const { layerRef: commentsTabLayerRef, setRef: setCommentsTabRef, rect: commentsTabRect } = useTabIndicator(activeTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'liked'>('recent');
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<Comment[]>([]);
  // Track like/dislike state overrides for optimistic updates
  const [likeOverrides, setLikeOverrides] = useState<Map<string, { isLiked: boolean; isDisliked: boolean; likes: number }>>(new Map());
  
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
  const mention = useMention({
    inputRef,
    onMentionInsert: (_user, newText) => setNewComment(newText),
  });

  const MAX_VOICE_DURATION = 30;

  // Fetch comments from API
  const { data: apiComments, isLoading, error } = useQuery({
    queryKey: ['comments', tokenId, walletAddress],
    queryFn: () => getNFTComments(tokenId, 0, 20, walletAddress?.toLowerCase()),
    staleTime: 30000,
  });

  // Fetch reposters when tab is active
  const [repostLoadingFollows, setRepostLoadingFollows] = useState<Set<string>>(new Set());
  const { data: repostersData, isLoading: isLoadingReposters } = useQuery({
    queryKey: ['post-reposters', tokenId],
    queryFn: () => getPostReposters(tokenId),
    enabled: activeTab === 'reposts',
    staleTime: 60000,
  });

  // Combine API comments with optimistic ones and apply like overrides
  const allComments = useMemo(() => {
    const mapped = apiComments?.map(mapApiComment) || [];
    const apiIds = new Set(mapped.map(c => c.id));
    const pending = optimisticComments.filter(c => !apiIds.has(c.id) && c.id.startsWith('temp-'));
    const combined = [...pending, ...mapped];
    
    // Apply like/dislike overrides
    return combined.map(c => {
      const override = likeOverrides.get(c.id);
      if (override) {
        return { ...c, ...override };
      }
      return c;
    });
  }, [apiComments, optimisticComments, likeOverrides]);

  // Group comments: top-level and replies
  const groupedComments = useMemo(() => {
    const topLevel = allComments.filter(c => !c.replyToId);
    const repliesMap = new Map<string, Comment[]>();
    
    allComments.filter(c => c.replyToId).forEach(reply => {
      const existing = repliesMap.get(reply.replyToId!) || [];
      repliesMap.set(reply.replyToId!, [...existing, reply]);
    });
    
    return topLevel.map(comment => ({
      comment,
      replies: repliesMap.get(comment.id) || [],
    }));
  }, [allComments]);

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
          replies.some(r => r.text.toLowerCase().includes(query) || r.username.toLowerCase().includes(query))
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
    
    const wasLiked = comment.isLiked;
    const newLikes = wasLiked ? comment.likes - 1 : comment.likes + 1;
    
    // Optimistic update using overrides
    setLikeOverrides(prev => {
      const next = new Map(prev);
      next.set(commentId, {
        isLiked: !wasLiked,
        isDisliked: false,
        likes: newLikes,
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

  const handleDislike = (commentId: string) => {
    if (!isAuthenticated) {
      toast.error('Please log in to dislike comments');
      return;
    }
    
    // Find current comment state
    const comment = allComments.find(c => c.id === commentId);
    if (!comment) return;
    
    // Optimistic update - toggle dislike state
    setLikeOverrides(prev => {
      const next = new Map(prev);
      next.set(commentId, {
        isLiked: false,
        isDisliked: !comment.isDisliked,
        likes: comment.isLiked ? comment.likes - 1 : comment.likes, // Decrease if was liked
      });
      return next;
    });
    // Note: DeHub API doesn't have a separate dislike_comment endpoint
    // This is UI-only for now
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

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteComment(commentId);
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
      toast.success('Comment deleted');
    } catch (err) {
      console.error('Delete comment error:', err);
      toast.error('Failed to delete comment');
    }
  };

  const handleEditComment = async (commentId: string, newContent: string) => {
    if (!newContent.trim()) return;
    try {
      await editComment({ commentId, content: newContent });
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
      toast.success('Comment updated');
    } catch (err) {
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
      timeAgo: 'Just now',
      createdAt: new Date(),
      voiceNote: voiceNote || undefined,
      replyToId: replyTo?.id,
      address: userAddress,
    };

    setOptimisticComments(prev => [tempComment, ...prev]);
    const replyTarget = replyTo;
    const imageFile = commentImage;
    setReplyTo(null);
    setNewComment('');
    setVoiceNote(null);
    removeCommentImage();
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
    } catch (err) {
      setOptimisticComments(prev => prev.filter(c => c.id !== tempId));
      toast.error('Failed to post comment');
      console.error('Comment error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [newComment, voiceNote, commentImage, isSubmitting, isAuthenticated, user, replyTo, tokenId, queryClient]);

  const canPost = (newComment.trim() || voiceNote || commentImage) && !isSubmitting;

  

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col min-h-[400px] max-h-[600px] p-4 mt-3"
    >

      {/* Tab Switcher - Left: Replies, Quotes, Search, Sort | Right: Like, Dislike, Bookmark, Share (desktop/tablet only) */}
      <div className="flex justify-between items-center gap-1 mb-3">
        {/* Left side - Tab buttons */}
        <div ref={commentsTabLayerRef} className="relative" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
          <GlassIndicator rect={commentsTabRect} />
          <div className="relative z-20 flex gap-1">
            {(['replies', 'quotes', 'reposts', 'search'] as const).map((tab) => (
              <button
                key={tab}
                ref={setCommentsTabRef(tab)}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="relative z-40 px-4 py-2 flex items-center justify-center transition-all rounded-xl text-zinc-400 hover:text-zinc-200"
              >
                <span className={cn("relative z-10", activeTab === tab && "text-white")}>
                  {tab === 'replies' ? <MessageSquare className="w-5 h-5" /> : tab === 'quotes' ? <Quote className="w-5 h-5" /> : tab === 'reposts' ? <Repeat2 className="w-5 h-5" /> : <Search className="w-5 h-5" />}
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
                className="px-4 py-2 flex items-center justify-center gap-2 transition-all rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              >
                <ArrowUpDown className="w-5 h-5" />
                <span className="text-xs">{sortBy === 'recent' ? 'Recent' : sortBy === 'oldest' ? 'Oldest' : 'Liked'}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{sortBy === 'recent' ? 'Sorted by Most Recent' : sortBy === 'oldest' ? 'Sorted by Oldest' : 'Sorted by Most Liked'}</TooltipContent>
          </Tooltip>
        </div>

        {/* Duplicate post action buttons removed — already shown in ActionBar above */}
      </div>

      {/* Search Input - always rendered but hidden when not on search tab to maintain consistent height */}
      <div className={`mb-3 ${activeTab === 'search' ? 'visible' : 'invisible h-0 mb-0 overflow-hidden'}`}>
        <Input
          placeholder="Search comments & quotes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-white/[0.08] backdrop-blur-xl border-white/[0.12] text-white text-sm h-10 rounded-xl placeholder:text-zinc-500"
          autoFocus={activeTab === 'search'}
        />
      </div>

      {/* Content Area - scrollable, takes remaining space */}
      <div className={`relative flex-1 min-h-0 ${activeTab === 'search' ? 'max-h-[272px]' : ''}`}>
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
                {filteredGroupedComments.length > 0 ? (
                  filteredGroupedComments.map(({ comment, replies }) => (
                    <div key={comment.id}>
                      <CommentItem 
                        comment={comment}
                        tokenId={tokenId}
                        onLike={handleLike} 
                        onDislike={handleDislike} 
                        onReply={handleReply} 
                        onShare={() => {}} 
                        onBookmark={() => {}}
                        onEdit={handleEditComment}
                        onDelete={handleDeleteComment}
                        onUserPress={handleUserPress}
                        isOwnComment={comment.address?.toLowerCase() === walletAddress?.toLowerCase()}
                      />
                      {replies.map(reply => (
                        <CommentItem 
                          key={reply.id}
                          comment={reply}
                          tokenId={tokenId}
                          onLike={handleLike} 
                          onDislike={handleDislike} 
                          onReply={handleReply} 
                          onShare={() => {}} 
                          onBookmark={() => {}}
                          onEdit={handleEditComment}
                          onDelete={handleDeleteComment}
                          onUserPress={handleUserPress}
                          isReply
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
          </div>
        )}

        {/* Quotes Tab */}
        {activeTab === 'quotes' && (
          <div className="absolute inset-0 overflow-y-auto pt-2 pb-2">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-zinc-500 text-sm text-center flex items-center justify-center h-full min-h-[200px]"
            >
              No quotes yet. Be the first!
            </motion.p>
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
                        <span className="font-semibold text-white text-sm truncate block">{displayName}</span>
                        {user.username && (
                          <span className="text-zinc-500 text-xs truncate block">@{user.username.replace('@', '')}</span>
                        )}
                      </div>
                      {user.address?.toLowerCase() !== walletAddress?.toLowerCase() && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!walletAddress) return;
                            setRepostLoadingFollows(prev => new Set(prev).add(user.address));
                            try {
                              if (user.isFollowing) {
                                await unfollowUser(user.address);
                              } else {
                                await followUser(user.address);
                              }
                              queryClient.invalidateQueries({ queryKey: ['post-reposters', tokenId] });
                            } catch {
                              toast.error('Action failed');
                            } finally {
                              setRepostLoadingFollows(prev => {
                                const next = new Set(prev);
                                next.delete(user.address);
                                return next;
                              });
                            }
                          }}
                          disabled={repostLoadingFollows.has(user.address)}
                          className={cn(
                            "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                            user.isFollowing
                              ? "bg-zinc-800 text-white hover:bg-red-500/20 hover:text-red-400"
                              : "bg-white/10 text-white hover:bg-white/20"
                          )}
                        >
                          {repostLoadingFollows.has(user.address) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : user.isFollowing ? 'Following ✓' : 'Follow'}
                        </button>
                      )}
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
                        onDislike={handleDislike} 
                        onReply={handleReply} 
                        onShare={() => {}} 
                        onBookmark={() => {}}
                        onEdit={handleEditComment}
                        onDelete={handleDeleteComment}
                        onUserPress={handleUserPress}
                        isOwnComment={comment.address?.toLowerCase() === walletAddress?.toLowerCase()}
                      />
                      {replies.map(reply => (
                        <CommentItem 
                          key={reply.id}
                          comment={reply}
                          tokenId={tokenId}
                          onLike={handleLike} 
                          onDislike={handleDislike} 
                          onReply={handleReply} 
                          onShare={() => {}} 
                          onBookmark={() => {}}
                          onEdit={handleEditComment}
                          onDelete={handleDeleteComment}
                          onUserPress={handleUserPress}
                          isReply
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
          </div>
        )}
      </div>

        {/* New Comment Input - sticky at bottom, clean minimal style */}
        <div className="mt-auto pt-3">
          {/* Reply indicator */}
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-xl">
              <Reply className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-400">Replying to @{replyTo.username}</span>
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

          <div className={cn("pb-1 mt-2.5", isMobile ? "flex flex-col gap-2" : "flex items-center gap-2")}>
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
              <>
                <div className={cn(
                  "flex-1 flex items-start bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-xl px-3",
                  isMobile ? "min-h-[80px] relative" : "min-h-[40px]"
                )}>
                  <textarea
                    ref={inputRef}
                    placeholder={replyTo ? `Reply to @${replyTo.username}...` : 'Add a reply...'}
                    value={newComment}
                    onChange={(e) => {
                      setNewComment(e.target.value);
                      mention.handleInput(e.target.value, e.target.selectionStart ?? undefined);
                    }}
                    className={cn(
                      "flex-1 bg-transparent text-white text-sm resize-none focus:outline-none placeholder:text-zinc-500",
                      isMobile ? "py-2.5 min-h-[80px] max-h-[120px]" : "py-2.5 min-h-[40px] max-h-[120px]"
                    )}
                    rows={isMobile ? 3 : 1}
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
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = Math.min(target.scrollHeight, 120) + 'px';
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
                  {/* Mobile: buttons inside the bento, bottom-right */}
                  {isMobile && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
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
                        onClick={handlePostComment}
                        disabled={!canPost}
                        className="h-8 px-3 rounded-lg text-xs font-medium transition-colors flex-shrink-0 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10"
                      >
                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Post'}
                      </button>
                    </div>
                  )}
                </div>
                {/* Desktop: buttons outside the bento */}
                {!isMobile && (
                  <>
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-xl text-zinc-400 hover:text-white transition-colors"
                      aria-label="Attach image"
                    >
                      <ImagePlus className="w-5 h-5" />
                    </button>
                    {!voiceNote && (
                      <button
                        onClick={startRecording}
                        className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-xl text-zinc-400 hover:text-red-400 transition-colors"
                        aria-label="Record voice note"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    )}
                  </>
                )}
              </>
            )}
            {/* Desktop: Post button outside */}
            {!isMobile && (
              <button
                onClick={handlePostComment}
                disabled={!canPost}
                className="h-10 px-4 rounded-xl text-sm font-medium transition-colors flex-shrink-0 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
              </button>
            )}
          </div>
        </div>
    </motion.div>
  );
}
