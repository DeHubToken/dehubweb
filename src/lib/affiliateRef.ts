// DeHub affiliate referral attribution.
//
// First-touch wins: once a visitor lands with `?ref=CODE` (or hits /r/CODE),
// we set a cookie for 90 days and never overwrite it on subsequent visits.
// Once the user signs in with a wallet we self-attribute via `affiliate_referrals`.

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

export const getAffiliateRef = (): string | null => readCookie();

export const captureAffiliateRefFromUrl = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("ref") || params.get("aff");
    if (!raw) return;
    const code = raw.trim().toUpperCase();
    if (!VALID.test(code)) return;
    if (readCookie()) return; // first-touch wins
    setCookie(code);
  } catch { /* ignore */ }
};

export const setAffiliateRef = (code: string) => {
  const upper = code.trim().toUpperCase();
  if (!VALID.test(upper)) return;
  if (readCookie()) return;
  setCookie(upper);
};

export const isValidAffiliateCode = (raw: string) => VALID.test(raw);
