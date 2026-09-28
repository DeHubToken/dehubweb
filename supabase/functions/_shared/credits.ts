/**
 * Dollar-denominated credit balance held by the main backend.
 * Debit and refund are keyed, so retries are safe.
 */

function creditsConfig(): { base: string; secret: string } | null {
  const secret = Deno.env.get('INTERNAL_SERVICE_SECRET');
  if (!secret) return null;
  return { base: Deno.env.get('DEHUB_API_URL') ?? 'https://api.dehub.io', secret };
}

export type DebitOutcome = 'debited' | 'short' | 'error';

export async function debitCredits(address: string, usdMicros: number, key: string): Promise<DebitOutcome> {
  const cfg = creditsConfig();
  if (!cfg) { console.error('[credits] INTERNAL_SERVICE_SECRET missing'); return 'error'; }
  try {
    const res = await fetch(`${cfg.base}/api/internal/credits/debit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': cfg.secret },
      body: JSON.stringify({ address: address.toLowerCase(), usdMicros, key, purpose: 'ai' }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 200) {
      const body = await res.json().catch(() => ({}));
      if (body?.debited === true) return 'debited';
      console.error('[credits] debit 200 without debited flag', key);
      return 'error';
    }
    if (res.status === 402) return 'short';
    console.error(`[credits] debit HTTP ${res.status}`, key);
    return 'error';
  } catch (error) {
    console.error('[credits] debit failed', key, String(error));
    return 'error';
  }
}

/** True when the backend holds no live debit for the key any more. */
export async function refundCredits(key: string): Promise<boolean> {
  const cfg = creditsConfig();
  if (!cfg) { console.error('[credits] INTERNAL_SERVICE_SECRET missing'); return false; }
  try {
    const res = await fetch(`${cfg.base}/api/internal/credits/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': cfg.secret },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(15000),
    });
    // 404: no debit under this key, so nothing was ever taken.
    if (res.status === 200 || res.status === 404) return true;
    console.error(`[credits] refund HTTP ${res.status}`, key);
    return false;
  } catch (error) {
    console.error('[credits] refund failed', key, String(error));
    return false;
  }
}
