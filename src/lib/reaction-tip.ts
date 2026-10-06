/** One reaction hint per account, shared with the native app. */
import { toast } from 'sonner';
import i18n from '@/i18n';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

const LEGACY_KEY = 'dehub:reaction-tip-seen';
const seen = new Set<string>();
const attempted = new Set<string>();
const claims = new Map<string, Promise<boolean>>();
const keyFor = (wallet: string) => `${LEGACY_KEY}:${wallet}`;

function storedSeen(wallet: string): boolean {
  try {
    return localStorage.getItem(keyFor(wallet)) === '1' || localStorage.getItem(LEGACY_KEY) === '1';
  } catch { return false; }
}

function remember(wallet: string): void {
  seen.add(wallet);
  try {
    localStorage.setItem(keyFor(wallet), '1');
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* the session guard still prevents repeats */ }
}

function claim(wallet: string): Promise<boolean> {
  let pending = claims.get(wallet);
  if (!pending) {
    pending = (async () => {
      try {
        const { data, error } = await withWalletHeader(supabase.rpc('claim_reaction_tip' as never), wallet);
        // An unavailable server cannot establish that this person needs a hint.
        return !error && data === true;
      } catch { return false; }
    })();
    claims.set(wallet, pending);
  }
  return pending;
}

export function markReactionTipSeen(walletAddress?: string | null): void {
  const wallet = walletAddress?.toLowerCase();
  if (!wallet) {
    try { localStorage.setItem(LEGACY_KEY, '1'); } catch { /* storage blocked */ }
    return;
  }
  remember(wallet);
  void claim(wallet);
}

export async function maybeShowReactionTip(walletAddress?: string | null): Promise<void> {
  const wallet = walletAddress?.toLowerCase();
  if (!wallet) return;
  if (seen.has(wallet) || storedSeen(wallet)) {
    markReactionTipSeen(wallet);
    return;
  }
  if (attempted.has(wallet)) return;
  attempted.add(wallet);
  const first = await claim(wallet);
  // Opening any picker while this request was pending also teaches the gesture.
  if (seen.has(wallet)) return;
  remember(wallet);
  if (first) toast.info(i18n.t('toasts.reactionTip'), { duration: 5000 });
}
