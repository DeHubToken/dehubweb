import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Search, Plus, MessageCircle, RefreshCw } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PublicChat, DirectMessageChat, NewConversationModal, NewMessageSelector, CreateGroupModal } from '@/components/app/chat';

import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { useConversations, useUserOnlineStatus, useCreateConversation } from '@/hooks/use-messages';
import { getMediaUrl, type DeHubConversation } from '@/lib/api/dehub';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { getBadgeUrl } from '@/lib/staking-badges';
import { useDMRealtime } from '@/hooks/use-dm-realtime';
import chatBubbleIcon from '@/assets/icons/chat-bubble.png';
import messagesBubbleIcon from '@/assets/icons/messages-3d-icon.png';
import dehubLogo from '@/assets/dehub-logo.png';

function ConversationBadge({ badgeBalance }: { badgeBalance?: number }) {
  const badgeUrl = getBadgeUrl(badgeBalance);
  if (!badgeUrl) return null;
  return <img src={badgeUrl} alt="Badge" className="w-[9px] h-[9px] shrink-0 absolute -top-0.5 -right-3" />;
}

function ConversationsSkeleton() {
  return (
    <div className="space-y-1">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="w-12 h-12 rounded-xl bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32 bg-white/[0.06]" />
            <Skeleton className="h-3 w-48 bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConversationItem({ 
  conversation, 
  onClick, 
  isSelected,
}: { 
  conversation: DeHubConversation; 
  onClick: () => void;
  isSelected: boolean;
}) {
  const otherUser = conversation.otherUser || conversation.participants?.[0];
  const avatarUrl = getMediaUrl(otherUser?.avatarImageUrl || otherUser?.avatarUrl);
  const displayName = otherUser?.displayName || otherUser?.display_name || otherUser?.username ||
    (otherUser?.address ? `${otherUser.address.slice(0, 6)}...${otherUser.address.slice(-4)}` : 'User');
  const lastMessagePreview = conversation.lastMessage?.content || 'No messages yet';
  const lastMessageTime = conversation.lastMessage?.createdAt 
    ? formatDistanceToNow(new Date(conversation.lastMessage.createdAt), { addSuffix: false })
    : '';

  // Online status via React Query (cached + deduplicated)
  const otherAddress = otherUser?.address;
  const { data: onlineStatus } = useUserOnlineStatus(otherAddress || null);
  const isOnline = onlineStatus?.online ?? false;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 hover:bg-zinc-800/50 transition-colors text-left ${
        isSelected ? 'bg-zinc-800' : ''
      }`}
    >
      <div className="relative">
        <Avatar className="w-12 h-12">
          {avatarUrl && <AvatarImage src={avatarUrl} />}
          <AvatarFallback className="bg-zinc-700 text-white font-medium">
            {(displayName.startsWith('0x') ? displayName.charAt(2) : displayName.charAt(0)).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Online indicator */}
        {isOnline && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-900" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex items-baseline">
            <span className="font-semibold text-white truncate">{displayName}</span>
            <ConversationBadge badgeBalance={otherUser?.badgeBalance} />
          </span>
          {lastMessageTime && (
            <span className="text-zinc-500 text-sm ml-auto flex-shrink-0">{lastMessageTime}</span>
          )}
        </div>
        <p className="text-zinc-500 text-sm truncate">
          {conversation.lastMessage?.type === 'image' ? '📷 Photo' : 
           conversation.lastMessage?.type === 'gif' ? '🎞️ GIF' : 
           lastMessagePreview}
        </p>
      </div>
      
      {conversation.unreadCount > 0 && (
        <div className="w-5 h-5 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-primary-foreground text-xs font-bold">
            {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
          </span>
        </div>
      )}
    </button>
  );
}

export default function MessagesPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<DeHubConversation | null>(null);
  const [showPublicChat, setShowPublicChat] = useState(false);
  const [showMessageSelector, setShowMessageSelector] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { isAuthenticated, walletAddress } = useAuth();
  
  // Subscribe to DM realtime updates only when on messages page
  useDMRealtime();

  const{ 
    conversations, 
    isLoading, 
    isError, 
    refetch, 
    isRefetching,
  } = useConversations(searchQuery);

  const createConversation = useCreateConversation();

  // Capture navigation state into a ref immediately (before it can be cleared)
  const pendingDmRef = useRef<{ address: string; username?: string } | null>(null);
  useEffect(() => {
    const state = location.state as { openDmWith?: string; username?: string } | null;
    if (state?.openDmWith) {
      pendingDmRef.current = { address: state.openDmWith, username: state.username };
      window.history.replaceState({}, document.title);
    }
  }, []); // run once on mount to capture state before it disappears

  // Process the pending DM once conversations have finished loading
  useEffect(() => {
    if (!pendingDmRef.current || !isAuthenticated || isLoading) return;
    const { address, username } = pendingDmRef.current;
    pendingDmRef.current = null;

    const targetAddress = address.toLowerCase();
    const existing = conversations?.find(c =>
      c.otherUser?.address?.toLowerCase() === targetAddress
    );

    if (existing) {
      setSelectedConversation(existing);
    } else {
      createConversation.mutateAsync({
        recipientAddress: address,
        recipientUser: { address, username } as any,
      }).then(conv => setSelectedConversation(conv)).catch(() => {});
    }
  }, [isAuthenticated, conversations, isLoading]);

  // Block access for unauthenticated users
  if (!isAuthenticated) {
    return (
      <AuthGate description="Log in to access your messages and chat with others." />
    );
  }

  // If Public Chat is open, show full-screen chat
  if (showPublicChat) {
    return (
      <div className="h-[calc(100dvh-120px)] lg:h-[calc(100dvh-32px)] p-3 sm:p-4 overflow-x-hidden">
          <PublicChat
            onBack={() => setShowPublicChat(false)}
          />
      </div>
    );
  }

  // If a DM conversation is selected, show it
  if (selectedConversation) {
    return (
      <div className="h-[calc(100dvh-120px)] lg:h-[calc(100dvh-32px)] p-3 sm:p-4">
        <DirectMessageChat
          conversation={selectedConversation}
          onBack={() => setSelectedConversation(null)}
        />
      </div>
    );
  }

  return (
    <div className="h-full p-3 sm:p-4 overflow-hidden">
      <div className="h-[calc(100dvh-120px)] lg:h-[calc(100dvh-32px)] max-h-full">
        {/* Full Width Messages Panel */}
        <div className="w-full h-full bg-zinc-900 rounded-2xl flex flex-col">
          {/* Header */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <img src={messagesBubbleIcon} alt="Messages" className="w-10 h-10 object-contain" />
                <h1 className="text-xl font-bold text-white">{t('messages.title')}</h1>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="text-zinc-400 hover:text-white"
              >
                <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder={t('messages.searchConversations')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-12 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
              />
              <Button 
                size="icon" 
                onClick={() => setShowMessageSelector(true)}
                className="absolute right-1.5 w-7 h-7 rounded-xl bg-zinc-800 hover:bg-zinc-700 border-0"
              >
                <Plus className="w-4 h-4 text-white" />
              </Button>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {/* Public Chat (pinned) */}
            <button
              onClick={() => setShowPublicChat(true)}
              className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/50 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center flex-shrink-0">
                <img 
                  src={dehubLogo} 
                  alt="Public Chat" 
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-white truncate block">{t('publicChat.title')}</span>
                <p className="text-zinc-500 text-sm truncate">{t('publicChat.subtitle')}</p>
              </div>
            </button>

            {/* Loading State */}
            {isLoading && <ConversationsSkeleton />}

            {/* Error State */}
            {isError && (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <MessageCircle className="w-12 h-12 text-zinc-600 mb-4" />
                <p className="text-zinc-400 mb-4">{t('messages.failedToLoad')}</p>
                <Button 
                  variant="outline" 
                  onClick={() => refetch()}
                  className="border-zinc-700 text-white hover:bg-zinc-800"
                >
                  {t('messages.tryAgain')}
                </Button>
              </div>
            )}



            {/* Conversations */}
            {!isLoading && !isError && conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                onClick={() => setSelectedConversation(conv)}
                isSelected={selectedConversation?.id === conv.id}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Message Type Selector */}
      <NewMessageSelector
        open={showMessageSelector}
        onOpenChange={setShowMessageSelector}
        onSelectDM={() => setShowNewConversation(true)}
        onSelectGroup={() => setShowCreateGroup(true)}
      />

      {/* New DM Conversation Modal */}
      <NewConversationModal
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        onConversationCreated={(conversation) => {
          setSelectedConversation(conversation);
        }}
      />

      {/* Create Group Modal */}
      <CreateGroupModal
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        onGroupCreated={(conversation) => {
          setSelectedConversation(conversation);
        }}
      />
    </div>
  );
}
