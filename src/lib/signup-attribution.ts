/**
 * Write this browser's first touch (src/lib/first-touch.ts) for `address` to
 * `signup_attribution`, once. The table keeps one row per wallet, so a second
 * browser or a retry after a lost response lands on the unique key and is
 * treated as done. App reaches this through a dynamic import, which keeps
 * Supabase and the wallet session helpers off the boot path.
 */

import { supabase } from '@/integrations/supabase/client';
import { getAffiliateRef } from '@/lib/affiliateRef';
import { getFirstTouch } from '@/lib/first-touch';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { ensureWalletSession } from '@/lib/wallet-session';

const SENT_KEY = 'dehub_signup_attribution_sent';

export async function persistSignupAttribution(address: string, isNewAccount: boolean): Promise<void> {
  const addr = address.toLowerCase();
  try {
    if (window.localStorage.getItem(SENT_KEY)?.split(',').includes(addr)) return;
  } catch { /* fall through; the unique key still stops a duplicate */ }

  if (!await ensureWalletSession(addr)) return;

  const touch = getFirstTouch();
  const { error } = await withWalletHeader(
    supabase.from('signup_attribution' as never).insert({
      wallet_address: addr,
      utm_source: touch?.utm_source ?? null,
      utm_medium: touch?.utm_medium ?? null,
      utm_campaign: touch?.utm_campaign ?? null,
      utm_content: touch?.utm_content ?? null,
      utm_term: touch?.utm_term ?? null,
      referrer_host: touch?.referrer_host ?? null,
      landing_path: touch?.landing_path ?? null,
      ref_code: getAffiliateRef(),
      first_seen_at: touch?.at ?? null,
      is_new_account: isNewAccount,
    } as never),
    addr,
  ) as unknown as { error: { code?: string } | null };
  // 23505: this wallet already has its row.
  if (error && error.code !== '23505') return;

  try {
    const sent = window.localStorage.getItem(SENT_KEY)?.split(',') ?? [];
    window.localStorage.setItem(SENT_KEY, [...sent, addr].slice(-20).join(','));
  } catch { /* the unique key covers a resend */ }
}
