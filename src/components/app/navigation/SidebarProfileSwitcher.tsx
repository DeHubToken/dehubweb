/**
 * The accounts saved on this browser, in the sidebar.
 * ==================================================
 * Settings → Profile used to be the only place a second account could be
 * reached, which made multi-account something you had to know about rather
 * than something you could see. Now that every login preserves the account it
 * displaces (lib/profiles → preserveOutgoingProfile), the list fills up on its
 * own, so it needs to be somewhere people actually look.
 *
 * Lazily imported by AppSidebar on purpose: @/lib/profiles reaches the wallet
 * vault, and AppSidebar is in the eager graph — a static import would drag the
 * wallet stack into the entry bundle and fail scripts/check-entry-bundle.mjs.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl, deviceWidth } from '@/lib/media-url';
import {
  listProfiles,
  currentProfileId,
  canAddProfile,
  PROFILES_CHANGED_EVENT,
  type StoredProfile,
} from '@/lib/profiles';

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function label(profile: StoredProfile): string {
  return profile.name || profile.username || shortAddress(profile.address);
}

export function SidebarProfileSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { switchToProfile, openLoginModal } = useAuth();
  const [profiles, setProfiles] = useState<StoredProfile[]>(() => listProfiles());
  const [activeId, setActiveId] = useState<string | null>(() => currentProfileId());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => {
      setProfiles(listProfiles());
      setActiveId(currentProfileId());
    };
    window.addEventListener(PROFILES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PROFILES_CHANGED_EVENT, sync);
  }, []);

  const others = profiles.filter((p) => p.id !== activeId);
  // One account is not a switcher. The Add control still belongs in Settings
  // for that case — here it would just be a second Log out.
  if (others.length === 0) return null;

  const handleSwitch = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      onNavigate?.();
      // Resolves only when no stored session could be restored (the sign-in
      // sheet opened instead); a successful switch reloads mid-await.
      await switchToProfile(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <p className="px-3 text-[11px] uppercase tracking-wide text-zinc-500">
        {t('sidebar.switchAccount', 'Switch account')}
      </p>
      {others.map((profile) => (
        <button
          key={profile.id}
          onClick={() => handleSwitch(profile.id)}
          disabled={busy}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm text-zinc-300 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          <Avatar className="w-7 h-7 flex-shrink-0">
            <AvatarImage src={buildAvatarUrl(profile.address, profile.avatarPath, deviceWidth(28))} />
            <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
              {label(profile)?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate">{label(profile)}</span>
          {/* A row with no stored session still switches — it opens the
              sign-in sheet on that account instead of restoring silently — so
              say which kind it is before the tap, not after. */}
          {!profile.session && (
            <span className="text-[11px] text-zinc-500 flex-shrink-0">
              {t('settings.profileSignedOut', 'sign in to switch')}
            </span>
          )}
        </button>
      ))}
      {canAddProfile(profiles) && (
        <button
          onClick={() => { onNavigate?.(); openLoginModal({ intent: 'add-profile' }); }}
          disabled={busy}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          <span className="w-7 h-7 flex items-center justify-center rounded-full border border-dashed border-white/20 flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </span>
          <span className="truncate">{t('settings.addProfile', 'Add profile')}</span>
        </button>
      )}
      {activeId && (
        <p className="px-3 pt-1 text-[11px] text-zinc-600 flex items-center gap-1">
          <Check className="w-3 h-3" />
          {t('sidebar.signedInAs', 'Signed in as {{name}}', {
            name: profiles.find((p) => p.id === activeId)
              ? label(profiles.find((p) => p.id === activeId)!)
              : shortAddress(activeId.replace('addr:', '')),
          })}
        </p>
      )}
    </div>
  );
}
