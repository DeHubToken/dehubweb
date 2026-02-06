import { useState } from 'react';
import { Check, X, Loader2, UserPlus, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFollowRequests, approveFollowRequest, rejectFollowRequest, type FollowRequestItem } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

interface FollowRequestsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FollowRequestsDrawer({ open, onOpenChange }: FollowRequestsDrawerProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['follow-requests'],
    queryFn: getFollowRequests,
    enabled: open,
    staleTime: 1000 * 30,
  });

  const approveMutation = useMutation({
    mutationFn: (address: string) => approveFollowRequest(address),
    onMutate: (address) => {
      setProcessingIds(prev => new Set(prev).add(address));
    },
    onSuccess: (_, address) => {
      queryClient.invalidateQueries({ queryKey: ['follow-requests'] });
      queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      toast.success('Follow request approved');
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(address);
        return next;
      });
    },
    onError: (_, address) => {
      toast.error('Failed to approve request');
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(address);
        return next;
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (address: string) => rejectFollowRequest(address),
    onMutate: (address) => {
      setProcessingIds(prev => new Set(prev).add(address));
    },
    onSuccess: (_, address) => {
      queryClient.invalidateQueries({ queryKey: ['follow-requests'] });
      toast.success('Follow request rejected');
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(address);
        return next;
      });
    },
    onError: (_, address) => {
      toast.error('Failed to reject request');
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(address);
        return next;
      });
    },
  });

  const handleNavigateToProfile = (request: FollowRequestItem) => {
    const target = request.username || request.address;
    if (target) {
      onOpenChange(false);
      navigate(`/${target}`);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-8 max-h-[85vh]">
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-white text-lg font-bold flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Follow Requests
            {requests.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-white/10 text-white rounded-lg">
                {requests.length}
              </span>
            )}
          </DrawerTitle>
        </DrawerHeader>

        <div className="overflow-y-auto max-h-[60vh] space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">No pending requests</p>
              <p className="text-zinc-500 text-sm mt-1">Follow requests will appear here</p>
            </div>
          ) : (
            requests.map((request) => {
              const isProcessing = processingIds.has(request.address);
              const avatarUrl = buildAvatarUrl(request.address, request.avatarImageUrl || request.avatarUrl);
              const displayName = request.displayName || request.username || request.address.slice(0, 8);

              return (
                <div
                  key={request.address}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10"
                >
                  {/* Avatar - clickable */}
                  <button
                    onClick={() => handleNavigateToProfile(request)}
                    className="flex-shrink-0"
                  >
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={avatarUrl} />
                      <AvatarFallback className="bg-zinc-700 text-white">
                        {displayName[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => handleNavigateToProfile(request)}
                      className="text-left"
                    >
                      <p className="text-white font-medium text-sm truncate">{displayName}</p>
                      {request.username && (
                        <p className="text-zinc-500 text-xs">@{request.username.replace('@', '')}</p>
                      )}
                    </button>
                    {request.createdAt && (
                      <p className="text-zinc-600 text-xs mt-0.5">
                        {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(request.address)}
                      disabled={isProcessing}
                      className="rounded-xl bg-white text-black hover:bg-zinc-200 h-8 px-3 gap-1"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span className="text-xs">Accept</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(request.address)}
                      disabled={isProcessing}
                      className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent h-8 px-3 gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span className="text-xs">Reject</span>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
