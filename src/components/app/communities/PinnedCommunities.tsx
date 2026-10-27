/**
 * Pinned Communities — X-style community cards on user profiles.
 */

import { useNavigate } from 'react-router-dom';
import { Pin } from "lucide-react";
import Users from "@/components/ui/cut-icons/communities";

import Plus from "@/components/ui/cut-icons/add";
import X from "@/components/ui/cut-icons/close";

import { usePinnedCommunities, useUserCommunities, usePinCommunity, useUnpinCommunity, useShowPinFirst } from '@/hooks/use-communities';
import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { Community } from '@/hooks/use-communities';
import { useTranslation } from 'react-i18next';
import { storageImage, deviceWidth } from '@/lib/media-url';

interface PinnedCommunitiesProps {
  walletAddress: string;
  isOwnProfile: boolean;
  /** The community already shown in the profile header's banner strip. */
  featuredId?: string;
  /** Lets the header's strip open the same picker. */
  pickerOpen?: boolean;
  onPickerOpenChange?: (open: boolean) => void;
  /** Lets the header's strip open the rest of the pins. */
  moreOpen?: boolean;
  onMoreOpenChange?: (open: boolean) => void;
}

export function PinnedCommunities({ walletAddress, isOwnProfile, featuredId, pickerOpen: pickerOpenProp, onPickerOpenChange, moreOpen: moreOpenProp, onMoreOpenChange }: PinnedCommunitiesProps) {
  const navigate = useNavigate();
  const { data: pinned = [] } = usePinnedCommunities(walletAddress);
  const [pickerOpenState, setPickerOpenState] = useState(false);
  const pickerOpen = pickerOpenProp ?? pickerOpenState;
  const setPickerOpen = onPickerOpenChange ?? setPickerOpenState;
  const [moreOpenState, setMoreOpenState] = useState(false);
  const moreOpen = moreOpenProp ?? moreOpenState;
  const setMoreOpen = onMoreOpenChange ?? setMoreOpenState;
  const { t } = useTranslation();
  const showFirst = useShowPinFirst();

  if (pinned.length === 0 && !isOwnProfile) return null;

  const remainingPins = pinned.filter(p => p.communities && p.community_id !== featuredId);
  // One pin shows; the rest wait behind More instead of stacking.
  const shownPin = featuredId ? null : remainingPins[0] ?? null;
  const morePins = shownPin ? remainingPins.slice(1) : remainingPins;
  const card = (pin: typeof pinned[number], action?: { label: string; onClick: () => void }) => {
    const community = pin.communities as Community;
    return (
      <PinnedCommunityCard
        key={pin.id}
        community={community}
        onClick={() => { setMoreOpen(false); navigate(`/app/communities/${community.slug}`); }}
        isOwnProfile={isOwnProfile}
        onManagePins={() => { setMoreOpen(false); setPickerOpen(true); }}
        action={action}
      />
    );
  };

  return (
    <div className={shownPin || pinned.length === 0 ? 'mt-3' : undefined}>
      {shownPin && card(shownPin, morePins.length > 0 ? { label: t('communities.pinnedMore'), onClick: () => setMoreOpen(true) } : undefined)}
      <Drawer open={moreOpen && morePins.length > 0} onOpenChange={setMoreOpen}>
        <DrawerContent column glass hideHandle>
          <div className="px-4 pt-4 pb-2">
            <DrawerHeader className="p-0">
              <DrawerTitle className="text-white font-medium text-sm">{t('comments.pinnedBadge')}</DrawerTitle>
            </DrawerHeader>
          </div>
          <div className="px-4 pb-6 space-y-2 max-h-[50vh] overflow-y-auto">
            {morePins.map(pin => card(pin, isOwnProfile ? {
              label: t('communities.showFirst'),
              onClick: () => {
                setMoreOpen(false);
                showFirst.mutate({ communityId: pin.community_id, orderedIds: pinned.map(p => p.community_id) });
              },
            } : undefined))}
          </div>
        </DrawerContent>
      </Drawer>
      {isOwnProfile && pinned.length === 0 && (
        <button
          onClick={() => setPickerOpen(true)}
          className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-dashed border-white/[0.1] hover:bg-white/[0.08] transition-colors text-xs text-zinc-500"
        >
          <Plus className="w-3 h-3" />
          {t('communities.pinCommunity')}
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

function PinnedCommunityCard({ community, onClick, isOwnProfile, onManagePins, action, className }: { community: Community; onClick: () => void; isOwnProfile?: boolean; onManagePins?: () => void; action?: { label: string; onClick: () => void }; className?: string }) {
  const { t } = useTranslation();

  return (
    <div className={className ? `relative ${className}` : 'relative'}>
      <button
        onClick={onClick}
        data-profile-art={community.banner_url ? '' : undefined}
        data-keep-dark={community.banner_url ? '' : undefined}
        className={`w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left relative overflow-hidden${action ? (isOwnProfile ? ' pr-44' : ' pr-32') : ''}`}
      >
        {community.banner_url && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${storageImage(community.banner_url, deviceWidth(360))})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.42,
              maskImage: 'linear-gradient(to right, transparent 30%, black 70%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 30%, black 70%)',
            }}
          />
        )}
        <div className="relative w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0">
          {community.avatar_url ? (
            <img src={storageImage(community.avatar_url, deviceWidth(48))} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <Users className="w-5 h-5 text-zinc-500" />
          )}
        </div>

        <div className="relative flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{community.name}</p>
          {community.description && (
            <p className="text-xs truncate mt-0.5 text-zinc-400">{community.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <Users className="w-3 h-3 text-zinc-500" />
            <span className="text-xs text-zinc-500">
              <span className="font-semibold text-zinc-300">{community.member_count.toLocaleString()}</span> {t('communities.membersLabel')}
            </span>
          </div>
        </div>
      </button>
      {action ? (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isOwnProfile && onManagePins && (
            <button
              type="button"
              onClick={onManagePins}
              aria-label={t('communities.pinToProfile')}
              className="w-8 h-8 rounded-[10px] bg-black/60 backdrop-blur-sm border border-white/[0.1] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            data-keep-dark
            onClick={action.onClick}
            className="h-8 whitespace-nowrap rounded-[10px] border border-white/20 bg-white/10 px-3 text-[13px] font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
          >
            {action.label}
          </button>
        </div>
      ) : isOwnProfile && onManagePins && (
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
  const { t } = useTranslation();

  const communities = userCommunities.map(m => m.communities).filter(Boolean);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass hideHandle>
        <div className="px-4 pt-4 pb-2">
          <DrawerHeader className="p-0">
            <DrawerTitle className="text-white font-medium text-sm">{t('communities.pinToProfile')}</DrawerTitle>
          </DrawerHeader>
        </div>
        <div className="px-4 pb-6 space-y-1 max-h-[50vh] overflow-y-auto">
          {communities.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4 text-center">{t('communities.joinFirst')}</p>
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
                      <img src={storageImage(c.avatar_url, deviceWidth(32))} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
