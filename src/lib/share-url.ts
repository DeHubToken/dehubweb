// Share links that credit the sharer. App sets the code at sign-in (see
// useAffiliateShareUrl.ts), so handlers read it synchronously, inside the tap.

/** Append `ref=CODE`, keeping path, query and hash. Root-relative stays relative. */
export const withAffiliateRef = (url: string, code: string | null | undefined): string => {
  if (!code) return url;
  try {
    const relative = url.startsWith('/') && !url.startsWith('//');
    const u = relative ? new URL(url, 'https://dehub.io') : new URL(url);
    u.searchParams.set('ref', code);
    return relative ? u.pathname + u.search + u.hash : u.toString();
  } catch {
    return url;
  }
};

let viewerCode: string | null = null;
// Bumped on every clear, so a lookup that finishes after sign-out is dropped.
let epoch = 0;

/** The signed-in viewer's code, or null when signed out or they have none. */
export const setViewerAffiliateCode = (code: string | null) => {
  viewerCode = code;
  if (!code) epoch++;
};

export const viewerCodeEpoch = () => epoch;

const isDehub = (url: string) => {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const host = new URL(url).hostname;
    return host === 'dehub.io' || host.endsWith('.dehub.io') || host === window.location.hostname;
  } catch {
    return false;
  }
};

/** `url` with the viewer's `?ref=CODE`; unchanged without one or off DeHub. */
export const viewerShareUrl = (url: string): string =>
  viewerCode && isDehub(url) ? withAffiliateRef(url, viewerCode) : url;
