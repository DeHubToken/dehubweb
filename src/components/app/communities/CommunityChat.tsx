/**
 * Community Chat
 * ===============
 * Full chat UI for community members. Matches SidebarChat style exactly.
 * Supports text, emoji, GIF, replies, and reactions.
 *
 * Moderation state (pinning, delete rights, mutes, slow mode, media rights) is
 * derived from useCommunityAbilities — a mirror of the server's rules, so every
 * control the database would refuse simply does not render. The server stays
 * the authority: nothing here is a security boundary.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Loader2, SmilePlus, Reply, CornerDownRight, X, MessageSquare, LogIn, Pencil, Check, Search, Trash2, ArrowDown, Pin, PinOff, MicOff, Ban } from 'lucide-react';
import { VoiceRecorder } from '../chat/VoiceRecorder';
import { VoiceWaveformPlayer } from '../chat/VoiceWaveformPlayer';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/lib/api/dehub';
import { toast } from 'sonner';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { EmojiGifPicker } from '../chat/EmojiGifPicker';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { useCommunityChat, type CommunityChatMessage } from '@/hooks/use-community-chat';
import { useCommunityAbilities } from '@/hooks/use-community-admin';
import type { Community, CommunityMember } from '@/hooks/use-communities';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { replaceLinksWithEmoji, TranslatableText, SharedTranslationContext } from '../TranslatableText';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MarkdownText } from '@/lib/markdown';
import assistantAvatar from '@/assets/ai-assistant-avatar.png';
import { Sparkles } from 'lucide-react';



const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀', '👀', '💯', '🙏'];

/** "Forever" mutes are stored as a date far in the future rather than as null. */
const FOREVER_YEAR = 9000;

