import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { hasNoAvatar, isAvatarPromptDue, recordAvatarPromptShown } from '@/lib/avatar-prompt';

const AvatarPromptSheet = lazy(() => import('./AvatarPromptSheet'));

/** Time on a feed before the ask, so it never lands on top of the first paint. */
const DWELL_MS = 4_000;

/** Only on the feeds, never over a post, a live, the composer or Settings. */
function isPromptPage(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/' || path === '/app' || path === '/app/explore';
}

// One ask per app open, whatever remounts.
let askedThisOpen = false;

/**
 * Renders nothing until a signed-in account with no profile picture has sat on
 * a feed for a few seconds, then offers the "Add a profile photo" sheet. The
 * schedule (once per open, skipped on the sign-up open, three times at most,
 * three days apart) lives in lib/avatar-prompt. Mounted at the App root next to
 * <NotificationsPromptToast />.
 */
export function AvatarPrompt() {
  const { user, isAuthenticated, requiresUsername, walletPhase, refreshUser, patchUser } = useAuth();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Stays mounted after closing so the sheet can animate out.
  const [shown, setShown] = useState(false);

  const address = user?.address ?? null;
  const eligible = isAuthenticated && !!address && !!user?.username && !requiresUsername
    && walletPhase === 'none' && hasNoAvatar(user) && isPromptPage(pathname);

  useEffect(() => {
    if (!eligible || askedThisOpen || !address) return;
    if (!isAvatarPromptDue(address)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled || askedThisOpen || document.hidden) return;
      // Something else is up (login, a sheet, a viewer): wait for the next open.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      // The cached account can be older than a photo added on another device.
      try {
        // Loaded here, not at the top: this file sits in the entry bundle.
        const { getAccountInfo } = await import('@/lib/api/dehub');
        const fresh = await getAccountInfo(address);
        if (cancelled || !hasNoAvatar(fresh)) return;
      } catch {
        return;
      }
      askedThisOpen = true;
      recordAvatarPromptShown(address);
      setShown(true);
      setOpen(true);
    }, DWELL_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [eligible, address]);

  const save = async (file: File, preview: string) => {
    const [{ updateProfile }, { bumpProfileImageVersion }] = await Promise.all([
      import('@/lib/api/dehub'),
      import('@/lib/media-url'),
    ]);
    await updateProfile({ avatarImg: file });
    if (address) bumpProfileImageVersion(address);
    await refreshUser();
    // The CDN copy can trail the upload; the local preview stands in meanwhile.
    patchUser({ avatarImageUrl: preview });
    void queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
    void queryClient.invalidateQueries({ queryKey: ['profile-avatar'] });
    toast.success(i18n.t('avatarPrompt.saved', 'Looking good'));
  };

  if (!shown || !user) return null;
  return (
    <Suspense fallback={null}>
      <AvatarPromptSheet
        open={open}
        onOpenChange={setOpen}
        name={user.displayName || user.username || ''}
        onSave={save}
      />
    </Suspense>
  );
}
