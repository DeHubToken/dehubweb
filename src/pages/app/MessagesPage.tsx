import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Search, Plus, MessageCircle, RefreshCw, Loader2 } from 'lucide-react';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PublicChat, DirectMessageChat, NewConversationModal, NewMessageSelector, CreateGroupModal } from '@/components/app/chat';

import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { useConversations, useUserOnlineStatus, useCreateConversation, useUserSearchForDM } from '@/hooks/use-messages';
import { getMediaUrl, getAccountInfo, type DeHubConversation, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { getBadgeUrl } from '@/lib/staking-badges';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { useDMRealtime } from '@/hooks/use-dm-realtime';
import chatBubbleIcon from '@/assets/icons/chat-bubble.png';
import messagesBubbleIcon from '@/assets/icons/messages-3d-icon.png';
import dehubLogo from '@/assets/dehub-logo.png';

function ConversationBadge({ badgeBalance }: { badgeBalance?: number }) {
  const badgeUrl = getBadgeUrl(badgeBalance);
  if (!badgeUrl) return null;
  return <BadgeIcon badgeBalance={badgeBalance} className="w-[14px] h-[14px]" />;
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
  const avatarUrl = buildAvatarUrl(otherUser?.address || '', otherUser?.avatarImageUrl || otherUser?.avatarUrl);
  const displayName = otherUser?.displayName || otherUser?.display_name || '';
  const username = otherUser?.username || '';
  const fallbackName = displayName || username ||
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
            {(fallbackName.startsWith('0x') ? fallbackName.charAt(2) : fallbackName.charAt(0)).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Online indicator */}
        {isOnline && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-900" />
        )}
        {/* Unread indicator on top-right of avatar */}
        {conversation.unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-zinc-900">
            <span className="text-white text-[10px] font-bold leading-none">
              {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 min-w-0">
            {displayName ? (
              <>
                <span className="font-semibold text-white truncate">{displayName}</span>
                <ConversationBadge badgeBalance={otherUser?.badgeBalance} />
                {username && <span className="text-zinc-500 text-sm truncate">@{username}</span>}
              </>
            ) : (
              <>
                <span className="font-semibold text-white truncate">{fallbackName}</span>
                <ConversationBadge badgeBalance={otherUser?.badgeBalance} />
              </>
            )}
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
  const [readConvIds, setReadConvIds] = useState<Set<string>>(new Set());
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
  const { data: userSearchResults, isLoading: isSearchingUsers } = useUserSearchForDM(searchQuery);

  // Get existing conversation addresses to filter search results
  const existingAddresses = new Set(
    (conversations || []).map(c => c.otherUser?.address?.toLowerCase()).filter(Boolean)
  );

  // Filter user search results to exclude users we already have conversations with
  const newUserResults = (userSearchResults?.items || []).filter(
    (user: DeHubUser) => !existingAddresses.has(user.address?.toLowerCase())
  );

  /** Handle clicking a user search result — always create conversation and open chat */
  const handleSelectSearchUser = (user: DeHubUser) => {
    const dmSettingsObj = (() => {
      const raw = (user as any).dmSettings || (user as any).dmSetting;
      return Array.isArray(raw) ? raw[0] : raw;
    })();
    const dmDisabled = dmSettingsObj?.disables?.includes('NEW_DM') || dmSettingsObj?.disables?.includes('all');
    if (dmDisabled) return;

    const userAddress = user.address || (user as any)._id;
    if (!userAddress) return;

    createConversation.mutateAsync({
      recipientAddress: userAddress,
      recipientUser: user,
    }).then(conv => {
      setSelectedConversation(conv);
      setSearchQuery('');
    }).catch(() => {});
  };

  // Capture navigation state into a ref immediately (before it can be cleared)
  const pendingDmRef = useRef<{ address: string; username?: string } | null>(null);
  const [pendingDmTrigger, setPendingDmTrigger] = useState(0);
  
  useEffect(() => {
    const state = location.state as { openDmWith?: string; username?: string } | null;
    if (state?.openDmWith) {
      pendingDmRef.current = { address: state.openDmWith, username: state.username };
      window.history.replaceState({}, document.title);
      setPendingDmTrigger(prev => prev + 1);
    }
  }, [location.state]); // re-run when navigation state changes

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
      // Fetch account_info to get MongoDB _id — createAndStart requires _id, not just address
      getAccountInfo(address)
        .then((user: DeHubUser) =>
          createConversation.mutateAsync({
            recipientAddress: address,
            recipientUser: {
              _id: user._id || address,
              address,
              username: username ?? user.username,
              displayName: user.displayName ?? user.display_name,
              avatarImageUrl: user.avatarImageUrl ?? user.avatarUrl,
              dmSettings: (user as any).dmSettings,
            },
          })
        )
        .catch(() =>
          createConversation.mutateAsync({
            recipientAddress: address,
            recipientUser: { address, username } as Partial<DeHubUser>,
          })
        )
        .then((conv) => setSelectedConversation(conv))
        .catch(() => {});
    }
  }, [isAuthenticated, conversations, isLoading, pendingDmTrigger]);

  // When conversations list gets a real dmId for the same peer (e.g. after getContacts returns DeHub data),
  // upgrade selectedConversation so we use socket/DeHub instead of Supabase
  useEffect(() => {
    if (!selectedConversation || !conversations?.length) return;
    const selId = selectedConversation.id;
    const isVirtual = selId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(selId);
    if (!isVirtual) return;
    const peerAddr = (selId.startsWith('new_') ? selId.replace('new_', '') : selId).toLowerCase();
    const realConv = conversations.find(
      c => c.id !== selId &&
        c.otherUser?.address?.toLowerCase() === peerAddr
    );
    if (realConv) {
      setSelectedConversation(realConv);
    }
  }, [selectedConversation, conversations]);

  // Refetch conversations more often when we have a virtual convo selected, to pick up real dmId from DeHub sooner
  const hasVirtualSelected = selectedConversation &&
    (selectedConversation.id.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(selectedConversation.id));
  useEffect(() => {
    if (!hasVirtualSelected) return;
    // Poll at 1.5s for first 30s, then 5s
    const fast = setInterval(() => refetch(), 1500);
    let slowInterval: ReturnType<typeof setInterval>;
    const slow = setTimeout(() => {
      clearInterval(fast);
      slowInterval = setInterval(() => refetch(), 5000);
    }, 30000);
    return () => { clearInterval(fast); clearTimeout(slow); clearInterval(slowInterval); };
  }, [hasVirtualSelected, refetch]);

  // Block access for unauthenticated users
  if (!isAuthenticated) {
    return (
      <AuthGate description="Log in to access your messages and chat with others." />
    );
  }

  // If Public Chat is open, show full-screen chat
  if (showPublicChat) {
    return (
      <div className="h-[calc(100dvh-120px)] lg:h-[calc(100dvh-32px)] px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2 overflow-x-hidden">
          <PublicChat
            onBack={() => setShowPublicChat(false)}
          />
      </div>
    );
  }

  // If a DM conversation is selected, show it
  if (selectedConversation) {
    return (
      <div className="h-[calc(100dvh-120px)] lg:h-[calc(100dvh-32px)] px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2">
        <DirectMessageChat
          key={selectedConversation.id}
          conversation={selectedConversation}
          onBack={() => setSelectedConversation(null)}
        />
      </div>
    );
  }

  return (
    <div className="h-full px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2 overflow-hidden">
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
                onClick={() => setShowNewConversation(true)}
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
                conversation={readConvIds.has(conv.id) ? { ...conv, unreadCount: 0 } : conv}
                onClick={() => {
                  setReadConvIds(prev => new Set(prev).add(conv.id));
                  setSelectedConversation({ ...conv, unreadCount: 0 });
                }}
                isSelected={selectedConversation?.id === conv.id}
              />
            ))}

            {/* User search results (people not in existing conversations) */}
            {searchQuery.trim().length >= 2 && newUserResults.length > 0 && (
              <>
                <div className="px-4 py-2 mt-2">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Start new conversation</p>
                </div>
                {newUserResults.map((user: DeHubUser) => {
                  const avatarPath = extractAvatarPath(user);
                  const avatarUrl = user.address ? buildAvatarUrl(user.address, avatarPath) : undefined;
                  const displayName = user.displayName || (user as any).display_name || user.username || 'User';
                  const isVerified = user.isVerified || (user as any).is_verified;
                  const dmSettingsObj = (() => {
                    const raw = (user as any).dmSettings || (user as any).dmSetting;
                    return Array.isArray(raw) ? raw[0] : raw;
                  })();
                  const dmDisabled = dmSettingsObj?.disables?.includes('NEW_DM') || dmSettingsObj?.disables?.includes('all');
                  const perMessageFee = dmSettingsObj?.perMessageFee;

                  return (
                    <button
                      key={user._id || user.address}
                      onClick={() => handleSelectSearchUser(user)}
                      disabled={dmDisabled}
                      className={`w-full flex items-center gap-3 p-4 transition-colors text-left ${
                        dmDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-800/50'
                      }`}
                    >
                      <Avatar className="w-12 h-12">
                        {avatarUrl && <AvatarImage src={avatarUrl} />}
                        <AvatarFallback className="bg-zinc-700 text-white font-medium">
                          {displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white truncate">{displayName}</span>
                          {isVerified && <VerifiedBadge className="w-3.5 h-3.5" />}
                        </div>
                        {user.username && (
                          <p className="text-sm text-zinc-500 truncate">@{user.username}</p>
                        )}
                        {dmDisabled && (
                          <p className="text-xs text-red-400 mt-0.5">DMs disabled</p>
                        )}
                        {!dmDisabled && perMessageFee && perMessageFee > 0 && (
                          <p className="text-xs text-amber-400 mt-0.5">
                            {perMessageFee.toLocaleString()} DHB to message
                          </p>
                        )}
                      </div>
                      {!dmDisabled && (
                        <MessageCircle className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Searching indicator */}
            {searchQuery.trim().length >= 2 && isSearchingUsers && (
              <div className="flex items-center justify-center gap-2 py-4 text-zinc-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching users...
              </div>
            )}
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
