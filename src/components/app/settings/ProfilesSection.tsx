/**
 * Profiles — every DeHub account saved on this browser.
 * =====================================================
 * Rendered at the top of Settings → Profile. Each row switches to that
 * account; the "+" tile opens the sign-in sheet (wallet, email, phone,
 * Google, Apple) so a new profile can be added without signing out first.
 *
 * Switching and snapshotting live in @/lib/profiles; this component only
 * renders the list and reacts to its change event.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Users, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useSelfBadge } from '@/hooks/use-self-badge-balance';
import { buildAvatarUrl, deviceWidth } from '@/lib/media-url';
import {
  listProfiles,
  currentProfileId,
  profileAllowance,
  removeProfile,
  PROFILES_CHANGED_EVENT,
  type StoredProfile,
} from '@/lib/profiles';

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function profileLabel(profile: StoredProfile): string {
  return profile.name || profile.username || shortAddress(profile.address);
}

export function ProfilesSection() {
  const { t } = useTranslation();
  const { switchToProfile, openLoginModal } = useAuth();
  const { balance: liveBadgeBalance } = useSelfBadge();
  const [profiles, setProfiles] = useState<StoredProfile[]>(() => listProfiles());
  const [activeId, setActiveId] = useState<string | null>(() => currentProfileId());
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  // How many fit is a staking-badge allowance: two with no badge, one more per
  // tier (see lib/profile-limits.ts). Priced off the best tier saved on the
  // device, plus the live balance — someone who has just staked into a tier
  // should get the slot it buys without waiting for a snapshot.
  const allowance = useMemo(
    () => profileAllowance(profiles, liveBadgeBalance),
    [profiles, liveBadgeBalance],
  );
  const isFull = profiles.length >= allowance.maxProfiles;

  useEffect(() => {
    const sync = () => {
      setProfiles(listProfiles());
      setActiveId(currentProfileId());
    };
    window.addEventListener(PROFILES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PROFILES_CHANGED_EVENT, sync);
  }, []);

  const handleRemove = (id: string) => {
    // Forgetting a profile drops the stored session with it — the account is
    // untouched, it just has to be signed into again to come back.
    removeProfile(id);
    setProfiles(listProfiles());
  };

  const handleSwitch = async (id: string) => {
    if (id === activeId || switchingId) return;
    setSwitchingId(id);
    try {
      // Resolves only when no stored session could be restored (the sign-in
      // sheet opened instead); a successful switch reloads the page mid-await.
      await switchToProfile(id);
    } finally {
      setSwitchingId(null);
    }
  };

  if (profiles.length === 0 && !activeId) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Users className="w-5 h-5 text-zinc-400" />
        <h3 className="font-medium text-white">{t('settings.profiles', 'Profiles')}</h3>
        <p className="text-zinc-500 text-sm">{t('settings.profilesDesc', 'Accounts saved on this device')}</p>
      </div>
      {/* The allowance is stated whether or not it has been reached — finding
          out only at the moment you are refused is what makes a limit feel
          arbitrary. */}
      <p className="text-zinc-500 text-xs mb-4 pl-8">
        {t('settings.profilesUsed', '{{used}} of {{max}} used', {
          used: profiles.length,
          max: allowance.maxProfiles,
        })}
        {allowance.nextTierName && (
          <>
            {' · '}
            {t('settings.profilesNextTier', '{{tier}} tier keeps {{count}}', {
              tier: allowance.nextTierName,
              count: allowance.nextTierProfiles,
            })}
          </>
        )}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {profiles.map((profile) => {
          const isActive = profile.id === activeId;
          return (
            // The remove control is a sibling of the row button, not a child:
            // a button inside a button is invalid, and React strips it.
            <div key={profile.id} className="relative">
              <button
                onClick={() => handleSwitch(profile.id)}
                disabled={isActive || !!switchingId}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                  isActive
                    ? 'bg-zinc-800/60 border-white/10 cursor-default'
                    : 'bg-zinc-800 border-transparent hover:bg-zinc-700/60'
                }`}
              >
                <Avatar className="w-9 h-9">
                  <AvatarImage src={buildAvatarUrl(profile.address, profile.avatarPath, deviceWidth(36))} />
                  <AvatarFallback className="bg-zinc-700 text-white text-sm font-medium">
                    {profileLabel(profile)?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-white truncate">
                    {profileLabel(profile)}
                  </span>
                  <span className="block text-xs text-zinc-500 truncate">
                    {shortAddress(profile.address)}
                    {profile.session ? '' : ` · ${t('settings.profileSignedOut', 'sign in to switch')}`}
                  </span>
                </span>
                {isActive && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 shrink-0 pr-6">
                    <Check className="w-3.5 h-3.5" />
                    {t('settings.profileActive', 'Active')}
                  </span>
                )}
              </button>
              {/* Only on the ones you are not using. Dropping the account you
                  are signed in as is what "Log out" is for, and doing it from
                  here would leave the app running on a session the device has
                  just forgotten how to restore. */}
              {!isActive && (
                <button
                  type="button"
                  onClick={() => handleRemove(profile.id)}
                  disabled={!!switchingId}
                  aria-label={t('settings.profileRemove', 'Remove profile')}
                  title={t('settings.profileRemove', 'Remove profile')}
                  className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Full width under the grid rather than a cell inside it: it is the
          action for the whole section, not another account in the list. */}
      <button
        onClick={() => openLoginModal({ intent: 'add-profile' })}
        disabled={!!switchingId || isFull}
        title={
          isFull
            ? allowance.nextTierName
              ? t('settings.profilesFullTier', 'Stake for a {{tier}} badge to keep {{count}} profiles', {
                  tier: allowance.nextTierName,
                  count: allowance.nextTierProfiles,
                })
              : t('settings.profilesFull', 'Remove a profile to add a different account')
            : undefined
        }
        className="mt-2 w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-white/15 text-zinc-400 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:border-white/15 disabled:cursor-not-allowed"
      >
        <Plus className="w-4 h-4" />
        <span className="text-sm font-medium">{t('settings.addProfile', 'Add profile')}</span>
      </button>
    </div>
  );
}
