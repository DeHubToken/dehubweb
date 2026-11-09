/**
 * A session handed to this tab by the magic link it asked for.
 *
 * Email sign-in sends a link that also works on another device: when it is
 * opened there, /auth/confirm broadcasts the new session back to the tab that
 * asked, over a channel named in the link. Anyone holding that link can send
 * on the channel too, so the tab only takes a session issued for the email it
 * asked a link for, and never signs into somebody else.
 */

/** The email a Supabase access token was issued for, lowercased; null when it names none. */
export function accessTokenEmail(accessToken: unknown): string | null {
  if (typeof accessToken !== 'string') return null;
  const part = accessToken.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    const email = claims?.email;
    return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * True when a broadcast session belongs to the email this tab sent a link to.
 * This reads the token without checking it; setSession checks it with the
 * server, and the caller compares the signed-in user's email again after.
 */
export function isSessionForEmail(accessToken: unknown, email: string | null | undefined): boolean {
  const wanted = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return !!wanted && accessTokenEmail(accessToken) === wanted;
}
