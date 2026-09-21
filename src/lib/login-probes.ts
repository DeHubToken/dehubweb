/**
 * The two questions the login sheet has to answer before it can draw its list
 * of options: can this browser do a passkey, and is a Telegram bot configured.
 *
 * Both used to be asked from inside the sheet, each with its own effect and
 * its own `false` starting value — so the sheet painted its options, then the
 * fingerprint row appeared, then the Telegram row appeared under it, pushing
 * everything below them down twice. That is the stutter: not slow code, just
 * three paints where there should be one.
 *
 * Asked here instead, once per tab, cached, and warmable from the hover that
 * precedes the click — so by the time the sheet opens the answers are usually
 * already in hand and the whole list arrives in a single commit.
 */

import { isPasskeyLoginAvailable } from '@/lib/passkey-login';
import { fetchTelegramLoginConfig } from '@/lib/telegram-login';

export interface LoginProbes {
  /** This device can sign in with a fingerprint / face / device PIN. */
  passkey: boolean;
  /** A Telegram bot is configured on the edge function. */
  telegram: boolean;
}

const NONE: LoginProbes = { passkey: false, telegram: false };

let snapshot: LoginProbes | null = null;
let pending: Promise<LoginProbes> | null = null;

/** The answers, if they are already known. Null means "not asked yet". */
export function loginProbesSnapshot(): LoginProbes | null {
  return snapshot;
}

/**
 * Ask both, together. Cached for the life of the tab, failures included: a
 * sheet opened repeatedly on a bad network must not re-ask every time.
 */
export function resolveLoginProbes(): Promise<LoginProbes> {
  if (snapshot) return Promise.resolve(snapshot);
  if (pending) return pending;
  pending = Promise.all([
    isPasskeyLoginAvailable().catch(() => false),
    fetchTelegramLoginConfig().then(config => config.enabled).catch(() => false),
  ]).then(([passkey, telegram]) => {
    snapshot = { passkey, telegram };
    return snapshot;
  }).catch(() => NONE);
  return pending;
}

/** Fire-and-forget, for a login entry point's hover. Idempotent. */
export function warmLoginProbes(): void {
  void resolveLoginProbes().catch(() => {});
}
