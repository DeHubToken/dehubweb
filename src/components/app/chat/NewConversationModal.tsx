/**
 * NewConversationModal Component
 * ==============================
 * Modal for searching and selecting a user to start a new DM conversation.
 */

import { useState } from 'react';
import { Search, Loader2, MessageCircle, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserSearchForDM, useCreateConversation } from '@/hooks/use-messages';
import { type DeHubUser, type DeHubConversation } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { toast } from 'sonner';
import { VerifiedBadge } from '../VerifiedBadge';

interface NewConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversation: DeHubConversation) => void;
}

function UserSearchResult({ 
  user, 
  onSelect, 
  isLoading,
}: { 
  user: DeHubUser; 
  onSelect: () => void;
  isLoading: boolean;
}) {
  const avatarPath = extractAvatarPath(user);
  const avatarUrl = user.address ? buildAvatarUrl(user.address, avatarPath) : undefined;
  const displayName = user.displayName || user.display_name || user.username || 'User';
  const isVerified = user.isVerified || user.is_verified;
  
  // Check DM settings
  const dmDisabled = user.dmSettings?.disables?.includes('all');
  
  return (
    <button
      onClick={onSelect}
      disabled={isLoading || dmDisabled}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
        dmDisabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'hover:bg-zinc-800'
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
          <p className="text-xs text-red-400 mt-1">DMs disabled</p>
        )}
      </div>
      
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      ) : !dmDisabled && (
        <MessageCircle className="w-5 h-5 text-zinc-400" />
      )}
    </button>
  );
}

export function NewConversationModal({ 
  open, 
  onOpenChange, 
  onConversationCreated,
}: NewConversationModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  const { data: searchResults, isLoading: isSearching } = useUserSearchForDM(searchQuery);
  const createConversation = useCreateConversation();

  const handleSelectUser = async (user: DeHubUser) => {
    const userAddress = user.address || user._id;
    if (!userAddress) {
      toast.error('Unable to start conversation with this user');
      return;
    }
    
    setSelectedUserId(userAddress);
    
    try {
      const conversation = await createConversation.mutateAsync({
        recipientAddress: userAddress,
        recipientUser: user,
      });
      toast.success('Conversation started!');
      onConversationCreated(conversation);
      onOpenChange(false);
      setSearchQuery('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to start conversation');
    } finally {
      setSelectedUserId(null);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setSearchQuery('');
    setSelectedUserId(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">New Message</DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search by username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
            autoFocus
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-zinc-400 hover:text-white"
              onClick={() => setSearchQuery('')}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Search Results */}
        <div className="max-h-80 overflow-y-auto -mx-2">
          {searchQuery.length < 2 ? (
            <div className="text-center py-8 text-zinc-500">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Enter at least 2 characters to search</p>
            </div>
          ) : isSearching ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : searchResults?.items?.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <p>No users found</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-1 px-2">
              {searchResults?.items?.map((user) => (
                <UserSearchResult
                  key={user._id || user.address}
                  user={user}
                  onSelect={() => handleSelectUser(user)}
                  isLoading={selectedUserId === (user.address || user._id)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
