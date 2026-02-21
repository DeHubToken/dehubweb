import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getSuggestedAccounts, followUser, type SuggestedAccount } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { toast } from 'sonner';

export function WhoToFollow() {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress } = useAuth();
  const { handleApiError } = useReauthHandler();
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState<Set<string>>(new Set());

  // Fetch suggested accounts from dedicated API
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['suggested-accounts', walletAddress],
    queryFn: () => getSuggestedAccounts(50),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Filter out already-followed users (locally tracked)
  const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];

  const filteredSuggestions = useMemo(() => {
    return safeSuggestions.filter(user => !followedUsers.has(user.address));
  }, [safeSuggestions, followedUsers]);

  const getAvatarUrl = (user: SuggestedAccount) => {
    const avatarPath = user.avatarImageUrl || user.avatarUrl;
    if (avatarPath && user.address) {
      return buildAvatarUrl(user.address, avatarPath);
    }
    return undefined;
  };

  const getDisplayName = (user: SuggestedAccount) => {
    return user.displayName || user.username || `${user.address.slice(0, 6)}...${user.address.slice(-4)}`;
  };

  const handleUserClick = (user: SuggestedAccount) => {
    const target = user.username || user.address;
    if (target) {
      navigate(`/${target}`);
    }
  };

  const handleFollow = async (e: React.MouseEvent, user: SuggestedAccount) => {
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error('Please log in to follow users');
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('already') || errorMessage.toLowerCase().includes('following')) {
        toast.info(`You're already following ${getDisplayName(user)}`);
        setFollowedUsers(prev => new Set(prev).add(user.address));
      } else {
        handleApiError(error, 'Failed to follow user');
      }
    } finally {
      setLoadingUsers(prev => {
        const next = new Set(prev);
        next.delete(user.address);
        return next;
      });
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (filteredSuggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
          <UserPlus className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm">No suggestions yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {filteredSuggestions.map((user) => (
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
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => handleFollow(e, user)}
              disabled={loadingUsers.has(user.address)}
              className="h-8 w-[72px] text-xs font-semibold rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent flex items-center justify-center"
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

      <div className="relative">
        <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
