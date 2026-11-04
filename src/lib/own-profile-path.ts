/**
 * Your own profile lives at your username
 * =======================================
 * /profile and /app/profile still open your profile (the nav, old links and
 * the app all use them), but the address bar is swapped to /<your username>
 * so copying it gives the link everyone else uses.
 *
 * /<your username> is served by the same cached profile page as /profile, so
 * nothing reloads when the address changes. The handle is kept here, outside
 * React, because route matching (PersistentPageCache, AppLayout) is plain
 * functions over the pathname.
 */

const OWN_PROFILE_ALIASES = ['/profile', '/app/profile'];

let ownHandle: string | null = null;

const clean = (handle: string | null | undefined): string | null => {
  const h = (handle || '').trim().replace(/^@+/, '');
  // A wallet address is not a username: /0x… stays a normal profile route.
  if (!h || /^0x[a-fA-F0-9]{40}$/.test(h) || h.includes('/')) return null;
  return h;
};

export function setOwnProfileHandle(handle: string | null | undefined): void {
  ownHandle = clean(handle);
}

export function getOwnProfileHandle(): string | null {
  return ownHandle;
}

const normalize = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/** /profile or /app/profile: the old addresses of your own profile. */
export function isOwnProfileAlias(pathname: string): boolean {
  return OWN_PROFILE_ALIASES.includes(normalize(pathname));
}

/** Is this /<your username>? Case-insensitive, like usernames. */
export function isOwnHandlePath(pathname: string): boolean {
  if (!ownHandle) return false;
  const path = normalize(pathname);
  return path.length > 1 && path.slice(1).toLowerCase() === ownHandle.toLowerCase();
}

/** Any address that shows your own profile. */
export function isOwnProfilePath(pathname: string): boolean {
  return isOwnProfileAlias(pathname) || isOwnHandlePath(pathname);
}

/** True when a route's :username param is you. */
export function isOwnHandle(username: string | null | undefined): boolean {
  const h = clean(username);
  return !!h && !!ownHandle && h.toLowerCase() === ownHandle.toLowerCase();
}
