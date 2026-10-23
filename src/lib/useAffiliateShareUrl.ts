import { useEffect, useState } from "react";
import { findAffiliateCode, getOrCreateAffiliateCode } from "@/lib/affiliate";
import { getPersistedViewerAddress } from "@/lib/affiliateRef";
import { setViewerAffiliateCode, viewerCodeEpoch, withAffiliateRef } from "@/lib/share-url";

export { withAffiliateRef, viewerShareUrl } from "@/lib/share-url";

let loaded: { address: string; promise: Promise<string | null> } | null = null;

/**
 * Look up (never create) the signed-in viewer's affiliate code and hand it to
 * viewerShareUrl. App calls this at sign-in through a dynamic import, so the
 * lookup and the affiliate module stay off the boot path.
 */
export function loadViewerAffiliateCode(address: string | null): Promise<string | null> {
  if (!address) {
    loaded = null;
    setViewerAffiliateCode(null);
    return Promise.resolve(null);
  }
  const addr = address.toLowerCase();
  // Signing out clears the code in share-url directly; signing back in as
  // the same wallet re-applies the cached lookup.
  if (loaded?.address === addr) {
    const at = viewerCodeEpoch();
    return loaded.promise.then((code) => {
      if (loaded?.address === addr && viewerCodeEpoch() === at) setViewerAffiliateCode(code);
      return code;
    });
  }
  setViewerAffiliateCode(null);
  const at = viewerCodeEpoch();
  const promise = findAffiliateCode(addr)
    .then((row) => {
      if (loaded?.address === addr && viewerCodeEpoch() === at) setViewerAffiliateCode(row?.code ?? null);
      return row?.code ?? null;
    })
    .catch(() => {
      if (loaded?.address === addr) loaded = null;
      return null;
    });
  loaded = { address: addr, promise };
  return promise;
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
      .then((row) => { if (!cancelled && row?.code) setCode(row.code); })
      .catch(() => { /* fall back to the plain link */ });
    return () => { cancelled = true; };
  }, []);

  return withAffiliateRef(url, code);
}
