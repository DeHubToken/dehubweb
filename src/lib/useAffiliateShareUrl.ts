import { useEffect, useState } from "react";
import { getOrCreateAffiliateCode } from "@/lib/affiliate";
import { getPersistedViewerAddress } from "@/lib/affiliateRef";

/** Append `ref=CODE` to a URL, keeping its path, query and hash intact. */
export const withAffiliateRef = (url: string, code: string | null | undefined): string => {
  if (!code) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("ref", code);
    return u.toString();
  } catch {
    return url;
  }
};

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
