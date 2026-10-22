import { useEffect, useState } from "react";
import { findAffiliateCode, getOrCreateAffiliateCode } from "@/lib/affiliate";
import { getPersistedViewerAddress } from "@/lib/affiliateRef";

/**
 * Append `ref=CODE` to a URL, keeping its path, query and hash intact. A
 * root-relative path (`/app/post/1`) stays relative.
 */
export const withAffiliateRef = (url: string, code: string | null | undefined): string => {
  if (!code) return url;
  try {
    const relative = url.startsWith("/") && !url.startsWith("//");
    const u = relative ? new URL(url, "https://dehub.io") : new URL(url);
    u.searchParams.set("ref", code);
    return relative ? u.pathname + u.search + u.hash : u.toString();
  } catch {
    return url;
  }
};

// The signed-in viewer's code, looked up once per address and shared by every
// share action. Share handlers read it synchronously, so the clipboard write
// or the OS share sheet still runs inside the tap that asked for it.
let viewerCode: { address: string; code: string | null } | null = null;
let pending: { address: string; promise: Promise<string | null> } | null = null;

/**
 * Look up (never create) the affiliate code for `address`, defaulting to the
 * signed-in viewer. App warms this at sign-in so the first share has it.
 */
export function loadViewerAffiliateCode(address = getPersistedViewerAddress()): Promise<string | null> {
  if (!address) return Promise.resolve(null);
  const addr = address.toLowerCase();
  if (viewerCode?.address === addr) return Promise.resolve(viewerCode.code);
  if (pending?.address === addr) return pending.promise;
  const promise: Promise<string | null> = findAffiliateCode(addr)
    .then((row) => {
      viewerCode = { address: addr, code: row?.code ?? null };
      return viewerCode.code;
    })
    .catch(() => null)
    .finally(() => { if (pending?.promise === promise) pending = null; });
  pending = { address: addr, promise };
  return promise;
}

const isDehubUrl = (url: string): boolean => {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const host = new URL(url).hostname;
    return host === "dehub.io" || host.endsWith(".dehub.io") || host === window.location.hostname;
  } catch {
    return false;
  }
};

/**
 * `url` carrying the signed-in viewer's `?ref=CODE`, so whoever opens the link
 * and signs up is credited to the person who shared it. Unchanged for a
 * signed-out viewer, a viewer with no code, or a link off DeHub.
 */
export function viewerShareUrl(url: string): string {
  const address = getPersistedViewerAddress();
  if (!address || !isDehubUrl(url)) return url;
  if (viewerCode?.address !== address) {
    void loadViewerAffiliateCode(address);
    return url;
  }
  return withAffiliateRef(url, viewerCode.code);
}

/**
 * The signed-in viewer's affiliate version of `url` (`?ref=CODE`), or `url`
 * unchanged when nobody is signed in. The path stays the same, so link
 * previews still unfurl from the page's own OG tags, and App captures
 * `?ref=` on landing exactly like a /r/CODE visit.
 */
export function useAffiliateShareUrl(url: string): string {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const address = getPersistedViewerAddress();
    if (!address) return;
    let cancelled = false;
    getOrCreateAffiliateCode(address)
      .then((row) => {
        if (!row?.code) return;
        viewerCode = { address, code: row.code };
        if (!cancelled) setCode(row.code);
      })
      .catch(() => { /* fall back to the plain link */ });
    return () => { cancelled = true; };
  }, []);

  return withAffiliateRef(url, code);
}
