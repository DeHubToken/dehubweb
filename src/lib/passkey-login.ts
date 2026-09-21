/**
 * Passkey-only sign-in — the client half.
 *
 * The passkey is the whole account. There is no email, phone or OAuth
 * identity behind it: the `passkey-auth` edge function verifies the WebAuthn
 * response against the credential's stored public key and hands back a real
 * Supabase session, exactly as `telegram-auth` and `verify-phone-otp` do for
 * theirs. From `setSession` onwards nothing about the login is special.
 *
 * Sign-up asks for PRF in the same prompt, and the resulting key material is
 * parked here for the wallet-create step to pick up, so the wallet gets
 * wrapped under the very passkey that just signed the user in — one
 * fingerprint, not two.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  assertIdentityPasskey,
  describeThisDevice,
  isBiometricUnlockAvailable,
  registerIdentityPasskey,
  type CreationOptionsJSON,
  type PasskeyEnrollment,
  type RequestOptionsJSON,
} from '@/lib/wallet-core/passkey';

export { PasskeyCancelledError, PasskeyUnsupportedError } from '@/lib/wallet-core/passkey';

export interface PasskeySession {
  access_token: string;
  refresh_token: string;
}

/** A server-side refusal with a machine-readable reason. */
export class PasskeyLoginError extends Error {
  code: string | null;
  constructor(message: string, code?: string | null) {
    super(message);
    this.name = 'PasskeyLoginError';
    this.code = code ?? null;
  }
}

/** Can this browser offer the fingerprint button at all? */
export function isPasskeyLoginAvailable(): Promise<boolean> {
  return isBiometricUnlockAvailable();
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('passkey-auth', { body });
  if (error) throw new PasskeyLoginError(error.message || 'Passkey sign-in failed. Please try again.');
  if (data?.error) throw new PasskeyLoginError(String(data.error), data.code ? String(data.code) : null);
  return data as T;
}

// ── Pending wallet enrolment ────────────────────────────────────────────────
// Memory only, never persisted: it holds raw PRF key material. WalletCreateStep
// takes it once; anything left over is zeroed on the next sign-in attempt.

let pendingEnrollment: PasskeyEnrollment | null = null;

function dropPendingEnrollment(): void {
  if (pendingEnrollment) pendingEnrollment.keyMaterial.fill(0);
  pendingEnrollment = null;
}

/**
 * The PRF enrolment from the sign-up that just happened, if any, handed over
 * exactly once. The wallet-create step wraps the new seed under it instead of
 * asking the authenticator for a second passkey.
 */
export function takePendingPasskeyEnrollment(): PasskeyEnrollment | null {
  const e = pendingEnrollment;
  pendingEnrollment = null;
  return e;
}

// ── Flows ───────────────────────────────────────────────────────────────────

export interface PasskeySignUpResult {
  session: PasskeySession;
  userId: string;
  isNew: boolean;
}

/**
 * Create a new account from a fresh passkey.
 *
 * With `attach` and a live Supabase session (Settings → add fingerprint
 * sign-in to this account) the function attaches the credential to that
 * account instead of creating a user; the caller's JWT rides along via
 * `functions.invoke`. The login sheet never passes it: a sign-up from
 * "Add a profile" must be a new account.
 */
export async function signUpWithPasskey(opts: { attach?: boolean } = {}): Promise<PasskeySignUpResult> {
  dropPendingEnrollment();
  const deviceLabel = describeThisDevice();
  const { options } = await call<{ options: CreationOptionsJSON }>({
    action: 'register-options',
    deviceLabel,
    attach: opts.attach === true,
  });
  const registration = await registerIdentityPasskey(options);
  try {
    const result = await call<PasskeySignUpResult>({
      action: 'register-verify',
      response: registration.response,
      deviceLabel,
    });
    pendingEnrollment = registration.enrollment;
    return result;
  } catch (err) {
    registration.enrollment?.keyMaterial.fill(0);
    throw err;
  }
}

export interface PasskeySignInResult {
  session: PasskeySession;
  userId: string;
}

/**
 * Sign in with an existing DeHub passkey. Throws `PasskeyLoginError` with
 * code `UNKNOWN_CREDENTIAL` when the chosen passkey has no account, which
 * the sheet turns into an offer to create one.
 */
export async function signInWithPasskey(): Promise<PasskeySignInResult> {
  dropPendingEnrollment();
  const { options } = await call<{ options: RequestOptionsJSON }>({ action: 'login-options' });
  const assertion = await assertIdentityPasskey(options);
  return call<PasskeySignInResult>({ action: 'login-verify', response: assertion.response });
}
