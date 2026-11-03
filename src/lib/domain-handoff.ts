// Marks, on dehub.io, a browser that holds something only it has: a login or
// the words of an unsecured wallet. When dehub.io starts forwarding to
// riftn.com, the edge sends marked browsers through dehub.io/_handoff-out
// (server/domain-handoff.js) so that state moves with them, and gives everyone
// else a plain 301.
import { supabase } from '@/integrations/supabase/client';
import { hasAnyDeviceSeed } from '@/lib/wallet-core/device-seed';

const OLD_HOSTS = new Set(['dehub.io', 'www.dehub.io']);
export const LOCAL_STATE_COOKIE = 'dh_local';

function hasStoredLogin(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) return true;
    }
  } catch {
    // Storage blocked: nothing here to carry.
  }
  return false;
}

export async function markLocalState(): Promise<void> {
  if (typeof document === 'undefined' || !OLD_HOSTS.has(location.hostname)) return;
  const has = hasStoredLogin() || (await hasAnyDeviceSeed());
  document.cookie = has
    ? `${LOCAL_STATE_COOKIE}=1; Max-Age=31536000; Path=/; Secure; SameSite=Lax`
    : `${LOCAL_STATE_COOKIE}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
}

/** Keeps the mark current through sign-ins and sign-outs in this tab. */
export function watchLocalState(): void {
  if (typeof document === 'undefined' || !OLD_HOSTS.has(location.hostname)) return;
  void markLocalState();
  supabase.auth.onAuthStateChange(() => {
    // After the client has written or cleared its storage entry.
    setTimeout(() => void markLocalState(), 0);
  });
}