/** mm:ss once we are past a minute, plain seconds below it. */
function formatCountdown(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${mins}:${String(rest).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

// Buy alert card imported from shared component
import { BuyAlertCard } from '../chat/BuyAlertCard';
import { useBuyBotHidden } from '@/hooks/use-buy-bot-hidden';

function ChatAvatar({ src, address, name }: { src?: string | null; address?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);
  const cdnUrl = address ? buildAvatarCdnFallbackUrl(address, src ?? undefined) : undefined;
  const activeSrc = failed ? cdnUrl : (src ?? undefined);
  return (
    <Avatar className="w-7 h-7">
      {activeSrc && !cdnFailed && (
        <AvatarImage
          src={activeSrc}
          onError={() => failed ? setCdnFailed(true) : setFailed(true)}
        />
      )}
      <AvatarFallback className="bg-zinc-700 text-white text-[10px] font-medium">
        {name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function ChatReactions({
  reactions,
  currentUserAddress,
  onReact,
  onRemoveReaction,
  messageId,
}: {
  reactions: Record<string, string[]>;
  currentUserAddress?: string;
  onReact: (id: string, emoji: string) => void;
  onRemoveReaction: (id: string, emoji: string) => void;
  messageId: string;
}) {
  const entries = Object.entries(reactions).filter(([, addrs]) => addrs.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-0.5 mt-0.5">
      {entries.map(([emoji, addresses]) => {
        const mine = currentUserAddress
          ? addresses.some((a) => a.toLowerCase() === currentUserAddress.toLowerCase())
          : false;
        return (
          <button
            key={emoji}
            onClick={() => mine ? onRemoveReaction(messageId, emoji) : onReact(messageId, emoji)}
            className={`group/reaction inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded-md border transition-colors ${
              mine
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <span className="text-xs">{emoji}</span>
            {mine ? (
              <>
                <span className="group-hover/reaction:hidden">{addresses.length}</span>
                <X className="w-2.5 h-2.5 hidden group-hover/reaction:block text-white" />
              </>
            ) : (
              <span>{addresses.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface CommunityChatProps {
  communityId: string;
  community: Community;
  membership: CommunityMember | null | undefined;
  isMember: boolean;
}

export function CommunityChat({ communityId, community, membership, isMember }: CommunityChatProps) {
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [adminThinking, setAdminThinking] = useState(false);
  const PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [highlight, setHighlight] = useState<{ id: string; nonce: number } | null>(null);
  const [pinPendingId, setPinPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommunityChatMessage | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [slowModeRemaining, setSlowModeRemaining] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const didInitialScrollRef = useRef(false);
  const prevScrollHeightRef = useRef<number | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingJumpRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const { isHidden: buyBotHidden, hide: hideBuyBot } = useBuyBotHidden();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { user } = useAuth();
  const { t } = useTranslation();
  const profileData = user ? {
    handle: user.username,
    name: user.displayName || user.display_name,
    avatarUrl: user.avatarImageUrl || user.avatarUrl || user.avatar_url,
  } : null;

  const abilities = useCommunityAbilities(community, membership);
  const canPinMessages = abilities.can('pin_messages');
  const canDeleteAnyMessage = abilities.can('delete_messages');
  const canSendMedia = abilities.can('send_media');
  const canSendMessages = abilities.can('send_messages');

  const {
    messages,
    pinnedMessage,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    setPinned,
    addReaction,
    removeReaction,
  } = useCommunityChat(communityId, { isPrivate: community.is_private });

  // ─── Slow mode ────────────────────────────────────────────────────────────
  // Owners and admins are exempt server-side, so only plain members see this.
  // The countdown is feedback only — the database raises slow_mode_active on
  // its own clock, so the last-send stamp lives in localStorage purely to keep
  // the timer honest across a reload rather than to gate anything.
  const slowModeSeconds = community?.slow_mode_seconds ?? 0;
  const slowModeApplies = slowModeSeconds > 0 && abilities.role === 'member';
  const slowModeKey = walletAddress && communityId
    ? `community-slow-mode:${communityId}:${walletAddress.toLowerCase()}`
    : null;

  const readSlowModeRemaining = useCallback(() => {
    if (!slowModeApplies || !slowModeKey) return 0;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(slowModeKey);
    } catch {
      return 0;
    }
    const lastSentAt = raw ? Number(raw) : 0;
    if (!Number.isFinite(lastSentAt) || lastSentAt <= 0) return 0;
    const elapsed = (Date.now() - lastSentAt) / 1000;
    return Math.max(0, Math.min(slowModeSeconds, Math.ceil(slowModeSeconds - elapsed)));
  }, [slowModeApplies, slowModeKey, slowModeSeconds]);

  useEffect(() => {
    if (!slowModeApplies) {
      setSlowModeRemaining(0);
      return;
    }
    setSlowModeRemaining(readSlowModeRemaining());
    const timer = window.setInterval(() => {
      setSlowModeRemaining(readSlowModeRemaining());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [slowModeApplies, readSlowModeRemaining]);

  const startSlowModeCountdown = useCallback(() => {
    if (!slowModeApplies || !slowModeKey) return;
    try {
      window.localStorage.setItem(slowModeKey, String(Date.now()));
    } catch {
      // Private mode / storage disabled — the timer just won't survive a reload.
    }
    setSlowModeRemaining(slowModeSeconds);
  }, [slowModeApplies, slowModeKey, slowModeSeconds]);

  const humanisedInterval = useMemo(() => {
    if (slowModeSeconds >= 3600) {
      const hours = Math.round(slowModeSeconds / 3600);
      return hours === 1
        ? t('communities.chat.intervalHour', { defaultValue: '1 hour' })
        : t('communities.chat.intervalHours', { defaultValue: '{{count}} hours', count: hours });
    }
    if (slowModeSeconds >= 60) {
      const minutes = Math.round(slowModeSeconds / 60);
      return minutes === 1
        ? t('communities.chat.intervalMinute', { defaultValue: '1 minute' })
        : t('communities.chat.intervalMinutes', { defaultValue: '{{count}} minutes', count: minutes });
    }
    return slowModeSeconds === 1
      ? t('communities.chat.intervalSecond', { defaultValue: '1 second' })
      : t('communities.chat.intervalSeconds', { defaultValue: '{{count}} seconds', count: slowModeSeconds });
  }, [slowModeSeconds, t]);

  // ─── Why the composer may be closed, in the order the server checks ───────
  const mutedNotice = useMemo(() => {
    const until = abilities.mutedUntil;
    if (!until || until.getFullYear() >= FOREVER_YEAR) {
      return t('communities.chat.muted', { defaultValue: 'You are muted' });
    }
    return t('communities.chat.mutedUntil', {
      defaultValue: 'You are muted until {{until}}',
      until: until.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    });
  }, [abilities.mutedUntil, t]);

  const composerNotice: { icon: React.ReactNode; text: React.ReactNode } | null = abilities.isMuted
    ? { icon: <MicOff className="w-4 h-4" />, text: mutedNotice }
    : !canSendMessages
      ? {
          icon: <Ban className="w-4 h-4" />,
          text: t('communities.chat.postingDisabled', { defaultValue: 'Posting is disabled for members here' }),
        }
      : null;

  // Filter by search query (searches content + sender names)
  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => {
      const name = (m.display_name || m.username || '').toLowerCase();
      return m.content?.toLowerCase().includes(q) || name.includes(q);
    });
  }, [messages, searchQuery]);

  // Paginate: show last `visibleCount` messages. When searching, show all matches.
  const displayedMessages = useMemo(() => {
    if (searchQuery.trim()) return filteredMessages;
    if (filteredMessages.length <= visibleCount) return filteredMessages;
    return filteredMessages.slice(filteredMessages.length - visibleCount);
  }, [filteredMessages, visibleCount, searchQuery]);

  const hasMore = !searchQuery.trim() && filteredMessages.length > displayedMessages.length;

  // Initial scroll to bottom once messages first load
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (messages.length === 0) return;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      didInitialScrollRef.current = true;
    });
  }, [messages.length]);

  // Auto-scroll to bottom on new message arrival (only if user is near bottom)
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!didInitialScrollRef.current) return;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
    if (distanceFromBottom < 120) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    } else {
      // New message arrived while the user is scrolled up — surface the
      // "jump to latest" button with an unread count (matches DM behaviour).
      setNewMessageCount((c) => c + 1);
      setShowJumpToLatest(true);
    }
  }, [lastMessageId]);

  // Preserve scroll position when loading older messages
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    if (prevScrollHeightRef.current != null) {
      const diff = scrollContainer.scrollHeight - prevScrollHeightRef.current;
      scrollContainer.scrollTop = diff;
      prevScrollHeightRef.current = null;
    }
  }, [visibleCount]);

  // Jumping to the pinned message: if it sits above the paginated window we
  // widen the window first and finish the jump once its node exists.
  const jumpToMessage = useCallback((messageId: string) => {
    const node = messageRefs.current[messageId];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlight({ id: messageId, nonce: Date.now() });
      return;
    }
    pendingJumpRef.current = messageId;
    setVisibleCount((c) => Math.max(c, messages.length));
  }, [messages.length]);

  useEffect(() => {
    const pending = pendingJumpRef.current;
    if (!pending) return;
    const node = messageRefs.current[pending];
    if (!node) {
      // Already inside the rendered window but with no bubble of its own (bot
      // cards) — drop the jump rather than leaving it armed forever.
      if (displayedMessages.some(m => m.id === pending)) pendingJumpRef.current = null;
      return;
    }
    pendingJumpRef.current = null;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight({ id: pending, nonce: Date.now() });
  }, [displayedMessages]);

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 1500);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpToLatest(distanceFromBottom > 100);
    if (distanceFromBottom < 50) setNewMessageCount(0);
    if (el.scrollTop <= 0 && hasMore) {
      prevScrollHeightRef.current = el.scrollHeight;
      setVisibleCount((c) => c + PAGE_SIZE);
    }
  }, [hasMore]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setNewMessageCount(0);
    setShowJumpToLatest(false);
  }, []);

  const handleSetPinned = useCallback(async (messageId: string, pinned: boolean) => {
    setPinPendingId(messageId);
    try {
      await setPinned(messageId, pinned);
    } finally {
      setPinPendingId(null);
    }
  }, [setPinned]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletePending(true);
    try {
      await deleteMessage(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeletePending(false);
    }
  }, [deleteTarget, deleteMessage]);

  const handleSend = async () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (slowModeRemaining > 0) return;
    const trimmed = newMessage.trim();
    if (!trimmed) return;
    const replyToId = replyTo?.id;
    setReplyTo(null);
    setNewMessage('');

    // Detect /admin command
    const adminMatch = trimmed.match(/^\/admin\b\s*(.*)$/i);

    let sent = false;
    try {
      await sendMessage(trimmed, 'text', undefined, replyToId, {
        username: profileData?.handle || undefined,
        displayName: profileData?.name || undefined,
        avatarUrl: profileData?.avatarUrl || undefined,
        badgeBalance: user?.badgeBalance || undefined,
      });
      sent = true;
    } catch {
      // Error handled in hook
    }
    if (sent) startSlowModeCountdown();

    if (adminMatch) {
      const prompt = (adminMatch[1] || '').trim();
      if (!prompt) {
        toast.info('Try: /admin <your question>');
        return;
      }
      setAdminThinking(true);
      try {
        const { error } = await supabase.functions.invoke('community-admin-chat', {
          body: {
            communityId,
            prompt,
            askerName: profileData?.name || profileData?.handle || 'Member',
          },
        });
        if (error) throw error;
      } catch (err: any) {
        console.error('[CommunityChat] AI Admin error:', err);
        toast.error(err?.message || 'AI Admin failed to respond');
      } finally {
        setAdminThinking(false);
      }
    }
  };


  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => (prev + emoji).slice(0, 500));
  };

  const handleGifSelect = async (gifUrl: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (slowModeRemaining > 0) return;
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      await sendMessage(gifUrl, 'gif', gifUrl, replyToId, {
        username: profileData?.handle || undefined,
        displayName: profileData?.name || undefined,
        avatarUrl: profileData?.avatarUrl || undefined,
        badgeBalance: user?.badgeBalance || undefined,
      });
      startSlowModeCountdown();
    } catch {
      // Error handled in hook
    }
  };

  const handleVoiceRecordingComplete = useCallback(async (blob: Blob, _duration: number) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const toastId = 'community-voice-upload';
    toast.loading('Uploading voice note...', { id: toastId });
    try {
      const token = getAuthToken();
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', file, file.name);
      const { data, error } = await supabase.functions.invoke('dm-upload-media', {
        body: formData,
        headers: {
          'x-wallet-address': walletAddress?.toLowerCase() || '',
          'x-dehub-token': token || '',
        },
      });
      if (error || !data?.ok || !data?.url) {
        throw new Error(data?.error || error?.message || 'Upload failed');
      }
      await sendMessage(data.url, 'voice', data.url, replyTo?.id, {
        username: profileData?.handle || undefined,
        displayName: profileData?.name || undefined,
        avatarUrl: profileData?.avatarUrl || undefined,
        badgeBalance: user?.badgeBalance || undefined,
      });
      setReplyTo(null);
      startSlowModeCountdown();
      toast.success('Voice note sent!', { id: toastId });
    } catch (err: any) {
      console.error('[CommunityChat] Voice upload failed:', err);
      toast.error(err?.message || 'Failed to send voice note', { id: toastId });
    }
  }, [isAuthenticated, walletAddress, sendMessage, replyTo, profileData, user, openLoginModal, startSlowModeCountdown]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReact = useCallback((messageId: string, emoji: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const msg = messages.find(m => m.id === messageId);
    const myReaction = walletAddress && msg?.reactions?.[emoji]?.some(
      (a) => a.toLowerCase() === walletAddress.toLowerCase()
    );
    if (myReaction) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
    }
  }, [isAuthenticated, walletAddress, messages, addReaction, removeReaction]);

  const pinnedSenderName = pinnedMessage
    ? pinnedMessage.display_name
      || pinnedMessage.username
      || (pinnedMessage.wallet_address
        ? `${pinnedMessage.wallet_address.slice(0, 6)}...${pinnedMessage.wallet_address.slice(-4)}`
        : 'Anon')
    : '';
  const pinnedPreview = pinnedMessage
    ? (pinnedMessage.content
      || (pinnedMessage.message_type === 'gif'
        ? t('communities.chat.pinnedGif', { defaultValue: 'GIF' })
        : t('communities.chat.pinnedMedia', { defaultValue: 'Media' })))
    : '';

  const translateSignal = 0;
  const originalSignal = 0;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 340px)', minHeight: '300px' }}>
      <SharedTranslationContext.Provider value={{ translateSignal, originalSignal, requestTranslate: () => {}, requestOriginal: () => {} }}>
        {/* Search bar */}
        <div className="px-1 pb-1 flex items-center gap-1">
          {showSearch ? (
            <div className="flex items-center gap-1.5 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('communities.searchMessages', 'Search messages')}
                className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder:text-zinc-500"
              />
              <button
                onClick={() => { setSearchQuery(''); setShowSearch(false); }}
                className="p-0.5 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              {t('communities.searchMessages', 'Search')}
            </button>
          )}
        </div>
        {/* Messages area */}
        <div className="relative flex-1">
          <div ref={scrollRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto py-2 space-y-2">
            {/* Pinned message banner */}
            {pinnedMessage && (
              <div className="sticky top-0 z-20 mx-3 flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/85 backdrop-blur-xl px-2.5 py-1.5">
                <Pin className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <button
                  onClick={() => jumpToMessage(pinnedMessage.id)}
                  className="flex-1 min-w-0 text-left"
                  title={t('communities.chat.jumpToPinned', { defaultValue: 'Jump to the pinned message' })}
                >
                  <span className="block text-[10px] text-zinc-500">
                    {t('communities.chat.pinnedMessage', { defaultValue: 'Pinned message' })}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-300">
                    <span className="font-medium text-white">{pinnedSenderName}</span>
                    {' '}
                    {pinnedPreview}
                  </span>
                </button>
                {canPinMessages && (
                  <button
                    onClick={() => handleSetPinned(pinnedMessage.id, false)}
                    disabled={pinPendingId === pinnedMessage.id}
                    className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors flex-shrink-0 disabled:opacity-50"
                    title={t('communities.chat.unpin', { defaultValue: 'Unpin' })}
                    aria-label={t('communities.chat.unpin', { defaultValue: 'Unpin' })}
                  >
                    {pinPendingId === pinnedMessage.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <X className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            )}
            {isLoading ? (
              <div className="space-y-3 py-2 px-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Skeleton className="w-7 h-7 rounded-full bg-white/[0.06]" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-3 w-20 bg-white/[0.06]" />
                      <Skeleton className="h-3 w-40 bg-white/[0.06]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
                  <MessageSquare className="w-6 h-6 text-zinc-500" />
                </div>
                <p className="text-zinc-500 text-sm">{t('communities.noMessagesYet')}</p>
                <p className="text-zinc-600 text-xs mt-1">{t('communities.beFirstToChat')}</p>
              </div>
            ) : displayedMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-3">
                <p className="text-zinc-500 text-sm">No messages match "{searchQuery}"</p>
              </div>
            ) : (
              <>
                {hasMore && (
                  <div className="flex justify-center py-1">
                    <button
                      onClick={() => {
                        const el = scrollRef.current;
                        if (el) prevScrollHeightRef.current = el.scrollHeight;
                        setVisibleCount((c) => c + PAGE_SIZE);
                      }}
                      className="text-[11px] text-zinc-500 hover:text-white px-2 py-1 rounded-md hover:bg-white/[0.04] transition-colors"
                    >
                      Load older messages
                    </button>
                  </div>
                )}
                {displayedMessages.map((msg) => {
                // Buy alert messages get a special card treatment
                if (msg.message_type === 'buy_alert') {
                  if (buyBotHidden) return null;
                  return (
                    <BuyAlertCard
                      key={msg.id}
                      content={msg.content}
                      timestamp={msg.created_at}
                      onHide={hideBuyBot}
                    />
                  );
                }

                // AI Admin response — styled like the AI Assistant page
                if (msg.message_type === 'admin_response') {
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-2 px-3"
                    >
                      <img
                        src={assistantAvatar}
                        alt="AI Admin"
                        className="w-7 h-7 rounded-lg shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="text-xs font-semibold text-white">AI Admin</span>
                          <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide text-white/70 px-1.5 py-[1px] rounded-md bg-white/10 border border-white/15">
                            <Sparkles className="w-2.5 h-2.5" /> bot
                          </span>
                          <span className="text-zinc-600 text-[10px]">{formatTimeAgo(msg.created_at)}</span>
                        </span>
                        <div className="mt-1 rounded-2xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-3 py-2 text-white">
                          <MarkdownText content={msg.content} className="text-xs" />
                        </div>
                      </div>
                    </motion.div>
                  );
                }



                const avatarUrl = buildAvatarUrl(msg.wallet_address, msg.avatar_url);
                const name = msg.display_name || msg.username || msg.wallet_address?.slice(0, 8) || 'Anon';
                const handle = msg.username;
                const goToProfile = handle ? () => navigate(`/${handle}`) : undefined;
                const isMine = !!walletAddress && msg.wallet_address?.toLowerCase() === walletAddress.toLowerCase();
                const canDeleteThis = isMine || canDeleteAnyMessage;
                const isPinned = !!msg.pinned_at;
                const isHighlighted = highlight?.id === msg.id;

                return (
                  <div
                    key={msg.id}
                    ref={(node) => { messageRefs.current[msg.id] = node; }}
                    className={`group relative px-3 py-0.5 rounded-xl transition-shadow duration-300 ${isHighlighted ? 'ring-1 ring-white/30' : ''}`}
                  >
                    {msg.reply_to && (
                      <div className="flex items-center gap-1 text-[10px] text-zinc-500 ml-9 mb-0.5">
                        <CornerDownRight className="w-2.5 h-2.5" />
                        <span className="font-medium">{msg.reply_to.sender_name}</span>
                        <span className="truncate max-w-[200px]">{msg.reply_to.content}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <button onClick={goToProfile} disabled={!handle} className={`flex-shrink-0 ${handle ? 'cursor-pointer' : 'cursor-default'}`}>
                        <ChatAvatar src={avatarUrl} address={msg.wallet_address} name={name} />
                      </button>
                       <div className="min-w-0 flex-1">
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="relative inline-flex items-baseline shrink min-w-0 pr-3">
                            <button onClick={goToProfile} disabled={!handle} className={`text-xs font-semibold text-white truncate ${handle ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>
                              {name}
                            </button>
                            <BadgeIcon badgeBalance={(msg as any).badge_balance} username={msg.username} className="w-[9px] h-[9px] absolute -top-0.5 -right-0" />
                          </span>
                          <span className="text-zinc-600 text-[10px]">{formatTimeAgo(msg.created_at)}</span>
                          {isPinned && (
                            <span
                              className="inline-flex items-center text-zinc-500"
                              title={t('communities.chat.pinnedMessage', { defaultValue: 'Pinned message' })}
                            >
                              <Pin className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </span>
                        {msg.message_type === 'gif' && msg.image_url ? (
                          <img src={msg.image_url} alt="GIF" className="max-w-[280px] max-h-32 rounded mt-0.5" loading="lazy" />
                        ) : msg.message_type === 'voice' && msg.image_url ? (
                          <div className="mt-1">
                            <VoiceWaveformPlayer src={msg.image_url} />
                          </div>
                        ) : editingId === msg.id ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  editMessage(msg.id, editText);
                                  setEditingId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingId(null);
                                }
                              }}
                              className="flex-1 text-xs text-white bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-white/20"
                              maxLength={500}
                            />
                            <button
                              onClick={() => { editMessage(msg.id, editText); setEditingId(null); }}
                              className="p-0.5 text-emerald-400 hover:text-emerald-300"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-0.5 text-zinc-500 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <TranslatableText text={msg.content} className="text-xs text-zinc-300 break-words" as="p" />
                        )}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <ChatReactions
                            reactions={msg.reactions}
                            currentUserAddress={walletAddress || undefined}
                            onReact={addReaction}
                            onRemoveReaction={removeReaction}
                            messageId={msg.id}
                          />
                        )}
                      </div>
                      {isAuthenticated && isMember && (
                        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                          {isMine && msg.message_type !== 'gif' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => { setEditingId(msg.id); setEditText(msg.content); }}
                                  className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
                                  aria-label={t('communities.edit')}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">{t('communities.edit')}</TooltipContent>
                            </Tooltip>
                          )}
                          {canPinMessages && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleSetPinned(msg.id, !isPinned)}
                                  disabled={pinPendingId === msg.id}
                                  className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded disabled:opacity-50"
                                  aria-label={isPinned
                                    ? t('communities.chat.unpin', { defaultValue: 'Unpin' })
                                    : t('communities.chat.pin', { defaultValue: 'Pin' })}
                                >
                                  {pinPendingId === msg.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : isPinned ? (
                                    <PinOff className="w-3.5 h-3.5" />
                                  ) : (
                                    <Pin className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {isPinned
                                  ? t('communities.chat.unpin', { defaultValue: 'Unpin' })
                                  : t('communities.chat.pin', { defaultValue: 'Pin' })}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {canDeleteThis && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setDeleteTarget(msg)}
                                  className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors rounded"
                                  aria-label={t('communities.chat.delete', { defaultValue: 'Delete' })}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {t('communities.chat.delete', { defaultValue: 'Delete' })}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setReplyTo(msg)}
                                className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
                                aria-label={t('communities.reply')}
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t('communities.reply')}</TooltipContent>
                          </Tooltip>
                          <Popover>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                  <button
                                    className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
                                    aria-label={t('communities.react')}
                                  >
                                    <SmilePlus className="w-3.5 h-3.5" />
                                  </button>
                                </PopoverTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="top">{t('communities.react')}</TooltipContent>
                            </Tooltip>
                            <PopoverContent
                              side="top"
                              align="end"
                              className="w-auto p-1 bg-zinc-800 border-zinc-700 rounded-xl"
                            >
                              <div className="flex gap-0.5">
                                {QUICK_EMOJIS.map((emoji) => {
                                  const isActive = walletAddress && msg.reactions?.[emoji]?.some(
                                    (a) => a.toLowerCase() === walletAddress.toLowerCase()
                                  );
                                  return (
                                    <button
                                      key={emoji}
                                      onClick={() => handleReact(msg.id, emoji)}
                                      className={`w-8 h-8 flex items-center justify-center text-sm rounded-lg transition-colors ${
                                        isActive ? 'bg-white/15 ring-1 ring-white/30' : 'hover:bg-zinc-700'
                                      }`}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </>
            )}
            {adminThinking && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 px-3"
              >
                <img src={assistantAvatar} alt="AI Admin" className="w-7 h-7 rounded-lg shrink-0 mt-0.5" />
                <div className="mt-1 rounded-2xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-3 py-2 inline-flex items-center gap-1.5 text-white/80 text-xs">
                  <Sparkles className="w-3 h-3 animate-pulse" />
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1 h-1 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '240ms' }} />
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />

          </div>

          {/* Jump to latest — appears when scrolled up, like DMs */}
          {(showJumpToLatest || newMessageCount > 0) && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium shadow-lg border border-white/10 transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              {newMessageCount > 0
                ? `${newMessageCount} new message${newMessageCount > 1 ? 's' : ''}`
                : 'Jump to latest'}
            </button>
          )}
        </div>
      </SharedTranslationContext.Provider>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-1.5 mx-1 mb-1 px-2 py-1 bg-zinc-800/70 rounded-lg border-l-2 border-white/30">
          <Reply className="w-3.5 h-3.5 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-white">
              {replyTo.display_name || replyTo.username || 'User'}
            </span>
            <p className="text-[10px] text-zinc-400 truncate">{replyTo.content || 'Media'}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="flex-shrink-0 p-0.5 text-zinc-500 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      {!isMember ? (
        <div className="px-1 py-3">
          <button
            onClick={() => !isAuthenticated ? openLoginModal() : null}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 text-sm hover:text-white transition-colors"
          >
            <LogIn className="w-4 h-4" />
            {t('communities.joinToChat')}
          </button>
        </div>
      ) : composerNotice ? (
        <div className="px-1 py-3">
          <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 text-sm text-center px-3">
            {composerNotice.icon}
            <span>{composerNotice.text}</span>
          </div>
        </div>
      ) : (
        <div className="px-1 py-2">
          {slowModeApplies && (
            <p className="text-zinc-500 text-xs px-1 pb-1">
              {t('communities.chat.slowMode', {
                defaultValue: 'Slow mode: one message every {{interval}}',
                interval: humanisedInterval,
              })}
            </p>
          )}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <div className="relative">
              <span className="absolute top-1 right-0 text-[10px] text-zinc-600 z-10">{newMessage.length}/500</span>
              <Textarea
                ref={textareaRef}
                placeholder={`Type here...`}
                value={newMessage}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.length <= 500) {
                    setNewMessage(val);
                  }
                  const ta = e.target;
                  requestAnimationFrame(() => {
                    ta.style.height = 'auto';
                    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
                  });
                }}
                onKeyDown={handleKeyDown}
                maxLength={500}
                className="min-h-[36px] max-h-32 resize-none text-sm bg-transparent border-none text-white placeholder:text-zinc-500 p-0 pt-1 pr-12 focus-visible:ring-0 focus-visible:ring-offset-0 leading-[1.35]"
                rows={1}
                style={{ fieldSizing: 'content' } as React.CSSProperties}
              />
            </div>
            <div className="flex items-center justify-end pt-1">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setNewMessage(prev => {
                      if (/^\/admin\b/i.test(prev)) return prev;
                      const next = prev.trim().length ? `/admin ${prev}` : '/admin ';
                      return next.slice(0, 500);
                    });
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  title="Ask AI Admin (/admin)"
                  aria-label="Ask AI Admin"
                >
                  <Sparkles className="w-5 h-5" />
                </Button>
                {canSendMedia && (
                  <>
                    <EmojiGifPicker
                      onEmojiSelect={handleEmojiSelect}
                      onGifSelect={handleGifSelect}
                    />
                    <VoiceRecorder
                      onRecordingComplete={handleVoiceRecordingComplete}
                      disabled={!isAuthenticated}
                    />
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSend}
                  disabled={!newMessage.trim() || slowModeRemaining > 0}
                  className={`h-8 text-zinc-400 hover:text-white hover:bg-zinc-700 ${slowModeRemaining > 0 ? 'w-auto min-w-8 px-1.5' : 'w-8'}`}
                  title={slowModeRemaining > 0
                    ? t('communities.chat.slowModeWait', {
                        defaultValue: 'Slow mode — wait {{time}}',
                        time: formatCountdown(slowModeRemaining),
                      })
                    : t('communities.chat.send', { defaultValue: 'Send' })}
                  aria-label={t('communities.chat.send', { defaultValue: 'Send' })}
                >
                  {slowModeRemaining > 0
                    ? <span className="text-[11px] tabular-nums">{formatCountdown(slowModeRemaining)}</span>
                    : <Send className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deletePending) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-zinc-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {t('communities.chat.deleteMessageTitle', { defaultValue: 'Delete this message?' })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t('communities.chat.deleteMessageBody', { defaultValue: 'This cannot be undone.' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending} className="rounded-xl h-9 px-3">
              {t('communities.chat.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
              disabled={deletePending}
              className="rounded-xl h-9 px-3 bg-transparent text-red-400 hover:bg-red-500/15 border border-white/[0.08] gap-1.5"
            >
              {deletePending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('communities.chat.delete', { defaultValue: 'Delete' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
