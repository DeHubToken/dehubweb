import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { searchNFTs, followUser, getAccountInfo } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface UniqueUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

export function WhoToFollow() {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress } = useAuth();
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState<Set<string>>(new Set());

  // Fetch current user's following list
  const { data: currentUserData } = useQuery({
    queryKey: ['current-user-followings', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      return getAccountInfo(walletAddress);
    },
    enabled: !!walletAddress,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
  });

  // Get following list as a Set for O(1) lookups
  const followingSet = useMemo(() => {
    const followings = currentUserData?.followings;
    if (!followings || !Array.isArray(followings)) return new Set<string>();
    return new Set(followings.map(addr => addr.toLowerCase()));
  }, [currentUserData?.followings]);

  const { data, isLoading } = useQuery({
    queryKey: ['suggestions', 'recently-active'],
    queryFn: async () => {
      // Fetch recent posts to find active users
      const response = await searchNFTs({ 
        sortMode: 'new', 
        unit: 100,
        page: 0 
      });
      
      // Extract unique users from recent posts
      const seenAddresses = new Set<string>();
      const uniqueUsers: UniqueUser[] = [];
      
      for (const nft of response.data || []) {
        const address = nft.minter;
        if (!address || seenAddresses.has(address)) continue;
        
        seenAddresses.add(address);
        uniqueUsers.push({
          address,
          username: nft.mintername,
          displayName: nft.minterDisplayName,
          avatarUrl: nft.minterAvatarUrl,
        });
        
        // Stop after 50 unique users
        if (uniqueUsers.length >= 50) break;
      }
      
      return uniqueUsers;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes cache
  });

  // Filter out users that are already followed, the current user, and newly followed users
  const suggestions = useMemo(() => {
    const allUsers = data || [];
    return allUsers.filter(user => {
      const addressLower = user.address.toLowerCase();
      // Exclude current user
      if (walletAddress && addressLower === walletAddress.toLowerCase()) return false;
      // Exclude already-followed users from API data
      if (followingSet.has(addressLower)) return false;
      // Exclude users just followed in this session
      if (followedUsers.has(user.address)) return false;
      return true;
    });
  }, [data, walletAddress, followingSet, followedUsers]);

  const getAvatarUrl = (user: UniqueUser) => {
    if (user.avatarUrl && user.address) {
      return buildAvatarUrl(user.address, user.avatarUrl);
    }
    return undefined; // No fallback image - use initial instead
  };

  const getDisplayName = (user: UniqueUser) => {
    return user.displayName || user.username || `${user.address.slice(0, 6)}...${user.address.slice(-4)}`;
  };

  const getHandle = (user: UniqueUser) => {
    if (user.username) return `@${user.username}`;
    return `${user.address.slice(0, 6)}...${user.address.slice(-4)}`;
  };

  const handleUserClick = (user: UniqueUser) => {
    if (user.username) {
      navigate(`/${user.username}`);
    }
  };

  const handleFollow = async (e: React.MouseEvent, user: UniqueUser) => {
    e.stopPropagation();
    
    if (!isAuthenticated) {
      toast.error('Please connect your wallet to follow users');
      return;
    }

    if (loadingUsers.has(user.address) || followedUsers.has(user.address)) {
      return;
    }

    setLoadingUsers(prev => new Set(prev).add(user.address));

    try {
      await followUser(user.address);
      setFollowedUsers(prev => new Set(prev).add(user.address));
      toast.success(`Following ${getDisplayName(user)}!`);
    } catch (error) {
      console.error('Failed to follow user:', error);
      toast.error('Failed to follow user');
    } finally {
      setLoadingUsers(prev => {
        const next = new Set(prev);
        next.delete(user.address);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
          <UserPlus className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm">No suggestions yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {suggestions.map((user) => (
          <div
            key={user.address}
            onClick={() => handleUserClick(user)}
            className="flex items-center gap-3 py-2 px-4 hover:bg-zinc-800/50 transition-colors cursor-pointer"
          >
            <Avatar className="w-10 h-10">
              {getAvatarUrl(user) && <AvatarImage src={getAvatarUrl(user)} />}
              <AvatarFallback className="bg-zinc-700 text-white font-medium">
                {getDisplayName(user).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-white text-sm truncate block">{getDisplayName(user)}</span>
              <span className="text-zinc-500 text-xs">{getHandle(user)}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => handleFollow(e, user)}
              disabled={loadingUsers.has(user.address)}
              className="h-8 px-4 text-xs font-semibold rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent"
            >
              {loadingUsers.has(user.address) ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                'Follow'
              )}
            </Button>
          </div>
        ))}
      </div>

      {/* Bottom fade gradient */}
      <div className="relative">
        <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
