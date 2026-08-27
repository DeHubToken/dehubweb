// Deep links behind a referral code.
//
// `/r/<CODE>` is the invite landing. `/r/<CODE>/<path>` attributes the visit to
// <CODE> and then sends the visitor straight to `/<path>` — so one hyperlink can
// point at a specific docs section or app page and still earn the referrer their
// commission. `?to=/path` does the same for links that cannot carry a suffix.
//
// Everything here exists to keep that from becoming an open redirect: the
// destination is only ever an in-app path, never a host we don't control.

const DEEP_LINK_PARAM = "to";

/**
 * Reduce arbitrary user input to a safe same-origin path, or null.
 *
 * Accepts a bare path (`docs/getting-started`, `/app/stores`) or a full DeHub
 * URL, and rejects anything that would leave the origin: other hosts,
 * protocol-relative `//evil.com`, `javascript:`, and backslash variants that
 * some browsers normalise into `//`.
 */
export const sanitizeDeepLinkPath = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;

  // Full URL form — keep it only if it points at DeHub itself.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      if (!/(^|\.)dehub\.io$/i.test(url.hostname)) return null;
      value = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }

  value = value.replace(/\/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  // `//host` and `/\host` are origin-relative in name only.
  if (/^\/{2,}/.test(value)) return null;
  if (value === "/") return null;
  // A deep link that lands back on a referral landing would loop.
  if (/^\/r\//i.test(value)) return null;
  return value;
};

/** Read the destination from a `/r/:code/*` splat and/or a `?to=` query. */
export const resolveDeepLinkTarget = (splat: string | undefined, search: string): string | null => {
  const fromSplat = sanitizeDeepLinkPath(splat);
  if (fromSplat) return fromSplat;
  try {
    return sanitizeDeepLinkPath(new URLSearchParams(search).get(DEEP_LINK_PARAM));
  } catch {
    return null;
  }
};

/** Build the shareable `/r/<code><path>` URL for a destination. */
export const buildReferralDeepLink = (origin: string, code: string, rawPath: string): string => {
  const base = `${origin.replace(/\/+$/, "")}/r/${code}`;
  const path = sanitizeDeepLinkPath(rawPath);
  return path ? `${base}${path}` : base;
};
