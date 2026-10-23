// First touch: the UTM tags, external referrer host and landing page of a
// browser's first visit. 90 days, first touch wins, in localStorage and a
// cookie, like the affiliate cookie. main.tsx hands over the landing URL as
// it was before the first render; signup-attribution.ts writes it to
// `signup_attribution` at sign-in.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export type FirstTouch = Utm & { referrer_host?: string; landing_path: string; at: string };

const KEY = 'dehub_first_touch';
const COOKIE = 'dehub_ft';
const MS = 90 * 86400_000;

/** The UTM tags on a query string, trimmed and capped at 100 characters. */
export function readUtm(search: string): Utm {
  const params = new URLSearchParams(search);
  const out: Utm = {};
  for (const key of UTM_KEYS) {
    const v = params.get(key)?.trim().slice(0, 100);
    if (v) out[key] = v;
  }
  return out;
}

const parse = (raw: string | null | undefined): FirstTouch | null => {
  try {
    const t = raw ? (JSON.parse(raw) as FirstTouch) : null;
    return t && typeof t.landing_path === 'string' && Date.now() - Date.parse(t.at) < MS ? t : null;
  } catch { return null; }
};

export function getFirstTouch(): FirstTouch | null {
  let stored: FirstTouch | null = null;
  try { stored = parse(localStorage.getItem(KEY)); } catch { /* storage blocked */ }
  const row = stored ? null : document.cookie.split('; ').find((r) => r.startsWith(`${COOKIE}=`));
  return stored ?? (row ? parse(decodeURIComponent(row.slice(COOKIE.length + 1))) : null);
}

export type Landing = { path: string; search: string; referrer: string };

/** Record this landing unless a first touch is already stored. */
export function captureFirstTouch(landing: Landing): void {
  try {
    if (getFirstTouch()) return;
    const touch: FirstTouch = { ...readUtm(landing.search), landing_path: landing.path.slice(0, 200) || '/', at: new Date().toISOString() };
    let host = '';
    try { host = landing.referrer ? new URL(landing.referrer).host : ''; } catch { /* malformed referrer */ }
    if (host && host !== location.host) touch.referrer_host = host.slice(0, 120);
    const value = JSON.stringify(touch);
    try { localStorage.setItem(KEY, value); } catch { /* the cookie still holds it */ }
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}=${encodeURIComponent(value)}; expires=${new Date(Date.now() + MS).toUTCString()}; path=/; SameSite=Lax${secure}`;
  } catch { /* attribution must never block a landing */ }
}
