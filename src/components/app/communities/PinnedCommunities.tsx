/**
 * Pinned Communities — X-style community cards on user profiles.
 */

import { useNavigate } from 'react-router-dom';
import { Users, Plus, X, Pin } from 'lucide-react';
import { usePinnedCommunities, useUserCommunities, usePinCommunity, useUnpinCommunity, useCommunityMembers } from '@/hooks/use-communities';
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
    <div className="mt-3">
      <div className="space-y-2">
        {pinned.map(pin => {
          const community = pin.communities as Community | undefined;
          if (!community) return null;
          return (
            <PinnedCommunityCard
              key={pin.id}
              community={community}
              onClick={() => navigate(`/app/communities/${community.slug}`)}
              isOwnProfile={isOwnProfile}
              onManagePins={() => setPickerOpen(true)}
            />
          );
        })}
      </div>
      {isOwnProfile && pinned.length === 0 && (
        <button
          onClick={() => setPickerOpen(true)}
          className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-dashed border-white/[0.1] hover:bg-white/[0.08] transition-colors text-xs text-zinc-500"
        >
          <Plus className="w-3 h-3" />
          Pin community
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

/** X-style community card */
function PinnedCommunityCard({ community, onClick, isOwnProfile, onManagePins }: { community: Community; onClick: () => void; isOwnProfile?: boolean; onManagePins?: () => void }) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left"
      >
        {/* Community avatar */}
        <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0">
          {community.avatar_url ? (
            <img src={community.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Users className="w-5 h-5 text-zinc-500" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{community.name}</p>
          {community.description && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">{community.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <Users className="w-3 h-3 text-zinc-500" />
            <span className="text-xs text-zinc-500">
              <span className="font-semibold text-zinc-300">{community.member_count.toLocaleString()}</span> Members
            </span>
          </div>
        </div>
      </button>
      {isOwnProfile && onManagePins && (
        <button
          onClick={(e) => { e.stopPropagation(); onManagePins(); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm border border-white/[0.1] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
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
