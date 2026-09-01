/**
 * The accounts this browser has already signed in as, offered at the top of
 * the login sheet.
 *
 * Someone with several wallets has, until now, had to re-derive which of them
 * DeHub knows about by connecting one and reading the result — and connecting
 * the wrong one is what produces every variant of "it asked the wrong wallet
 * to sign". Their accounts are already on the device, each with its own stored
 * session (lib/profiles), so the fastest and least error-prone way back in is
 * to name them: one tap, no wallet, no signature, no chance of picking wrong.
 *
 * Only rows with a stored session appear. A profile without one restores
 * nothing and would just reopen this same sheet, which is a worse version of
 * the buttons already below it.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl, deviceWidth } from '@/lib/media-url';
import {
  listProfiles,
  currentProfileId,
  PROFILES_CHANGED_EVENT,
  type StoredProfile,
} from '@/lib/profiles';

/** Keeps the sheet a sheet — the login options must stay above the fold. */
const MAX_ROWS = 3;

const shortAddress = (address: string) =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

const label = (profile: StoredProfile) =>
  profile.name || profile.username || shortAddress(profile.address);

interface LoginSavedProfilesProps {
  disabled?: boolean;
  onSwitch: (id: string) => void;
}

export function LoginSavedProfiles({ disabled, onSwitch }: LoginSavedProfilesProps) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<StoredProfile[]>(() => listProfiles());

  useEffect(() => {
    const sync = () => setProfiles(listProfiles());
    window.addEventListener(PROFILES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PROFILES_CHANGED_EVENT, sync);
  }, []);

  const activeId = currentProfileId();
  const restorable = profiles
    .filter(profile => profile.session && profile.id !== activeId)
    .slice(0, MAX_ROWS);

  if (restorable.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-white/40 text-[11px] uppercase tracking-wide px-1">
        {t('loginModal.continueAs', 'Continue as')}
      </p>
      {restorable.map(profile => (
        <button
          key={profile.id}
          type="button"
          onClick={() => onSwitch(profile.id)}
          disabled={disabled}
          className="w-full h-12 px-4 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl flex items-center gap-3 text-left transition-colors disabled:opacity-50"
        >
          <Avatar className="w-7 h-7 flex-shrink-0">
            <AvatarImage src={buildAvatarUrl(profile.address, profile.avatarPath, deviceWidth(28))} />
            <AvatarFallback className="bg-white/10 text-white text-xs font-medium">
              {label(profile)?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block text-white text-sm truncate">{label(profile)}</span>
            <span className="block text-white/40 text-[11px] truncate">
              {shortAddress(profile.address)}
            </span>
          </span>
        </button>
      ))}
      {/* Its own hairline rather than the shell's "or" divider — the rows above
          are a shortcut, not a third way of logging in, and repeating "or"
          would give them equal billing with the real options. */}
      <div className="pt-2">
        <div className="h-px bg-white/10" />
      </div>
    </div>
  );
}

export default LoginSavedProfiles;
