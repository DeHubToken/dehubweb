import { useQuery } from '@tanstack/react-query';
import { UserPlus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { searchNFTs, getMediaUrl, type DeHubNFT } from '@/lib/api/dehub';
import { VerifiedBadge } from './VerifiedBadge';

interface UniqueUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

export function WhoToFollow() {
  const navigate = useNavigate();

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

  const suggestions = data || [];

  const getAvatarUrl = (user: UniqueUser) => {
    if (user.avatarUrl) {
      return getMediaUrl(user.avatarUrl);
    }
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${user.address}`;
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

  const handleFollow = (e: React.MouseEvent, user: UniqueUser) => {
    e.stopPropagation();
    // TODO: Implement follow API call
    console.log('Follow user:', user.address);
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
              <AvatarImage src={getAvatarUrl(user)} />
              <AvatarFallback className="bg-zinc-700 text-white">
                {getDisplayName(user).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-white text-sm truncate">{getDisplayName(user)}</span>
                <VerifiedBadge className="w-3.5 h-3.5" />
              </div>
              <span className="text-zinc-500 text-xs">{getHandle(user)}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => handleFollow(e, user)}
              className="h-8 px-4 text-xs font-semibold rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent"
            >
              Follow
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
