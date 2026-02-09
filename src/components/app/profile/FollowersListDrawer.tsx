import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, UserPlus, UserMinus, X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { getFollowList, followUser, unfollowUser, type FollowListItem } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/** Truncate a hex address to 0x1234…abcd */
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface UserListItem {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  isFollowing?: boolean;
  followsYou?: boolean;
}

interface FollowersListDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wallet address of the profile to fetch followers/following for */
  profileAddress: string;
  title: 'Followers' | 'Following';
}

/**
 * Map API follow list item to local UserListItem format
 */
function mapFollowListItem(item: FollowListItem): UserListItem {
  return {
    address: item.address,
    username: item.username,
    displayName: item.displayName || item.username,
    avatarUrl: buildAvatarUrl(item.address, item.avatarImageUrl || item.avatarUrl),
    isVerified: item.isVerified,
    isFollowing: item.isFollowing,
    followsYou: item.followsYou,
  };
}

export function FollowersListDrawer({
  open,
  onOpenChange,
  profileAddress,
  title,
}: FollowersListDrawerProps) {
  const navigate = useNavigate();
  const { walletAddress: currentUserAddress, isAuthenticated } = useAuth();
  const { handleApiError } = useReauthHandler();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFollows, setLoadingFollows] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch follow list when drawer opens, then enrich raw addresses via batch-avatars
  useEffect(() => {
    if (!open || !profileAddress) {
      return;
    }

    const fetchFollowList = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const type = title === 'Followers' ? 'followers' : 'following';
        const { items: result } = await getFollowList(profileAddress, type);

        // Check if items are raw addresses (no username populated)
        const needsEnrichment = result.length > 0 && result.every(item => !item.username);

        if (needsEnrichment) {
          // Show placeholder items immediately while enriching
          const placeholders = result.map(item => ({
            address: item.address,
            username: undefined,
            displayName: truncateAddress(item.address),
            avatarUrl: undefined,
          } as UserListItem));
          setUsers(placeholders);
          setIsLoading(false);

          // Enrich via batch-avatars edge function
          try {
            const addresses = result.map(item => item.address);
            const { data: enrichData, error: enrichErr } = await supabase.functions.invoke('batch-avatars', {
              body: { addresses },
            });

            if (!enrichErr && enrichData?.avatars) {
              const avatarMap = enrichData.avatars as Record<string, {
                avatarUrl: string | null;
                username: string | null;
                displayName: string | null;
              }>;

              setUsers(prev => prev.map(user => {
                const enriched = avatarMap[user.address.toLowerCase()];
                if (!enriched) return user;
                return {
                  ...user,
                  username: enriched.username || undefined,
                  displayName: enriched.displayName || enriched.username || truncateAddress(user.address),
                  avatarUrl: buildAvatarUrl(user.address, enriched.avatarUrl || undefined),
                };
              }));
            }
          } catch (enrichError) {
            console.warn('Avatar enrichment failed, showing addresses:', enrichError);
            // Keep the placeholder items — still usable
          }
        } else {
          // Already enriched objects from API
          const mappedUsers = result.map(mapFollowListItem);
          setUsers(mappedUsers);
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('Error fetching follow list:', err);
        const msg = err?.message || '';
        if (msg.toLowerCase().includes('hidden')) {
          setError('This user has hidden their followers/following list.');
        } else {
          setError('Failed to load list. Please try again.');
          toast.error('Failed to load follow list');
        }
        setIsLoading(false);
      }
    };

    fetchFollowList();
  }, [open, profileAddress, title, currentUserAddress]);

  // Reset state when drawer closes
  useEffect(() => {
    if (!open) {
      setUsers([]);
      setError(null);
    }
  }, [open]);

  const handleUserClick = (user: UserListItem) => {
    onOpenChange(false);
    if (user.username) {
      navigate(`/${user.username}`);
    } else {
      navigate(`/profile?id=${user.address}`);
    }
  };

  const handleFollowToggle = async (user: UserListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!isAuthenticated) {
      toast.error('Please connect your wallet first');
      return;
    }

    setLoadingFollows(prev => new Set(prev).add(user.address));

    try {
      if (user.isFollowing) {
        await unfollowUser(user.address);
        setUsers(prev => prev.map(u => 
          u.address === user.address ? { ...u, isFollowing: false } : u
        ));
        toast.success(`Unfollowed ${user.displayName || user.username || 'user'}`);
      } else {
        await followUser(user.address);
        setUsers(prev => prev.map(u => 
          u.address === user.address ? { ...u, isFollowing: true } : u
        ));
        toast.success(`Following ${user.displayName || user.username || 'user'}`);
      }
    } catch (error) {
      handleApiError(error, 'Failed to update follow status');
    } finally {
      setLoadingFollows(prev => {
        const next = new Set(prev);
        next.delete(user.address);
        return next;
      });
    }
  };

  const isCurrentUser = (address: string) => 
    currentUserAddress?.toLowerCase() === address.toLowerCase();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="max-h-[85vh]" hideHandle>
        <DrawerClose asChild>
          <button className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </DrawerClose>
        <DrawerHeader className="px-4 pb-2">
          <DrawerTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            {title}
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 px-4 pb-6 overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(85vh - 80px)', WebkitOverflowScrolling: 'touch' }}>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-lg font-medium">Error Loading</p>
              <p className="text-zinc-500 text-sm mt-1">{error}</p>
              <Button
                variant="ghost"
                className="mt-4 text-zinc-400"
                onClick={() => {
                  onOpenChange(false);
                  setTimeout(() => onOpenChange(true), 100);
                }}
              >
                Try Again
              </Button>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-lg font-medium">
                {title === 'Followers' ? 'No followers yet' : 'Not following anyone'}
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {title === 'Followers' 
                  ? 'Followers will appear here'
                  : 'Follow users to see them here'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <button
                  key={user.address}
                  onClick={() => handleUserClick(user)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
                >
                  <Avatar className="w-12 h-12 rounded-lg">
                    {user.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={user.displayName || 'User'} />
                    ) : null}
                    <AvatarFallback className="bg-zinc-800 text-white rounded-lg">
                      {(user.displayName || user.username || '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white truncate">
                        {user.displayName || user.username || truncateAddress(user.address)}
                      </span>
                      {user.isVerified && <VerifiedBadge className="w-4 h-4 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2">
                      {user.username ? (
                        <span className="text-zinc-500 text-sm truncate">@{user.username.replace('@', '')}</span>
                      ) : (
                        <span className="text-zinc-600 text-sm truncate font-mono">{truncateAddress(user.address)}</span>
                      )}
                      {user.followsYou && !isCurrentUser(user.address) && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                          Follows you
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Follow/Unfollow button - hide for self */}
                  {!isCurrentUser(user.address) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => handleFollowToggle(user, e)}
                      disabled={loadingFollows.has(user.address)}
                      className={cn(
                        "shrink-0 rounded-lg",
                        user.isFollowing
                          ? "bg-zinc-800 text-white hover:bg-red-500/20 hover:text-red-400"
                          : "bg-white/10 text-white hover:bg-white/20"
                      )}
                    >
                      {loadingFollows.has(user.address) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : user.isFollowing ? (
                        <>
                          <UserMinus className="w-4 h-4 mr-1" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-1" />
                          Follow
                        </>
                      )}
                    </Button>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
