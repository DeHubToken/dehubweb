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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl, deviceWidth } from '@/lib/media-url';
import {
  listProfiles,
  currentProfileId,
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
  const [profiles, setProfiles] = useState<StoredProfile[]>(() => listProfiles());
  const [activeId, setActiveId] = useState<string | null>(() => currentProfileId());
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setProfiles(listProfiles());
      setActiveId(currentProfileId());
    };
    window.addEventListener(PROFILES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PROFILES_CHANGED_EVENT, sync);
  }, []);

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
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Users className="w-5 h-5 text-zinc-400" />
        <h3 className="font-medium text-white">{t('settings.profiles', 'Profiles')}</h3>
        <p className="text-zinc-500 text-sm">{t('settings.profilesDesc', 'Accounts saved on this device')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {profiles.map((profile) => {
          const isActive = profile.id === activeId;
          return (
            <button
              key={profile.id}
              onClick={() => handleSwitch(profile.id)}
              disabled={isActive || !!switchingId}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                isActive
                  ? 'bg-zinc-800/60 border-white/10 cursor-default'
                  : 'bg-zinc-800 border-transparent hover:bg-zinc-750'
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
                <span className="flex items-center gap-1 text-xs text-emerald-400 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                  {t('settings.profileActive', 'Active')}
                </span>
              )}
            </button>
          );
        })}

        <button
          onClick={() => openLoginModal({ intent: 'add-profile' })}
          disabled={!!switchingId}
          className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-white/15 text-zinc-400 hover:text-white hover:border-white/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">{t('settings.addProfile', 'Add profile')}</span>
        </button>
      </div>
    </div>
  );
}
