/**
 * Comments Section Component
 * ==========================
 * Full-featured comments UI with tabs (Replies/Quotes), search, sorting, and voice notes.
 * 
 * @example
 * ```tsx
 * <CommentsSection onClose={() => setShowComments(false)} />
 * ```
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Search, ThumbsUp, ThumbsDown, MessageCircle, Quote, ArrowUpDown, ChevronDown, Mic, Square, Play, Pause, Trash2, Share2, Bookmark, Repeat2, Link } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TranslatableText } from '../TranslatableText';
import { AudioVisualizer } from '../audio';

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
  avatar: string;
  text: string;
  likes: number;
  dislikes: number;
  timeAgo: string;
  isLiked?: boolean;
  isDisliked?: boolean;
  voiceNote?: VoiceNote;
}

interface CommentsSectionProps {
  onClose: () => void;
  initialReplies?: Comment[];
  initialQuotes?: Comment[];
}

// ============================================================================
// AVATAR POOL
// ============================================================================

const AVATAR_POOL = [
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=100&h=100&fit=crop&crop=face',
];

const USERNAMES = [
  'crypto_whale', 'nft_hunter', 'web3_dev', 'pixel_artist', 'code_ninja',
  'design_guru', 'tech_savvy', 'future_builder', 'digital_nomad', 'chain_master',
  'block_smith', 'token_trader', 'meta_verse', 'ai_enthusiast', 'game_changer',
  'trend_setter', 'vibe_check', 'moon_shot', 'diamond_hands', 'rocket_fuel'
];

const REPLY_TEMPLATES = [
  "This is absolutely incredible! 🔥",
  "Best content I've seen today",
  "Can't believe how good this is",
  "Sharing this with everyone I know",
  "The quality here is insane",
  "You never disappoint! 👏",
  "This deserves way more attention",
  "Literally made my day",
  "How do you even do this??",
  "Take my follow, you earned it",
  "Underrated content right here",
  "Been following for months, still amazed",
  "This is why I'm on this app",
  "Absolutely legendary stuff",
  "Saving this for later 💾",
  "The vibes are immaculate ✨",
  "You're going places with this",
  "Next level content creation",
  "This hit different 💯",
  "Pure gold, nothing less"
];

const QUOTE_TEMPLATES = [
  "\"This content\" - shared with my whole team, they loved it",
  "Reposting because everyone needs to see this masterpiece",
  "When they said \"quality over quantity\" they meant this",
  "This is exactly what I've been looking for. Quoted for visibility.",
  "Adding this to my collection of goated content",
  "\"Peak content\" - and I stand by that quote",
  "Sharing this gem with the timeline",
  "This deserves a spotlight quote for sure"
];

const TIME_OPTIONS = ['Just now', '1m ago', '5m ago', '15m ago', '30m ago', '1h ago', '2h ago', '4h ago', '8h ago', '1d ago', '2d ago', '3d ago', '1w ago'];

export function generateRandomComments(count: number, seed: string): Comment[] {
  const comments: Comment[] = [];
  for (let i = 0; i < count; i++) {
    const seedNum = seed.charCodeAt(0) + i;
    comments.push({
      id: `${seed}-reply-${i}`,
      username: USERNAMES[(seedNum * 7) % USERNAMES.length],
      avatar: AVATAR_POOL[(seedNum * 3) % AVATAR_POOL.length],
      text: REPLY_TEMPLATES[(seedNum * 11) % REPLY_TEMPLATES.length],
      likes: Math.floor(Math.pow(Math.random(), 2) * 500) + (seedNum % 50),
      dislikes: Math.floor(Math.pow(Math.random(), 2) * 50) + (seedNum % 10),
      timeAgo: TIME_OPTIONS[(seedNum * 2) % TIME_OPTIONS.length],
    });
  }
  return comments.sort((a, b) => b.likes - a.likes);
}

export function generateRandomQuotes(count: number, seed: string): Comment[] {
  const quotes: Comment[] = [];
  for (let i = 0; i < count; i++) {
    const seedNum = seed.charCodeAt(0) + i + 100;
    quotes.push({
      id: `${seed}-quote-${i}`,
      username: USERNAMES[(seedNum * 5) % USERNAMES.length],
      avatar: AVATAR_POOL[(seedNum * 4) % AVATAR_POOL.length],
      text: QUOTE_TEMPLATES[(seedNum * 3) % QUOTE_TEMPLATES.length],
      likes: Math.floor(Math.pow(Math.random(), 2) * 300) + (seedNum % 30),
      dislikes: Math.floor(Math.pow(Math.random(), 2) * 30) + (seedNum % 5),
      timeAgo: TIME_OPTIONS[(seedNum * 3) % TIME_OPTIONS.length],
    });
  }
  return quotes.sort((a, b) => b.likes - a.likes);
}

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'liked', label: 'Most Liked' },
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface CommentItemProps {
  comment: Comment;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onReply: (id: string) => void;
  onShare: (id: string) => void;
  onBookmark: (id: string) => void;
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

function CommentItem({ comment, onLike, onDislike, onReply, onShare, onBookmark }: CommentItemProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);

  const handleBookmark = () => {
    setIsBookmarked(!isBookmarked);
    onBookmark(comment.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 py-3"
    >
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarImage src={comment.avatar} className="object-cover" />
        <AvatarFallback className="bg-zinc-700">{comment.username[0].toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-white text-sm">{comment.username}</span>
          <span className="text-zinc-500 text-xs">{comment.timeAgo}</span>
        </div>
        {comment.text && (
          <TranslatableText text={comment.text} className="text-zinc-300 text-sm leading-relaxed break-words" as="p" />
        )}
        {comment.voiceNote && (
          <div className="mt-1">
            <VoiceNotePlayer voiceNote={comment.voiceNote} />
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onLike(comment.id)}
              className={cn(
                "transition-colors",
                comment.isLiked ? "text-zinc-400" : "text-white hover:text-zinc-400"
              )}
              aria-label="Like"
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDislike(comment.id)}
              className={cn(
                "transition-colors",
                comment.isDisliked ? "text-zinc-400" : "text-white hover:text-zinc-400"
              )}
              aria-label="Dislike"
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
            <button
              onClick={() => onReply(comment.id)}
              className="text-white hover:text-zinc-400 transition-colors"
              aria-label="Reply"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
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
                  onClick={() => onShare(comment.id)}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Repeat2 className="w-4 h-4" />
                  Repost
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(comment.text);
                  }}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Link className="w-4 h-4" />
                  Copy Text
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button
            onClick={handleBookmark}
            className={cn(
              "transition-colors",
              isBookmarked ? "text-yellow-500" : "text-white hover:text-zinc-400"
            )}
            aria-label="Bookmark"
          >
            <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current")} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommentsSection({ onClose, initialReplies = [], initialQuotes = [] }: CommentsSectionProps) {
  const [activeTab, setActiveTab] = useState<'replies' | 'quotes'>('replies');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'liked'>('recent');
  const [replies, setReplies] = useState<Comment[]>(initialReplies);
  const [quotes, setQuotes] = useState<Comment[]>(initialQuotes);
  const [newComment, setNewComment] = useState('');
  
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

  const MAX_VOICE_DURATION = 30;

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
  const filteredComments = useMemo(() => {
    const comments = activeTab === 'replies' ? replies : quotes;
    
    let filtered = comments;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = comments.filter(
        (c) => c.text.toLowerCase().includes(query) || c.username.toLowerCase().includes(query)
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'liked') {
        return b.likes - a.likes;
      }
      // For 'recent', we'll just use the original order (mock data is already time-sorted)
      return 0;
    });
  }, [activeTab, replies, quotes, searchQuery, sortBy]);

  const handleLike = (commentId: string) => {
    const updateComments = (comments: Comment[]) =>
      comments.map((c) =>
        c.id === commentId
          ? { ...c, likes: c.isLiked ? c.likes - 1 : c.likes + 1, isLiked: !c.isLiked, isDisliked: false }
          : c
      );

    if (activeTab === 'replies') {
      setReplies(updateComments);
    } else {
      setQuotes(updateComments);
    }
  };

  const handleDislike = (commentId: string) => {
    const updateComments = (comments: Comment[]) =>
      comments.map((c) =>
        c.id === commentId
          ? { ...c, dislikes: c.isDisliked ? c.dislikes - 1 : c.dislikes + 1, isDisliked: !c.isDisliked, isLiked: false }
          : c
      );

    if (activeTab === 'replies') {
      setReplies(updateComments);
    } else {
      setQuotes(updateComments);
    }
  };

  const handleReply = (commentId: string) => {
    const comment = (activeTab === 'replies' ? replies : quotes).find(c => c.id === commentId);
    if (comment) {
      setNewComment(`@${comment.username} `);
    }
  };

  const handlePostComment = () => {
    if (!newComment.trim() && !voiceNote) return;

    const newItem: Comment = {
      id: `new-${Date.now()}`,
      username: 'you',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=currentuser',
      text: newComment,
      likes: 0,
      dislikes: 0,
      timeAgo: 'Just now',
      voiceNote: voiceNote || undefined,
    };

    if (activeTab === 'replies') {
      setReplies([newItem, ...replies]);
    } else {
      setQuotes([newItem, ...quotes]);
    }
    setNewComment('');
    setVoiceNote(null);
  };

  const canPost = newComment.trim() || voiceNote;

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-3 pt-3 border-t border-zinc-800"
    >

      {/* Search & Sort - moved above tabs */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search comments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-800 border-zinc-700 text-white text-sm h-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{currentSortLabel}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setSortBy(option.value as 'recent' | 'liked')}
                className={cn(
                  "text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white",
                  sortBy === option.value && "text-white"
                )}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'replies' | 'quotes')}>
        <TabsList className="w-full bg-zinc-800 p-1 rounded-lg mb-3">
          <TabsTrigger
            value="replies"
            className="flex-1 data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400 rounded-md py-1.5 text-sm gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Replies
            <span className="text-xs text-zinc-500 ml-1">({replies.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="quotes"
            className="flex-1 data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400 rounded-md py-1.5 text-sm gap-1.5"
          >
            <Quote className="w-3.5 h-3.5" />
            Quotes
            <span className="text-xs text-zinc-500 ml-1">({quotes.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Comments List */}
        <TabsContent value="replies" className="mt-0">
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {filteredComments.length > 0 ? (
                filteredComments.map((comment) => (
                  <CommentItem key={comment.id} comment={comment} onLike={handleLike} onDislike={handleDislike} onReply={handleReply} onShare={() => {}} onBookmark={() => {}} />
                ))
              ) : (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-zinc-500 text-sm py-6 text-center"
                >
                  {searchQuery ? 'No replies found' : 'No replies yet. Be the first!'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="quotes" className="mt-0">
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {filteredComments.length > 0 ? (
                filteredComments.map((comment) => (
                  <CommentItem key={comment.id} comment={comment} onLike={handleLike} onDislike={handleDislike} onReply={handleReply} onShare={() => {}} onBookmark={() => {}} />
                ))
              ) : (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-zinc-500 text-sm py-6 text-center"
                >
                  {searchQuery ? 'No quotes found' : 'No quotes yet. Be the first!'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        {/* New Comment Input - at the bottom */}
        <div className="mt-3 pt-3 border-t border-zinc-800">
          {/* Voice note preview with visualizer */}
          {voiceNote && (
            <div className="mb-3 rounded-xl overflow-hidden bg-zinc-800/50">
              <AudioVisualizer
                audioUrl={voiceNote.url}
                isPlaying={isPlayingPreview}
                onPlayPause={togglePreviewPlayback}
                className="w-full h-28"
                showStylePicker={true}
              />
              <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/80">
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

          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center gap-2 mb-2 bg-red-500/20 rounded-lg px-3 py-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm text-red-400">Recording... {recordingTime}s / {MAX_VOICE_DURATION}s</span>
              <button
                onClick={stopRecording}
                className="ml-auto flex items-center gap-1.5 bg-red-500 px-2.5 py-1 rounded-full text-white text-xs font-medium"
              >
                <Square className="w-3 h-3 fill-white" />
                Stop
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <Avatar className="w-8 h-8">
              <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=currentuser" />
              <AvatarFallback className="bg-zinc-700">U</AvatarFallback>
            </Avatar>
            <div className="flex-1 flex gap-2">
              <Input
                placeholder={activeTab === 'replies' ? 'Add a reply...' : 'Add a quote...'}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white text-sm h-9"
                onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                disabled={isRecording}
              />
              {!isRecording && !voiceNote && (
                <button
                  onClick={startRecording}
                  className="w-9 h-9 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
                  aria-label="Record voice note"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handlePostComment}
                disabled={!canPost || isRecording}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  canPost && !isRecording
                    ? "bg-zinc-700 text-white hover:bg-zinc-600"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                Post
              </button>
            </div>
          </div>
        </div>
      </Tabs>
    </motion.div>
  );
}
