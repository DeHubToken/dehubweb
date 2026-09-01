/**
 * Live Post Chat Component
 * ========================
 * Displays a live chat feed below the stream on the single post page.
 * Uses the livechat_messages table with realtime subscriptions.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { MessageSquare, Send, Loader2, Eye, Mic, Languages, RotateCcw, Pin, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { useDraft } from '@/hooks/use-draft';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { replaceLinksWithEmoji, renderTextWithLinks } from '@/components/app/TranslatableText';
import { useTranslation as useTextTranslation } from '@/components/app/TranslatableText';
import { useLiveChatMessages } from '@/hooks/use-livechat';
import { useStreamAudience } from '@/hooks/use-stream-audience';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { getMediaUrl, getAuthToken, uploadLiveChatVoice } from '@/lib/api/dehub';
import { pinLiveChatMessage, unpinLiveChatMessage, streamChatRoomId } from '@/lib/api/dehub/livechat';
import { VoiceRecorder } from '@/components/app/chat/VoiceRecorder';
import { VoiceWaveformPlayer } from '@/components/app/chat/VoiceWaveformPlayer';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseLiveChatMessage } from '@/hooks/use-livechat';

/** Avatar with cascading fallback: primary → CDN → initials */
function LiveChatAvatar({ src, address, name }: { src?: string | null; address?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);
  const cdnUrl = address ? buildAvatarCdnFallbackUrl(address, src ?? undefined) : undefined;
  const activeSrc = failed ? cdnUrl : (src ?? undefined);
  return (
    <Avatar className="w-6 h-6 rounded-md flex-shrink-0 mt-0.5">
      {activeSrc && !cdnFailed && (
        <AvatarImage
          src={activeSrc}
          className="rounded-md"
          onError={() => failed ? setCdnFailed(true) : setFailed(true)}
        />
      )}
      <AvatarFallback className="bg-zinc-700 text-white text-[10px] rounded-md">
        {name[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Live chat badge */
function LiveChatBadge({ badgeBalance, username }: { badgeBalance?: number | null; username?: string | null }) {
  return <BadgeIcon badgeBalance={badgeBalance} username={username} className="w-[9px] h-[9px] absolute -top-0.5 -right-0" />;
}

/** Translatable text message with inline translate button */
function TranslatableChatMsg({ content }: { content: string }) {
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslateLoading,
    error: translateError,
    isTooShort,
    handleTranslate,
    handleShowOriginal,
  } = useTextTranslation(content);

  return (
    <div>
      <p className="text-sm text-zinc-300 break-words whitespace-pre-wrap">
        {renderTextWithLinks(isTranslated ? translatedText : content)}
      </p>
      <div className="flex items-center gap-1 mt-0.5">
        {!isTooShort && (
          isTranslateLoading ? (
            <Loader2 className="w-2.5 h-2.5 text-zinc-500 animate-spin" />
          ) : isTranslated ? (
            <button onClick={handleShowOriginal} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          ) : (
            <button onClick={handleTranslate} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
              <Languages className="w-3 h-3" />
            </button>
          )
        )}
        {translateError && (
          <span className="text-zinc-500 text-[10px]">{translateError}</span>
        )}
      </div>
    </div>
  );
}

interface LivePostChatProps {
  /**
   * The post's tokenId — what the stream's chat room is keyed on.
   *
   * It used to be whatever each caller happened to have: the post page passed
   * the tokenId, the broadcaster passed the stream's Mongo ObjectId, and the
   * two never matched. Nobody noticed, because the backend discarded the room
   * id and put every message in the platform's global room — so host and
   * viewers were in the same conversation by accident, along with everyone
   * else on DeHub. Now that rooms are real, both ends have to name the same
   * one, and the tokenId is the only id both callers have.
   */
  tokenId: string;
  /**
   * The stream's Mongo ObjectId — the id every /api/live/{id}/* route takes,
   * NOT the numeric tokenId above. Only used to resolve the audience figure in
   * the header; the chat itself is keyed by tokenId. Omit it and the header
   * simply carries no number.
   */
  streamId?: string;
  isOffline?: boolean;
  /** Whether the current user is the stream host (can pin messages) */
  isHost?: boolean;
  /**
   * Render over the video instead of inside a card.
   *
   * The broadcaster's phone layout is full-bleed — the camera IS the screen —
   * so a bordered slab with its own header sat on the picture like a sticker,
   * and its viewer count repeated the one already in the corner. Overlay mode
   * drops the chrome: no panel, no header, messages ride the shade that
   * darkens the foot of the screen, and the list masks out as it climbs so
   * old lines dissolve into the frame instead of meeting a hard edge.
   */
  overlay?: boolean;
}

export function LivePostChat({ tokenId, streamId: liveStreamId, isOffline = false, isHost = false, overlay = false }: LivePostChatProps) {
  const streamId = tokenId ? streamChatRoomId(tokenId) : '';
  // The card unmounts every time the post scrolls out of the feed, so without
  // this a line typed under a stream is gone the moment you look away.
  const [newMessage, setNewMessage] = useDraft(streamId ? `live:${streamId}` : null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { isAuthenticated, walletAddress } = useAuth();

  // Pinned message state — prefer server-side is_pinned, fallback to local
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [isPinning, setIsPinning] = useState(false);
  const [contextMenuMsg, setContextMenuMsg] = useState<SupabaseLiveChatMessage | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  const mention = useMention({
    inputRef: textareaRef,
    onMentionInsert: (_user, newText) => setNewMessage(newText),
  });

  const { messages, isLoading, isSending, send } = useLiveChatMessages(streamId);
  // The stream's real audience, shared with the host's broadcast console. This
  // slot used to hold `useLiveChatPresence`, which ignores the room it is given
  // and returns the number of people connected to the ONE global platform chat
  // — so a stream with nobody watching read "3" here beside a truthful "0" on
  // the host's own overlay. Null when the caller has no stream ObjectId to
  // resolve, and then nothing is drawn: no number beats a wrong one.
  const watching = useStreamAudience(liveStreamId, !isOffline);

  // Sync pinned message from server data
  useEffect(() => {
    const serverPinned = messages.find(m => m.is_pinned);
    if (serverPinned) setPinnedMessageId(serverPinned.id);
  }, [messages]);

  const pinnedMessage = messages.find(m => m.id === pinnedMessageId) ?? null;

  // Auto-scroll on new messages
  useEffect(() => {
    if (bottomRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      });
    }
  }, [messages.length]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuMsg) return;
    const close = () => setContextMenuMsg(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenuMsg]);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = messageRefs.current.get(messageId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-white/10');
      setTimeout(() => el.classList.remove('bg-white/10'), 1200);
    }
  }, []);

  const handlePinMessage = useCallback(async (msg: SupabaseLiveChatMessage) => {
    setContextMenuMsg(null);
    setIsPinning(true);
    try {
      await pinLiveChatMessage(streamId, msg.id);
      setPinnedMessageId(msg.id);
    } catch {
      toast.error('Failed to pin message');
    } finally {
      setIsPinning(false);
    }
  }, [streamId]);

  const handleUnpinMessage = useCallback(async () => {
    if (!pinnedMessageId) return;
    setIsPinning(true);
    try {
      await unpinLiveChatMessage(streamId, pinnedMessageId);
      setPinnedMessageId(null);
    } catch {
      toast.error('Failed to unpin message');
    } finally {
      setIsPinning(false);
    }
  }, [streamId, pinnedMessageId]);

  const handleMessageContextMenu = useCallback((e: React.MouseEvent, msg: SupabaseLiveChatMessage) => {
    if (!isHost) return;
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuMsg(msg);
  }, [isHost]);

  const handleVoiceRecordingComplete = useCallback(async (blob: Blob, _duration: number) => {
    if (!isAuthenticated) {
      toast.error('Sign in to send voice notes');
      return;
    }
    const toastId = 'livechat-voice-upload';
    toast.loading('Uploading voice note...', { id: toastId });
    try {
      const { url, duration } = await uploadLiveChatVoice(blob);
      await send('', 'audio', undefined, undefined, url, duration);
      toast.success('Voice note sent!', { id: toastId });
    } catch (err: any) {
      console.error('[LiveChat] Voice upload failed:', err);
      toast.error(err?.message || 'Failed to send voice note', { id: toastId });
    }
  }, [isAuthenticated, send]);

  const handleSend = async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to chat');
      return;
    }
    try {
      await send(newMessage.trim());
      setNewMessage('');
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        overlay
          ? 'flex min-h-0 flex-1 flex-col justify-end'
          : 'rounded-xl border border-white/[0.12] bg-white/[0.03] p-3'
      )}
    >
      {/* Header — the overlay has none. The host already has the room's
          numbers over the picture, and a title bar is the panel this layout
          is trying not to be. */}
      <div className={cn('flex items-center justify-between mb-3', overlay && 'hidden')}>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-zinc-400" />
          <h3 className="font-semibold text-white text-sm">Live Chat</h3>
          {isOffline && (
            <span className="text-xs text-zinc-500 px-2 py-0.5 rounded-full bg-zinc-800">Offline</span>
          )}
        </div>
        {/* The audience, not the platform. A bare people-icon-plus-number is
            exactly what the old global count looked like, so this one says
            what it is counting. */}
        {watching !== null && (
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs" title="People watching this stream right now">
            <Eye className="w-3.5 h-3.5" />
            <span>{watching} watching</span>
          </div>
        )}
      </div>

      {/* Pinned message banner (Telegram style) */}
      {pinnedMessage && (
        <button
          onClick={() => scrollToMessage(pinnedMessage.id)}
          className={cn(
            'w-full flex items-center gap-2 mb-2 px-3 py-2 border-l-2 border-blue-400 text-left transition-colors group',
            overlay
              ? 'rounded-xl bg-black/40 backdrop-blur-md hover:bg-black/50'
              : 'rounded-lg bg-white/[0.06] hover:bg-white/10'
          )}
        >
          <Pin className="w-3.5 h-3.5 text-blue-400 shrink-0 fill-current" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-blue-400 font-medium leading-none mb-0.5">Pinned Message</p>
            <p className="text-xs text-zinc-300 truncate">
              {pinnedMessage.content || (pinnedMessage.message_type === 'voice' ? '🎤 Voice message' : '📎 Media')}
            </p>
          </div>
          {isHost && (
            <button
              onClick={(e) => { e.stopPropagation(); handleUnpinMessage(); }}
              disabled={isPinning}
              className="shrink-0 text-zinc-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </button>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className={cn(
          'overflow-y-auto scrollbar-hide',
          overlay
            // The mask lives on the scroller, so the dissolve stays pinned to
            // the top edge while messages travel under it. -webkit- kept for
            // the iOS Safari this layout exists for.
            ? 'min-h-0 flex-1 max-h-[42vh] space-y-0.5 mb-2 pr-1 [text-shadow:0_1px_3px_rgb(0_0_0/0.85)] [mask-image:linear-gradient(to_bottom,transparent,#000_3.5rem)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,#000_3.5rem)]'
            : 'h-64 space-y-1 mb-3'
        )}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-zinc-500 text-sm">
              {isOffline ? 'Chat is no longer active' : 'No messages yet. Be the first!'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const avatarUrl = msg.sender_avatar_url
              ? buildAvatarUrl(msg.sender_address, msg.sender_avatar_url)
              : undefined;
            const displayName = msg.sender_display_name || msg.sender_username || msg.sender_address.slice(0, 8);
            const isPinned = msg.id === pinnedMessageId;

            return (
              <div
                key={msg.id}
                ref={(el) => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }}
                onContextMenu={(e) => handleMessageContextMenu(e, msg)}
                className={`group py-1.5 px-1 rounded-lg transition-colors duration-700 ${isPinned ? 'bg-blue-400/5 border-l-2 border-blue-400/50 pl-2' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <LiveChatAvatar src={avatarUrl} address={msg.sender_address} name={displayName} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="relative inline-flex items-baseline shrink min-w-0 pr-3">
                        <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                          {displayName}
                        </span>
                        <LiveChatBadge badgeBalance={msg.sender_badge_balance} username={msg.sender_username} />
                      </span>
                      {isPinned && <Pin className="w-2.5 h-2.5 text-blue-400 fill-current shrink-0" />}
                    </div>
                    {(msg.message_type === 'audio' || msg.message_type === 'voice') && (msg.audio_url || msg.image_url) ? (
                      <div className="mt-1">
                        <VoiceWaveformPlayer src={msg.audio_url || msg.image_url || ''} />
                      </div>
                    ) : msg.message_type === 'image' && msg.image_url ? (
                      <img src={getMediaUrl(msg.image_url)} alt="" className="max-w-full max-h-24 rounded mt-0.5" />
                    ) : msg.message_type === 'gif' && msg.image_url ? (
                      <img src={msg.image_url} alt="GIF" className="max-w-full max-h-20 rounded mt-0.5" />
                    ) : (
                      <TranslatableChatMsg content={msg.content} />
                    )}
                    <span className="text-[10px] text-zinc-600 mt-0.5 block">
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </span>
                  </div>
                  {/* Pin button on hover (host only) */}
                  {isHost && (
                    <button
                      onClick={() => isPinned ? handleUnpinMessage() : handlePinMessage(msg)}
                      disabled={isPinning}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-blue-400 mt-0.5"
                      title={isPinned ? 'Unpin' : 'Pin message'}
                    >
                      <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current text-blue-400' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Right-click context menu for host */}
      {contextMenuMsg && isHost && (
        <div
          className="fixed z-50 bg-zinc-800 border border-white/10 rounded-xl shadow-2xl py-1 min-w-[140px]"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => contextMenuMsg.id === pinnedMessageId ? handleUnpinMessage() : handlePinMessage(contextMenuMsg)}
            disabled={isPinning}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
          >
            <Pin className="w-3.5 h-3.5" />
            {contextMenuMsg.id === pinnedMessageId ? 'Unpin message' : 'Pin message'}
          </button>
        </div>
      )}

      {/* Input */}
      <div className={overlay ? '' : 'pt-2'}>
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => {
              const cursorPos = e.target.selectionStart;
              const val = e.target.value;
              setNewMessage(val);
              mention.handleInput(val, cursorPos ?? undefined);
            }}
            onKeyDown={handleKeyDown}
            placeholder={isOffline ? 'Chat is offline' : 'Type a message...'}
            disabled={isOffline || !isAuthenticated}
            className={cn(
              'max-h-32 resize-none text-white text-sm pr-24',
              overlay
                ? 'min-h-[46px] rounded-full border-white/15 bg-black/40 py-3 pl-4 backdrop-blur-md placeholder:text-white/50'
                : 'min-h-[56px] rounded-xl border-white/10 bg-white/5 placeholder:text-zinc-500'
            )}
            rows={overlay ? 1 : 2}
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
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <VoiceRecorder
              onRecordingComplete={handleVoiceRecordingComplete}
              disabled={isOffline || !isAuthenticated}
            />
            <button
              onClick={handleSend}
              disabled={isSending || !newMessage.trim() || isOffline}
              className={cn(
                'p-2 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                overlay ? 'rounded-full bg-white/15 hover:bg-white/25' : 'rounded-xl bg-white/10 hover:bg-white/20'
              )}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
