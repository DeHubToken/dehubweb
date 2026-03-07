/**
 * DirectMessageChat Component
 * ===========================
 * Full-screen 1:1 direct message chat view.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MoreVertical, Loader2, ArrowDown, Trash2, ShieldBan, ShieldCheck, Settings, Video, AlertCircle, RefreshCw, Play, Pause, Gift } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatInput } from './ChatInput';
import { TranslatableText } from '../TranslatableText';
import { useMessages, useSendMessage, useDeleteConversation, useCreateAndStart } from '@/hooks/use-messages';
import { useAuth } from '@/contexts/AuthContext';
import { getMediaUrl, blockConversation, unblockConversation, getDMPlanSettings, grantFreeDmAccess, revokeFreeDmAccess, type DeHubConversation, type DmMessage, type DmFee } from '@/lib/api/dehub';
import { GroupSettingsDrawer } from './GroupSettingsDrawer';
import { SharedVideosDrawer } from './SharedVideosDrawer';
import { DmTipDialog } from './DmTipDialog';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { toast } from 'sonner';
import {
  emitReadReceipt,
  onConversationDeleted,
  onDmSendMessage,
} from '@/lib/api/dehub/dm-socket';

interface DirectMessageChatProps {
  conversation: DeHubConversation;
  onBack: () => void;
}

function VoiceMessagePlayer({
  audioUrl,
  duration,
  isPending,
}: {
  audioUrl?: string;
  duration?: number | null;
  isPending: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
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

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 min-w-[120px] py-2 px-3 rounded-lg bg-zinc-700/50">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-400 flex-shrink-0" />
        <span className="text-sm text-zinc-400">Uploading voice...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <button
        type="button"
        onClick={togglePlay}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-700/50 hover:bg-zinc-600/50 transition-colors text-sm"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        <span>🎤 Voice</span>
        {duration != null && <span className="text-xs text-zinc-400">{duration}s</span>}
      </button>
    </div>
  );
}

function MessageBubble({
  message,
  isOwnMessage,
}: {
  message: DmMessage;
  isOwnMessage: boolean;
}) {
  const avatarUrl = getMediaUrl(message.sender?.avatarImageUrl);
  const displayName = message.sender?.displayName || message.sender?.username ||
    (message.sender?.address
      ? `${message.sender.address.slice(0, 6)}...${message.sender.address.slice(-4)}`
      : 'User');

  const primaryMediaUrl = message.mediaUrls?.[0]?.url;

  return (
    <div className={`flex gap-3 py-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
      {!isOwnMessage && (
        <Avatar className="w-8 h-8 flex-shrink-0">
          {avatarUrl && <AvatarImage src={avatarUrl} />}
          <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
            {(displayName.startsWith('0x') ? displayName.charAt(2) : displayName.charAt(0)).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={`flex-1 min-w-0 max-w-[75%] ${isOwnMessage ? 'text-right' : ''}`}>
        {/* Reply preview */}
        {message.replyTo && (
          <div className={`mb-1 px-3 py-1.5 rounded-lg border-l-2 border-primary bg-zinc-800/60 text-xs text-zinc-400 max-w-full truncate ${isOwnMessage ? 'text-right border-r-2 border-l-0' : ''}`}>
            <span className="text-zinc-300 font-medium">{message.replyTo.sender?.displayName || 'User'}</span>
            <span className="ml-1">{message.replyTo.content || '📎 Media'}</span>
          </div>
        )}

        {/* Tip message — system-style bubble */}
        {message.msgType === 'tip' && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm">
            <img src={dehubCoin} alt="DHB" className="w-4 h-4 brightness-0 invert" />
            <span>
              Tip: {message.tipAmount} {message.tipSymbol || 'DHB'}
            </span>
          </div>
        )}

        {/* Regular message bubble */}
        {message.msgType !== 'tip' && !message.isDeleted && (
          <div
            className={`inline-block rounded-2xl px-4 py-2 ${
              isOwnMessage
                ? 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] text-white rounded-br-md'
                : 'bg-zinc-800 text-white rounded-bl-md'
            }`}
          >
            {/* Text message */}
            {(message.msgType === 'msg') && (
              <TranslatableText text={message.content} className="text-sm break-words" as="p" />
            )}

            {/* Media (image) — show loading when upload pending / mediaUrls empty */}
            {message.msgType === 'media' && (
              <div>
                {primaryMediaUrl ? (
                  <>
                    <img
                      src={getMediaUrl(primaryMediaUrl)!}
                      alt="Shared image"
                      className="max-w-full max-h-64 rounded-lg object-cover"
                    />
                    {message.content && (
                      <TranslatableText text={message.content} className="text-sm mt-1" as="p" />
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 min-w-[120px] py-4 px-3 rounded-lg bg-zinc-700/50">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-400 flex-shrink-0" />
                    <span className="text-sm text-zinc-400">Uploading image...</span>
                  </div>
                )}
              </div>
            )}

            {/* GIF */}
            {message.msgType === 'gif' && primaryMediaUrl && (
              <img
                src={primaryMediaUrl}
                alt="GIF"
                className="max-w-full max-h-48 rounded-lg"
              />
            )}

            {/* Voice message — show player when mediaUrls available, else pending */}
            {message.msgType === 'voice' && (
              <VoiceMessagePlayer
                audioUrl={primaryMediaUrl ? (getMediaUrl(primaryMediaUrl) || primaryMediaUrl) : undefined}
                duration={message.voiceDuration}
                isPending={!primaryMediaUrl}
              />
            )}

            {/* Pending payment indicator */}
            {message.paymentStatus === 'pending' && (
              <div className="flex items-center gap-1 mt-1 text-xs text-amber-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Payment pending</span>
              </div>
            )}

            {/* Tip badge on regular messages */}
            {message.tipAmount != null && (message.msgType as string) !== 'tip' && (
              <div className="inline-flex items-center gap-1 mt-1 text-xs text-amber-300">
                <img src={dehubCoin} alt="DHB" className="w-3 h-3 brightness-0 invert" />
                {message.tipAmount} {message.tipSymbol || 'DHB'}
              </div>
            )}
          </div>
        )}

        {/* Deleted message */}
        {message.isDeleted && (
          <div className={`inline-block rounded-2xl px-4 py-2 bg-zinc-800/50 text-zinc-500 text-sm italic ${isOwnMessage ? 'rounded-br-md' : 'rounded-bl-md'}`}>
            Message deleted
          </div>
        )}

        {/* Forwarded label */}
        {message.isForwarded && (
          <div className={`text-xs text-zinc-500 mb-0.5 ${isOwnMessage ? 'text-right' : ''}`}>
            ↪ Forwarded
          </div>
        )}

        <div className={`text-xs text-zinc-500 mt-1 flex items-center gap-1 ${isOwnMessage ? 'justify-end' : ''}`}>
          <span>{formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</span>
          {message.isEdited && <span className="text-zinc-600">· edited</span>}
          {isOwnMessage && message.isRead && (
            <span className="text-primary">✓✓</span>
          )}
        </div>
      </div>
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
          {i % 2 === 0 && (
            <div className="w-8 h-8 rounded-xl bg-white/[0.06] animate-pulse flex-shrink-0" />
          )}
          <div className={`flex-1 max-w-[75%] ${i % 2 !== 0 ? 'text-right' : ''}`}>
            <div
              className={`inline-block h-12 w-48 rounded-2xl bg-white/[0.06] animate-pulse ${
                i % 2 !== 0 ? 'rounded-br-md' : 'rounded-bl-md'
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DirectMessageChat({ conversation, onBack }: DirectMessageChatProps) {
  const { user, walletAddress } = useAuth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const prevMessagesLenRef = useRef(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isBlocked, setIsBlocked] = useState(conversation.isBlocked ?? false);
  const [isBlockProcessing, setIsBlockProcessing] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showSharedVideos, setShowSharedVideos] = useState(false);
  const [showTipDialog, setShowTipDialog] = useState(false);
  const [dmGateChecked, setDmGateChecked] = useState(false);
  const [dmGated, setDmGated] = useState(false);
  const [dmFee, setDmFee] = useState<DmFee | null>(conversation.dmFee || null);
  const [resolvedConversationId, setResolvedConversationId] = useState(conversation.id);
  const isInitialMount = useRef(true);
  const hasInitialized = useRef(false);

  // When parent upgrades conversation to one with real dmId (e.g. after getContacts returns DeHub data), use it
  useEffect(() => {
    const convId = conversation.id;
    const isRealId = !convId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(convId);
    if (isRealId && convId !== resolvedConversationId) {
      setResolvedConversationId(convId);
    }
  }, [conversation.id, resolvedConversationId]);

  const isGroupChat = conversation.isGroup || !!conversation.groupInfo;

  // Get the other participant
  const otherUser = conversation.otherUser ||
    conversation.participants?.find(p =>
      (p.address || p._id) !== (user?.address || user?._id)
    ) ||
    conversation.participants?.[0];

  const avatarUrl = getMediaUrl(otherUser?.avatarImageUrl || otherUser?.avatarUrl);
  const displayName = otherUser?.displayName || otherUser?.display_name || otherUser?.username ||
    (otherUser?.address ? `${otherUser.address.slice(0, 6)}...${otherUser.address.slice(-4)}` : 'User');
  const profileLink = otherUser?.username ? `/${otherUser.username}` : otherUser?.address ? `/${otherUser.address}` : '#';

  // createAndStart — get/create conversation + dmFee
  const createAndStart = useCreateAndStart();

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Prefer wallet address — server's createAndStart handler looks up users by address
    const userId = otherUser?.address || otherUser?._id;
    if (!userId) return;

    createAndStart.mutate(userId, {
      onSuccess: (data) => {
        console.log('[DM] createAndStart success:', data);
        if (data._id) setResolvedConversationId(data._id);
        if (data.dmFee) setDmFee(data.dmFee);
      },
      onError: (err) => {
        console.warn('[DM] createAndStart failed (non-critical):', err);
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check DM plan gating
  useEffect(() => {
    const otherUserData = otherUser as any;
    const planId = otherUserData?.dmPlanId;
    if (!planId) {
      setDmGateChecked(true);
      return;
    }
    getDMPlanSettings(planId)
      .then((settings) => {
        setDmGated(!settings.enabled);
        setDmGateChecked(true);
      })
      .catch(() => setDmGateChecked(true));
  }, [otherUser]);

  const {
    messages,
    isLoading,
    isError: messagesError,
    refetch: refetchMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    markAsRead,
  } = useMessages(resolvedConversationId);

  const sendMessageMutation = useSendMessage(resolvedConversationId);
  const deleteConversationMutation = useDeleteConversation();

  // Emit readReceipt + scroll on initial load
  useEffect(() => {
    if (isInitialMount.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      isInitialMount.current = false;
      prevMessagesLenRef.current = messages.length;
      markAsRead();
      if (resolvedConversationId && !resolvedConversationId.startsWith('new_')) {
        emitReadReceipt(resolvedConversationId);
      }
    }
  }, [messages.length, markAsRead, resolvedConversationId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isInitialMount.current) return;
    const prevLen = prevMessagesLenRef.current;
    if (messages.length > prevLen) {
      const container = scrollContainerRef.current;
      if (container) {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 150) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        } else {
          setNewMessageCount(prev => prev + (messages.length - prevLen));
        }
      }
    }
    prevMessagesLenRef.current = messages.length;
  }, [messages.length]);

  // If createAndStart failed and conversation ID is still virtual, resolve it from incoming messages
  useEffect(() => {
    if (!resolvedConversationId.startsWith('new_')) return;
    const otherAddress = resolvedConversationId.replace('new_', '').toLowerCase();
    const unsub = onDmSendMessage((msg) => {
      if (msg.conversation && msg.sender?.address?.toLowerCase() === otherAddress) {
        setResolvedConversationId(msg.conversation);
      }
    });
    return unsub;
  }, [resolvedConversationId]);

  // Handle conversationDeleted event
  useEffect(() => {
    const convId = resolvedConversationId;
    if (!convId || convId.startsWith('new_')) return;

    const unsub = onConversationDeleted(({ dmId }) => {
      if (dmId === convId) {
        toast.info('Conversation was deleted');
        onBack();
      }
    });
    return unsub;
  }, [resolvedConversationId, onBack]);

  // Handle scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowJumpToLatest(distanceFromBottom > 100);
    if (distanceFromBottom < 50) setNewMessageCount(0);

    if (container.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      const scrollHeight = container.scrollHeight;
      fetchNextPage().then(() => {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight - scrollHeight;
        });
      });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewMessageCount(0);
  };

  const handleSendMessage = async ({
    content,
    type,
    mediaFile,
    gifUrl,
    duration,
  }: {
    content: string;
    type: 'msg' | 'media' | 'gif' | 'voice';
    mediaFile?: File;
    gifUrl?: string;
    duration?: number;
  }) => {
    sendMessageMutation.mutate(
      {
        content,
        msgType: type,
        mediaFile,
        gifUrl,
        voiceDuration: duration,
      },
      {
        onSuccess: (data) => {
          // If conversation was virtual, resolve to real ID from server message
          if (resolvedConversationId.startsWith('new_') && data.conversation) {
            setResolvedConversationId(data.conversation);
          }
          setTimeout(scrollToBottom, 100);
        },
        onError: () => {
          toast.error('Failed to send message');
        },
      }
    );
  };

  const handleDeleteConversation = () => {
    deleteConversationMutation.mutate(conversation.id, {
      onSuccess: () => {
        toast.success('Conversation deleted');
        onBack();
      },
      onError: () => {
        toast.error('Failed to delete conversation');
      },
    });
    setShowDeleteDialog(false);
  };

  const handleToggleBlock = async () => {
    setIsBlockProcessing(true);
    try {
      if (isBlocked) {
        await unblockConversation(conversation.id);
        setIsBlocked(false);
        toast.success('User unblocked');
      } else {
        await blockConversation(conversation.id);
        setIsBlocked(true);
        toast.success('User blocked');
      }
    } catch (err) {
      console.error('Block/unblock error:', err);
      toast.error(isBlocked ? 'Failed to unblock' : 'Failed to block');
    } finally {
      setIsBlockProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900 rounded-2xl overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-zinc-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <Link to={profileLink} className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback className="bg-zinc-700 text-white font-medium">
                {(displayName.startsWith('0x') ? displayName.charAt(2) : displayName.charAt(0)).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div>
              <h2 className="font-semibold text-white">{displayName}</h2>
              {otherUser?.username && (
                <p className="text-xs text-zinc-500">@{otherUser.username}</p>
              )}
            </div>
          </Link>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
            {isGroupChat && (
              <DropdownMenuItem
                className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                onClick={() => setShowGroupSettings(true)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Group Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
              onClick={handleToggleBlock}
              disabled={isBlockProcessing}
            >
              {isBlocked ? (
                <><ShieldCheck className="w-4 h-4 mr-2" />Unblock User</>
              ) : (
                <><ShieldBan className="w-4 h-4 mr-2" />Block User</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
              onClick={() => setShowSharedVideos(true)}
            >
              <Video className="w-4 h-4 mr-2" />
              Shared Videos
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-400 focus:text-red-400 focus:bg-zinc-700 cursor-pointer"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* DM Fee banner */}
      {dmFee?.required && (
        <div className={`px-4 py-2 text-xs flex items-center gap-2 ${
          dmFee.hasFreeAccess
            ? 'bg-green-500/10 text-green-400 border-b border-green-500/20'
            : 'bg-amber-500/10 text-amber-400 border-b border-amber-500/20'
        }`}>
          <img src={dehubCoin} alt="DHB" className="w-3 h-3 flex-shrink-0 brightness-0 invert" />
          {dmFee.hasFreeAccess
            ? 'You have free access to message this user'
            : `Messaging fee: ${dmFee.fee} DHB per message`}
        </div>
      )}

      {/* Messages */}
      {isLoading ? (
        <MessagesSkeleton />
      ) : messagesError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <AlertCircle className="w-12 h-12 text-red-500/60 mb-3" />
          <p className="text-red-400 mb-2">Failed to load messages</p>
          <Button variant="glass" size="sm" onClick={() => refetchMessages()}>
            <RefreshCw className="w-3 h-3 mr-2" />
            Try Again
          </Button>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4"
        >
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          )}

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
              <p className="text-lg mb-2">No messages yet</p>
              <p className="text-sm">Say hello to start the conversation!</p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble
              key={message._id}
              message={message}
              isOwnMessage={
                message.author === 'me' ||
                (message.sender?.address?.toLowerCase() || message.sender?._id) ===
                  (walletAddress?.toLowerCase() || user?._id)
              }
            />
          ))}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Jump to latest */}
      {(showJumpToLatest || newMessageCount > 0) && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <Button
            onClick={scrollToBottom}
            className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-full shadow-lg relative"
            size="sm"
          >
            <ArrowDown className="w-4 h-4 mr-1" />
            {newMessageCount > 0
              ? `${newMessageCount} new message${newMessageCount > 1 ? 's' : ''}`
              : 'Jump to latest'}
          </Button>
        </div>
      )}

      {/* Input */}
      <ChatInput onSendMessage={handleSendMessage} onTipClick={() => setShowTipDialog(true)} />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently delete this conversation and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConversation} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Group Settings Drawer */}
      {isGroupChat && (
        <GroupSettingsDrawer
          open={showGroupSettings}
          onOpenChange={setShowGroupSettings}
          groupId={conversation.id}
          onLeft={onBack}
          onUpdated={() => {}}
        />
      )}

      {/* Shared Videos Drawer */}
      <SharedVideosDrawer
        open={showSharedVideos}
        onOpenChange={setShowSharedVideos}
      />

      {/* DM Tip Dialog */}
      <DmTipDialog
        open={showTipDialog}
        onOpenChange={setShowTipDialog}
        recipientAddress={otherUser?.address || ''}
        recipientName={displayName}
        conversationId={resolvedConversationId}
      />

      {/* DM Gated Banner */}
      {dmGateChecked && dmGated && (
        <div className="absolute inset-0 bg-zinc-900/95 backdrop-blur-sm flex items-center justify-center z-20 rounded-2xl">
          <div className="text-center px-6">
            <ShieldBan className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
            <h3 className="text-white font-semibold text-lg mb-1">DMs Restricted</h3>
            <p className="text-zinc-400 text-sm">
              This user requires a subscription to receive messages.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
