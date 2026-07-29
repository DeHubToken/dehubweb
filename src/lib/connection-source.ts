/**
 * Connection Source
 * =================
 * Which kind of wallet backs the current DeHub session: the built-in smart
 * wallet (email/social login — an encrypted seed that only ever decrypts into
 * memory, driving a Safe smart account via Pimlico) or an external one that
 * signs for itself (MetaMask, Phantom, Trust, via wagmi).
 *
 * The stored value for the built-in wallet is still the string 'web3auth'.
 * That name is historical: signing moved to @/lib/smart-wallet, and Web3Auth
 * survives only as the one-time migration path in @/lib/legacy-web3auth that
 * lets someone recover a pre-migration account — nothing on the posting path
 * touches it. The string stays anyway, because it is written into every
 * signed-in browser's localStorage and renaming it would read as "no tag at
 * all" to every existing session, stranding all of them at once in precisely
 * the way described below. The value stays; the vocabulary in here doesn't.
 *
 * This tag is load-bearing a long way from where it is written. The built-in
 * wallet's key is gone after every reload and every auto-lock, and since login
 * stopped unlocking the wallet on the way in it is absent for most of a normal
 * session too. So when something finally needs a signature there is no
 * provider to be found anywhere, and this tag is the only thing separating
 * "signed in, key is merely locked, ask for the password" from "nobody is
 * signed in here".
 *
 * Losing it is therefore not a cosmetic bug. A user in that state stays
 * logged in — feed, profile, display name, engagement all work, because those
 * ride the DeHub token rather than a signature — while every post, tip and
 * stream fails with "No wallet connected. Please sign in first." Retrying
 * cannot help, because nothing on the retry path rewrites the tag; only a full
 * sign-out and sign-in does. That is exactly what happened to a real account,
 * which is why the readers below no longer trust the tag on its own.
 */

export type ConnectionSource = 'web3auth' | 'wagmi';

const CONNECTION_SOURCE_KEY = 'dehub_connection_source';

/**
 * Written in exactly one place — applyAuthenticatedSession in AuthProvider,
 * which runs for both ways a built-in-wallet session can be established
 * (signing with the key, and exchanging a Supabase session) and for neither
 * external-wallet path. Cleared in exactly one place — clearAuthSession, which
 * drops it in the same breath as the DeHub token. Those two properties are
 * what make it usable as a fallback below: while a built-in-wallet session is
 * alive, this key is alive with it.
 */
const SUPABASE_UID_KEY = 'dehub_supabase_uid';

/** localStorage throws outright in some private-browsing modes. */
function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readConnectionSource(): ConnectionSource | null {
  const raw = readKey(CONNECTION_SOURCE_KEY);
  return raw === 'web3auth' || raw === 'wagmi' ? raw : null;
}

export function writeConnectionSource(source: ConnectionSource): void {
  try {
    localStorage.setItem(CONNECTION_SOURCE_KEY, source);
  } catch {
    /* private mode — the fallbacks below cover the read side */
  }
}

export function clearConnectionSource(): void {
  try {
    localStorage.removeItem(CONNECTION_SOURCE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Put back whatever was there before a connect attempt overwrote it.
 *
 * The login entry points tag the browser optimistically, before the connection
 * they are about to attempt has succeeded. When it then fails — a rejected
 * MetaMask prompt, an OTP that never sends — the old code deleted the tag
 * outright, which is only correct if the browser had no session to begin with.
 * A signed-in user who merely glanced at another wallet lost theirs.
 */
export function restoreConnectionSource(previous: ConnectionSource | null): void {
  if (previous) writeConnectionSource(previous);
  else clearConnectionSource();
}

/**
 * True when the signature this session would produce has to come from the
 * built-in wallet — i.e. when "there is no provider" means "locked, ask for
 * the password" rather than "signed out".
 *
 * An explicit tag always wins, including an explicit 'wagmi': an external
 * wallet that has gone away is a dropped connection, and prompting for a
 * wallet password nobody set would be worse than the error it replaced.
 * Only when the tag is missing entirely does the Supabase identity marker get
 * consulted, and its presence is decisive — see SUPABASE_UID_KEY above.
 */
export function isSmartWalletSession(): boolean {
  const source = readConnectionSource();
  if (source) return source === 'web3auth';
  return !!readKey(SUPABASE_UID_KEY);
}

/**
 * Rewrite a tag that went missing under a session that is still alive, so the
 * repair happens once at boot rather than being re-derived at each of the
 * dozen places that read the tag directly.
 *
 * Returns whatever the session is now tagged as, so the caller can sync it
 * into React state. Sessions with no marker either way are left alone: an
 * untagged external wallet is indistinguishable from no session at all, and
 * guessing 'web3auth' there would send someone who never set a wallet password
 * to a dialog demanding one.
 */
export function healConnectionSource(): ConnectionSource | null {
  const existing = readConnectionSource();
  if (existing) return existing;
  if (!readKey(SUPABASE_UID_KEY)) return null;
  writeConnectionSource('web3auth');
  return 'web3auth';
}
