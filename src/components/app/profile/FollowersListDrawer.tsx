import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, UserPlus, UserMinus, X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { getAccountInfo, followUser, unfollowUser, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  addresses: string[];
  title: 'Followers' | 'Following';
  /** Current profile's wallet address (for context) */
  profileAddress?: string;
}

export function FollowersListDrawer({
  open,
  onOpenChange,
  addresses,
  title,
  profileAddress,
}: FollowersListDrawerProps) {
  const navigate = useNavigate();
  const { walletAddress: currentUserAddress, isAuthenticated } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFollows, setLoadingFollows] = useState<Set<string>>(new Set());

  // Fetch user details when drawer opens
  useEffect(() => {
    if (!open || addresses.length === 0) {
      setUsers([]);
      return;
    }

    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        // Batch fetch in chunks of 10 for performance
        const chunkSize = 10;
        const results: UserListItem[] = [];
        
        for (let i = 0; i < addresses.length; i += chunkSize) {
          const chunk = addresses.slice(i, i + chunkSize);
          const promises = chunk.map(async (address) => {
            try {
              const user = await getAccountInfo(address, currentUserAddress || undefined);
              return {
                address,
                username: user.username,
                displayName: user.displayName || user.display_name || user.username,
                avatarUrl: buildAvatarUrl(address, user.avatarImageUrl || user.avatarUrl || user.avatar_url),
                isVerified: user.isVerified || user.is_verified,
                isFollowing: user.isFollowing,
                followsYou: user.followsYou,
              } as UserListItem;
            } catch {
              // Return minimal info if fetch fails
              return { address } as UserListItem;
            }
          });
          
          const chunkResults = await Promise.all(promises);
          results.push(...chunkResults);
        }
        
        setUsers(results);
      } catch (error) {
        console.error('Error fetching user list:', error);
        toast.error('Failed to load user list');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [open, addresses, currentUserAddress]);

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
      toast.error('Failed to update follow status');
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
      <DrawerContent glass className="max-h-[85vh]">
        <DrawerHeader className="flex items-center justify-between px-4 pb-2">
          <DrawerTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            {title} ({addresses.length})
          </DrawerTitle>
          <DrawerClose asChild>
            <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </DrawerClose>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-4 pb-6" style={{ maxHeight: 'calc(85vh - 80px)' }}>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: Math.min(5, addresses.length) }).map((_, i) => (
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
                        {user.displayName || user.username || 'Unknown'}
                      </span>
                      {user.isVerified && <VerifiedBadge className="w-4 h-4 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2">
                      {user.username && (
                        <span className="text-zinc-500 text-sm truncate">@{user.username.replace('@', '')}</span>
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
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
