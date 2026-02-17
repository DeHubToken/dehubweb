/**
 * CreateGroupModal Component
 * ==============================
 * Modal for creating a new group chat with name, description, and member selection.
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Search, Loader2, X, Users, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserSearchForDM } from '@/hooks/use-messages';
import { createGroup, type DeHubUser, type DeHubConversation, getAuthToken, DEHUB_CDN_BASE } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { toast } from 'sonner';
import { VerifiedBadge } from '../VerifiedBadge';
import { Textarea } from '@/components/ui/textarea';

const DEHUB_API_BASE = "https://api.dehub.io";

interface CreateGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupCreated: (conversation: DeHubConversation) => void;
}

function UserSelectItem({ 
  user, 
  isSelected,
  onToggle,
}: { 
  user: DeHubUser; 
  isSelected: boolean;
  onToggle: () => void;
}) {
  const avatarPath = extractAvatarPath(user);
  const avatarUrl = user.address ? buildAvatarUrl(user.address, avatarPath) : undefined;
  const displayName = user.displayName || user.display_name || user.username || 'User';
  const isVerified = user.isVerified || user.is_verified;
  
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
        isSelected ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-zinc-800'
      }`}
    >
      <Avatar className="w-10 h-10">
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
      </div>
      
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
        isSelected ? 'border-primary bg-primary' : 'border-zinc-600'
      }`}>
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>
    </button>
  );
}

export function CreateGroupModal({ 
  open, 
  onOpenChange, 
  onGroupCreated,
}: CreateGroupModalProps) {
  const { walletAddress } = useAuth();
  const [step, setStep] = useState<'details' | 'members'>('details');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<DeHubUser[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  
  const { data: searchResults, isLoading: isSearching } = useUserSearchForDM(searchQuery);

  const handleToggleMember = (user: DeHubUser) => {
    const userId = user.address || user._id;
    if (!userId) return;
    
    const isSelected = selectedMembers.some(m => (m.address || m._id) === userId);
    if (isSelected) {
      setSelectedMembers(selectedMembers.filter(m => (m.address || m._id) !== userId));
    } else {
      setSelectedMembers([...selectedMembers, user]);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error('Please select at least one member');
      return;
    }

    const token = getAuthToken();
    if (!token) {
      toast.error('Authentication required');
      return;
    }

    setIsCreating(true);
    
    try {
      const memberAddresses = selectedMembers.map(m => m.address || m._id).filter(Boolean);
      if (walletAddress && !memberAddresses.includes(walletAddress)) {
        memberAddresses.push(walletAddress);
      }

      const groupConversation = await createGroup(
        groupName.trim(),
        memberAddresses,
        groupDescription.trim() || undefined
      );
      
      toast.success('Group created!');
      onGroupCreated({
        ...groupConversation,
        isGroup: true,
        participants: selectedMembers,
      });
      handleClose();
    } catch (error: any) {
      console.error('[CreateGroupModal] Error creating group:', error);
      toast.error(error.message || 'Failed to create group');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setStep('details');
    setGroupName('');
    setGroupDescription('');
    setSearchQuery('');
    setSelectedMembers([]);
  };

  const handleRemoveMember = (userId: string) => {
    setSelectedMembers(selectedMembers.filter(m => (m.address || m._id) !== userId));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            {step === 'details' ? 'Create Group' : 'Add Members'}
          </DialogTitle>
        </DialogHeader>

        {step === 'details' ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">Group Name *</label>
              <Input
                placeholder="Enter group name..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
                autoFocus
              />
            </div>
            
            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">Description (optional)</label>
              <Textarea
                placeholder="What's this group about?"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl resize-none"
                rows={3}
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button
                variant="glass"
                onClick={handleClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="glass"
                onClick={() => setStep('members')}
                disabled={!groupName.trim()}
                className="flex-1"
              >
                Next
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Selected Members */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedMembers.map((member) => {
                  const displayName = member.displayName || member.display_name || member.username || 'User';
                  const userId = member.address || member._id || '';
                  return (
                    <div 
                      key={userId}
                      className="flex items-center gap-1.5 bg-zinc-800 px-2.5 py-1.5 rounded-lg"
                    >
                      <span className="text-sm text-white">{displayName}</span>
                      <button 
                        onClick={() => handleRemoveMember(userId)}
                        className="text-zinc-500 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search users to add..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
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
            <div className="max-h-60 overflow-y-auto -mx-2">
              {searchQuery.length < 2 ? (
                <div className="text-center py-6 text-zinc-500">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Enter at least 2 characters to search</p>
                </div>
              ) : isSearching ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
              ) : searchResults?.items?.length === 0 ? (
                <div className="text-center py-6 text-zinc-500">
                  <p className="text-sm">No users found</p>
                </div>
              ) : (
                <div className="space-y-1 px-2">
                  {searchResults?.items?.map((user) => {
                    const userId = user.address || user._id;
                    const isSelected = selectedMembers.some(m => (m.address || m._id) === userId);
                    return (
                      <UserSelectItem
                        key={userId}
                        user={user}
                        isSelected={isSelected}
                        onToggle={() => handleToggleMember(user)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="glass"
                onClick={() => setStep('details')}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                variant="glass"
                onClick={handleCreateGroup}
                disabled={selectedMembers.length === 0 || isCreating}
                className="flex-1"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  `Create (${selectedMembers.length})`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
