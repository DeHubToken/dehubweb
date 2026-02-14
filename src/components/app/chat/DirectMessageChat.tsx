/**
 * DirectMessageChat Component
 * ===========================
 * Full-screen 1:1 direct message chat view.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, MoreVertical, Loader2, ArrowDown, Trash2, ShieldBan, ShieldCheck, Settings, Video, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatInput } from './ChatInput';
import { TranslatableText } from '../TranslatableText';
import { useMessages, useSendMessage, useDeleteConversation } from '@/hooks/use-messages';
import { useAuth } from '@/contexts/AuthContext';
import { getMediaUrl, getConversation, blockConversation, unblockConversation, uploadChatImage, getDMPlanSettings, type DeHubConversation, type DeHubDMMessage } from '@/lib/api/dehub';
import { GroupSettingsDrawer } from './GroupSettingsDrawer';
import { SharedVideosDrawer } from './SharedVideosDrawer';
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

interface DirectMessageChatProps {
  conversation: DeHubConversation;
  onBack: () => void;
}

function MessageBubble({ 
  message, 
  isOwnMessage,
}: { 
  message: DeHubDMMessage; 
  isOwnMessage: boolean;
}) {
  const avatarUrl = getMediaUrl(message.sender?.avatarImageUrl || message.sender?.avatarUrl);
  const displayName = message.sender?.displayName || message.sender?.display_name || message.sender?.username || 
    (message.sender?.address ? `${message.sender.address.slice(0, 6)}...${message.sender.address.slice(-4)}` : 'User');
  
  return (
    <div className={`flex gap-3 py-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
      {!isOwnMessage && (
        <Avatar className="w-8 h-8 flex-shrink-0">
          {avatarUrl && <AvatarImage src={avatarUrl} />}
          <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      
      <div className={`flex-1 min-w-0 max-w-[75%] ${isOwnMessage ? 'text-right' : ''}`}>
        <div 
          className={`inline-block rounded-2xl px-4 py-2 ${
            isOwnMessage 
              ? 'bg-primary text-primary-foreground rounded-br-md' 
              : 'bg-zinc-800 text-white rounded-bl-md'
          }`}
        >
          {message.type === 'text' && (
            <TranslatableText text={message.content} className="text-sm break-words" as="p" />
          )}
          
          {message.type === 'image' && message.mediaUrl && (
            <div>
              <img 
                src={message.mediaUrl} 
                alt="Shared image" 
                className="max-w-full max-h-64 rounded-lg object-cover"
              />
              {message.content && (
                <TranslatableText text={message.content} className="text-sm mt-1" as="p" />
              )}
            </div>
          )}
          
          {message.type === 'gif' && message.mediaUrl && (
            <img 
              src={message.mediaUrl} 
              alt="GIF" 
              className="max-w-full max-h-48 rounded-lg"
            />
          )}
        </div>
        
        <div className={`text-xs text-zinc-500 mt-1 ${isOwnMessage ? 'text-right' : ''}`}>
          {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          {isOwnMessage && message.readAt && (
            <span className="ml-2 text-primary">✓✓</span>
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
            <div className="w-8 h-8 rounded-xl bg-zinc-800 animate-pulse flex-shrink-0" />
          )}
          <div className={`flex-1 max-w-[75%] ${i % 2 !== 0 ? 'text-right' : ''}`}>
            <div 
              className={`inline-block h-12 w-48 rounded-2xl bg-zinc-800 animate-pulse ${
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
  const { user } = useAuth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isBlocked, setIsBlocked] = useState(conversation.isBlocked ?? false);
  const [isBlockProcessing, setIsBlockProcessing] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showSharedVideos, setShowSharedVideos] = useState(false);
  const [conversationData, setConversationData] = useState<DeHubConversation>(conversation);
  const [dmGateChecked, setDmGateChecked] = useState(false);
  const [dmGated, setDmGated] = useState(false);
  const [resolvedConversationId, setResolvedConversationId] = useState(conversation.id);
  const isInitialMount = useRef(true);

  const isGroupChat = conversation.isGroup || !!conversation.groupInfo;

  // Fetch full conversation details via getConversation
  useEffect(() => {
    getConversation(conversation.id)
      .then((data) => setConversationData(data))
      .catch((err) => console.error('[DM] getConversation fallback:', err));
  }, [conversation.id]);

  // Check DM plan gating if the other user has a subscription plan
  useEffect(() => {
    // Use type-safe access for optional dmPlanId field
    const otherUserData = conversationData?.otherUser as any;
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
  }, [conversationData]);

  // Get the other participant
  const otherUser = conversation.otherUser || 
    conversation.participants?.find(p => 
      (p.address || p._id) !== (user?.address || user?._id)
    ) || 
    conversation.participants?.[0];

  const avatarUrl = getMediaUrl(otherUser?.avatarImageUrl || otherUser?.avatarUrl);
  const displayName = otherUser?.displayName || otherUser?.display_name || otherUser?.username || 
    (otherUser?.address ? `${otherUser.address.slice(0, 6)}...${otherUser.address.slice(-4)}` : 'User');

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

  // Scroll to bottom on initial load
  useEffect(() => {
    if (isInitialMount.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      isInitialMount.current = false;
      // Mark as read when opening
      markAsRead();
    }
  }, [messages.length, markAsRead]);

  // Handle scroll for infinite loading and jump button
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Show jump to latest when scrolled up
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowJumpToLatest(distanceFromBottom > 100);

    // Load more when near top
    if (container.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      const scrollHeight = container.scrollHeight;
      fetchNextPage().then(() => {
        // Maintain scroll position after loading
        requestAnimationFrame(() => {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - scrollHeight;
        });
      });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (content: string, type: 'text' | 'image' | 'gif' | 'audio', imageUrl?: string) => {
    let finalMediaUrl = imageUrl;

    // If sending an image with a base64 data URL, upload to CDN first
    if (type === 'image' && imageUrl && imageUrl.startsWith('data:')) {
      try {
        // Convert base64 to File
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'chat-image.jpg', { type: blob.type || 'image/jpeg' });
        const { url } = await uploadChatImage(file);
        finalMediaUrl = url;
      } catch (err) {
        console.error('[DM] Image upload failed, sending base64 fallback:', err);
        // Fall through with base64 URL as fallback
      }
    }

    sendMessageMutation.mutate(
      { content, type, mediaUrl: finalMediaUrl },
      {
        onSuccess: (data) => {
          // Only resolve virtual "new_0x..." conversation IDs to the other user's address
          // Do NOT resolve to DeHub transaction _id (like 699059...) as Supabase stores by address
          if (resolvedConversationId.startsWith('new_')) {
            const otherAddress = resolvedConversationId.replace('new_', '');
            console.log('[DM] Resolved virtual conversation ID:', resolvedConversationId, '->', otherAddress);
            setResolvedConversationId(otherAddress);
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
    <div className="h-full flex flex-col bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-white hover:bg-zinc-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <Avatar className="w-10 h-10">
            {avatarUrl && <AvatarImage src={avatarUrl} />}
            <AvatarFallback className="bg-zinc-700 text-white font-medium">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div>
            <h2 className="font-semibold text-white">{displayName}</h2>
            {otherUser?.username && (
              <p className="text-xs text-zinc-500">@{otherUser.username}</p>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
           <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
             {/* Group settings - only for group chats */}
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
                 <>
                   <ShieldCheck className="w-4 h-4 mr-2" />
                   Unblock User
                 </>
               ) : (
                 <>
                   <ShieldBan className="w-4 h-4 mr-2" />
                   Block User
                 </>
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

      {/* Messages */}
      {isLoading ? (
        <MessagesSkeleton />
      ) : messagesError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <AlertCircle className="w-12 h-12 text-red-500/60 mb-3" />
          <p className="text-red-400 mb-2">Failed to load messages</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchMessages()}
            className="border-zinc-700 text-white hover:bg-zinc-800"
          >
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
          {/* Load more indicator */}
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          )}

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
              <p className="text-lg mb-2">No messages yet</p>
              <p className="text-sm">Say hello to start the conversation!</p>
            </div>
          )}

          {/* Messages list */}
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwnMessage={(message.sender?.address || message.sender?._id) === (user?.address || user?._id)}
            />
          ))}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Jump to latest button */}
      {showJumpToLatest && (
        <Button
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full shadow-lg"
          size="sm"
        >
          <ArrowDown className="w-4 h-4 mr-1" />
          Jump to latest
        </Button>
      )}

      {/* Input */}
      <ChatInput onSendMessage={handleSendMessage} />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
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
            <AlertDialogAction 
              onClick={handleDeleteConversation}
              className="bg-red-600 hover:bg-red-700"
            >
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
          onUpdated={() => {
            getConversation(conversation.id)
              .then(setConversationData)
              .catch(() => {});
          }}
        />
      )}

      {/* Shared Videos Drawer */}
      <SharedVideosDrawer
        open={showSharedVideos}
        onOpenChange={setShowSharedVideos}
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
