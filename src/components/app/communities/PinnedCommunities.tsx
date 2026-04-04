/**
 * Pinned Communities — shown on user profiles under bio.
 */

import { useNavigate } from 'react-router-dom';
import { Users, Plus, X } from 'lucide-react';
import { usePinnedCommunities, useUserCommunities, usePinCommunity, useUnpinCommunity } from '@/hooks/use-communities';
import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { Community } from '@/hooks/use-communities';

interface PinnedCommunitiesProps {
  walletAddress: string;
  isOwnProfile: boolean;
}

export function PinnedCommunities({ walletAddress, isOwnProfile }: PinnedCommunitiesProps) {
  const navigate = useNavigate();
  const { data: pinned = [] } = usePinnedCommunities(walletAddress);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (pinned.length === 0 && !isOwnProfile) return null;

  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      {pinned.map(pin => {
        const community = pin.communities as Community | undefined;
        if (!community) return null;
        return (
          <button
            key={pin.id}
            onClick={() => navigate(`/app/communities/${community.slug}`)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] transition-colors"
          >
            {community.avatar_url ? (
              <img src={community.avatar_url} alt="" className="w-4 h-4 rounded object-cover" />
            ) : (
              <Users className="w-3.5 h-3.5 text-zinc-500" />
            )}
            <span className="text-xs text-white/80">{community.name}</span>
          </button>
        );
      })}
      {isOwnProfile && pinned.length < 3 && (
        <button
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-dashed border-white/[0.1] hover:bg-white/[0.08] transition-colors text-xs text-zinc-500"
        >
          <Plus className="w-3 h-3" />
          Pin
        </button>
      )}
      {isOwnProfile && (
        <PinPickerDrawer
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          walletAddress={walletAddress}
          pinnedIds={new Set(pinned.map(p => p.community_id))}
          nextOrder={pinned.length}
        />
      )}
    </div>
  );
}

function PinPickerDrawer({ open, onOpenChange, walletAddress, pinnedIds, nextOrder }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  walletAddress: string;
  pinnedIds: Set<string>;
  nextOrder: number;
}) {
  const { data: userCommunities = [] } = useUserCommunities();
  const pinMutation = usePinCommunity();
  const unpinMutation = useUnpinCommunity();

  const communities = userCommunities.map(m => m.communities).filter(Boolean);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass hideHandle>
        <div className="px-4 pt-4 pb-2">
          <DrawerHeader className="p-0">
            <DrawerTitle className="text-white font-medium text-sm">Pin communities to profile</DrawerTitle>
          </DrawerHeader>
        </div>
        <div className="px-4 pb-6 space-y-1 max-h-[50vh] overflow-y-auto">
          {communities.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4 text-center">Join communities first to pin them</p>
          ) : (
            communities.map(c => {
              const isPinned = pinnedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    if (isPinned) {
                      unpinMutation.mutate(c.id);
                    } else if (pinnedIds.size < 3) {
                      pinMutation.mutate({ communityId: c.id, displayOrder: nextOrder });
                    }
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>
                  <span className="flex-1 text-sm text-white truncate">{c.name}</span>
                  {isPinned ? (
                    <X className="w-4 h-4 text-red-400" />
                  ) : pinnedIds.size < 3 ? (
                    <Plus className="w-4 h-4 text-zinc-500" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
