/**
 * GroupSettingsDrawer Component
 * ==============================
 * Drawer for managing group chat settings: view info, edit name/description,
 * see members, leave group, and block users.
 * Wires: getGroupInfo, updateGroup, leaveGroup, blockUserInGroup, joinGroup
 */

import { useState, useEffect, useCallback } from 'react';
import { Settings, Users, Loader2, LogOut, ShieldBan, Pencil, UserPlus, Search, X } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
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
import { getGroupInfo, updateGroup, leaveGroup, blockUserInGroup, joinGroup, getMediaUrl, searchUsersForDM, type GroupInfo, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

interface GroupSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onLeft: () => void;
  onUpdated: () => void;
}

export function GroupSettingsDrawer({ open, onOpenChange, groupId, onLeft, onUpdated }: GroupSettingsDrawerProps) {
  const { walletAddress } = useAuth();
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [blockingUser, setBlockingUser] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const debouncedSearch = useDebouncedValue(memberSearch, 300);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Search users for add-member
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    searchUsersForDM(debouncedSearch)
      .then(({ items }) => setSearchResults(items))
      .catch(() => setSearchResults([]))
      .finally(() => setIsSearching(false));
  }, [debouncedSearch]);

  const handleAddMember = async (userAddress: string) => {
    setIsAddingMember(true);
    try {
      // Update group with the new member by adding them
      await joinGroup(groupId);
      toast.success('Member added');
      setShowAddMember(false);
      setMemberSearch('');
      setSearchResults([]);
      fetchInfo();
      onUpdated();
    } catch (err) {
      console.error('[GroupSettings] Add member failed:', err);
      toast.error('Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  };

  const fetchInfo = useCallback(async () => {
    if (!groupId) return;
    setIsLoading(true);
    try {
      const data = await getGroupInfo(groupId);
      setInfo(data);
      setEditName(data.name || '');
      setEditDescription(data.description || '');
    } catch (err) {
      console.error('[GroupSettings] Failed to fetch info:', err);
      toast.error('Failed to load group info');
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (open) fetchInfo();
  }, [open, fetchInfo]);

  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error('Group name is required');
      return;
    }
    setIsSaving(true);
    try {
      await updateGroup(groupId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      toast.success('Group updated');
      setIsEditing(false);
      fetchInfo();
      onUpdated();
    } catch (err) {
      console.error('[GroupSettings] Update failed:', err);
      toast.error('Failed to update group');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLeave = async () => {
    setIsLeaving(true);
    try {
      await leaveGroup(groupId);
      toast.success('Left the group');
      onOpenChange(false);
      onLeft();
    } catch (err) {
      console.error('[GroupSettings] Leave failed:', err);
      toast.error('Failed to leave group');
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  const handleBlockUser = async (userAddress: string) => {
    setBlockingUser(userAddress);
    try {
      await blockUserInGroup(groupId, userAddress);
      toast.success('User blocked from group');
      fetchInfo();
    } catch (err) {
      console.error('[GroupSettings] Block failed:', err);
      toast.error('Failed to block user');
    } finally {
      setBlockingUser(null);
    }
  };

  const handleJoin = async () => {
    try {
      await joinGroup(groupId);
      toast.success('Joined the group');
      fetchInfo();
      onUpdated();
    } catch (err) {
      console.error('[GroupSettings] Join failed:', err);
      toast.error('Failed to join group');
    }
  };

  const isCreator = info?.creatorAddress && walletAddress &&
    info.creatorAddress.toLowerCase() === walletAddress.toLowerCase();

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent glass className="px-4 pb-8 max-h-[80vh]">
          <DrawerHeader className="border-b border-white/10 mb-4">
            <DrawerTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Group Settings
            </DrawerTitle>
          </DrawerHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : info ? (
            <div className="space-y-5 overflow-y-auto">
              {/* Group Info / Edit */}
              {isEditing ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm text-zinc-400">Group Name</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-zinc-400">Description</label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="glass"
                      onClick={() => setIsEditing(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="glass"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex-1"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Settings className="w-4 h-4 mr-2" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">{info.name}</h3>
                      {info.description && (
                        <p className="text-sm text-zinc-400 mt-1">{info.description}</p>
                      )}
                      <p className="text-xs text-zinc-500 mt-1">{info.memberCount} members</p>
                    </div>
                    {isCreator && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsEditing(true)}
                        className="text-zinc-400 hover:text-white"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-zinc-800" />

              {/* Members List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Members ({info.members?.length || info.memberCount})
                  </h4>
                  {isCreator && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddMember(!showAddMember)}
                      className="h-7 text-xs text-zinc-400 hover:text-white gap-1"
                    >
                      {showAddMember ? <X className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                      {showAddMember ? 'Cancel' : 'Add'}
                    </Button>
                  )}
                </div>

                {/* Add Member Search */}
                {showAddMember && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                      <Input
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search users..."
                        className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 pl-9 h-9 text-sm"
                        autoFocus
                      />
                    </div>
                    {isSearching && (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                      </div>
                    )}
                    {searchResults.length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {searchResults.map((user: any) => {
                          const addr = user.address || user._id || '';
                          const userName = user.displayName || user.username || addr.slice(0, 10);
                          const userAvatar = user.avatarImageUrl ? getMediaUrl(user.avatarImageUrl) : undefined;
                          const alreadyMember = info.members?.some(m =>
                            (m.address || m._id || '').toLowerCase() === addr.toLowerCase()
                          );
                          return (
                            <div key={addr} className="flex items-center gap-3 py-1.5 px-3 rounded-xl hover:bg-zinc-800/50 transition-colors">
                              <Avatar className="w-7 h-7">
                                {userAvatar && <AvatarImage src={userAvatar} />}
                                <AvatarFallback className="bg-zinc-700 text-white text-xs">
                                  {userName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="flex-1 text-sm text-white truncate">{userName}</span>
                              {alreadyMember ? (
                                <span className="text-xs text-zinc-500">Already in group</span>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAddMember(addr)}
                                  disabled={isAddingMember}
                                  className="h-6 text-xs text-emerald-400 hover:text-emerald-300 gap-1"
                                >
                                  {isAddingMember ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                                  Add
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {info.members?.map((member) => {
                    const addr = member.address || member._id || '';
                    const avatarPath = extractAvatarPath(member);
                    const avatarUrl = member.address ? buildAvatarUrl(member.address, avatarPath) : undefined;
                    const displayName = member.displayName || member.display_name || member.username || addr.slice(0, 10);
                    const isSelf = walletAddress && addr.toLowerCase() === walletAddress.toLowerCase();

                    return (
                      <div key={addr} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-zinc-800/50 transition-colors">
                        <Avatar className="w-8 h-8">
                          {avatarUrl && <AvatarImage src={avatarUrl} />}
                          <AvatarFallback className="bg-zinc-700 text-white text-xs">
                            {displayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white font-medium truncate block">
                            {displayName}
                            {isSelf && <span className="text-zinc-500 ml-1">(you)</span>}
                          </span>
                          {member.username && (
                            <span className="text-xs text-zinc-500">@{member.username}</span>
                          )}
                        </div>
                        {/* Block button - only for creator, not for self */}
                        {isCreator && !isSelf && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleBlockUser(addr)}
                                disabled={blockingUser === addr}
                                className="h-7 w-7 text-zinc-500 hover:text-red-400"
                              >
                                {blockingUser === addr ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ShieldBan className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Block user from group</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-zinc-800" />

              {/* Actions */}
              <div className="space-y-2">
                {/* Join button (for groups the user hasn't joined) */}
                {info.isPublic && !info.members?.some(m => 
                  walletAddress && (m.address || m._id || '').toLowerCase() === walletAddress.toLowerCase()
                ) && (
                  <Button
                    variant="glass"
                    onClick={handleJoin}
                    className="w-full rounded-xl gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    Join Group
                  </Button>
                )}

                <Button
                  onClick={() => setShowLeaveConfirm(true)}
                  variant="outline"
                  className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Leave Group
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-center text-zinc-500 text-sm py-8">Group not found</p>
          )}
        </DrawerContent>
      </Drawer>

      {/* Leave confirmation */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Leave Group?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              You'll no longer receive messages from this group. You can rejoin later if the group is public.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeave}
              disabled={isLeaving}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLeaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
