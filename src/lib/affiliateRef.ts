// DeHub affiliate referral attribution.
//
// First-touch wins: once a visitor lands with `?ref=CODE` (or hits /r/CODE),
// we set a cookie for 90 days and never overwrite it on subsequent visits.
// Once the user signs in with a wallet we self-attribute via `affiliate_referrals`.

import { readLastSession } from "@/lib/connection-source";

const COOKIE_NAME = "dehub_aff_ref";
const COOKIE_DAYS = 90;
const VALID = /^[A-Za-z0-9_-]{3,40}$/;

const setCookie = (value: string) => {
  try {
    const expires = new Date(Date.now() + COOKIE_DAYS * 86400_000).toUTCString();
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
};

const readCookie = (): string | null => {
  try {
    const match = document.cookie.split("; ").find((row) => row.startsWith(`${COOKIE_NAME}=`));
    if (!match) return null;
    const val = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
    return VALID.test(val) ? val : null;
  } catch { return null; }
};

const VISITOR_KEY = "dehub-affiliate-visitor";

/**
 * A stable-but-anonymous id for this browser, so repeat visits collapse into one
 * unique visitor. Random per browser, never derived from anything about the
 * person, and never leaves localStorage except as this opaque value.
 */
const getVisitorId = (): string => {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const fresh = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(VISITOR_KEY, fresh);
  return fresh;
};

const WALLET_KEY = "dehub_wallet";

/**
 * The wallet this browser is signed in with, read straight from storage.
 *
 * The /r/CODE landing page mounts outside the auth providers, so it has no
 * session to ask. AuthProvider persists the signed-in address under
 * `dehub_wallet` (and the last completed login under `dehub_last_session`)
 * and clears both on sign-out, so a value here means the person on this
 * browser is logged in as that address. That is exactly what the page-view
 * RPC needs to drop an affiliate's own test visit from their analytics.
 */
export const getPersistedViewerAddress = (): string | null => {
  try {
    const stored = window.localStorage.getItem(WALLET_KEY)?.trim();
    if (stored) return stored.toLowerCase();
    return readLastSession()?.address ?? null;
  } catch { return null; }
};

/**
 * Record one arrival on an affiliate link.
 *
 * Called for BOTH link shapes. /r/CODE has always recorded; `?ref=CODE` never
 * did, so an affiliate sharing a deep link saw zero traffic no matter how it
 * performed, and could not tell a dead campaign from an unconverted one.
 *
 * Uniqueness comes from visitor_id, so the same browser collapses into one
 * unique visitor across however many arrivals it makes.
 *
 * Supabase is imported dynamically on purpose: this module is reached from
 * App.tsx at boot, and a static import would drag the client onto the boot
 * path.
 */
export const recordAffiliateClick = (code: string, viewerAddress?: string | null) => {
  try {
    const visitorId = getVisitorId();
    let source: string | null = null;
    if (document.referrer) {
      try { source = new URL(document.referrer).hostname; } catch { /* malformed referrer */ }
    }
    void import("@/integrations/supabase/client").then(({ supabase }) =>
      // @ts-ignore - RPC introduced by the affiliate customization migration
      Promise.resolve(supabase.rpc("record_affiliate_page_view" as never, {
        p_code: code,
        p_visitor_id: visitorId,
        p_source: source,
        p_viewer_address: viewerAddress?.toLowerCase() || null,
      } as never)),
    ).catch(() => { /* analytics must never block a landing */ });
  } catch { /* analytics must never block a landing */ }
};

export const getAffiliateRef = (): string | null => readCookie();

export const captureAffiliateRefFromUrl = (viewerAddress?: string | null) => {
  try {
    const existingRef = readCookie();
    // A page can arrive before the wallet session restores. Once it does, send
    // the existing first-touch referral again so the RPC can remove a self-view.
    if (existingRef) {
      if (viewerAddress) recordAffiliateClick(existingRef, viewerAddress);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const raw = params.get("ref") || params.get("aff");
    if (!raw) return;
    const code = raw.trim().toUpperCase();
    if (!VALID.test(code)) return;
    if (readCookie()) return; // first-touch wins
    setCookie(code);
    // Count the arrival only on first touch. /r/CODE records its own view and
    // then sends people on to /app?ref=CODE, so recording unconditionally here
    // would bill that one visitor twice.
    recordAffiliateClick(code, viewerAddress);
  } catch { /* ignore */ }
};

export const setAffiliateRef = (code: string) => {
  const upper = code.trim().toUpperCase();
  if (!VALID.test(upper)) return;
  if (readCookie()) return;
  setCookie(upper);
};

export const isValidAffiliateCode = (raw: string) => VALID.test(raw);
