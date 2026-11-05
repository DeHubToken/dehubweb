/**
 * A small snapshot of where a Requests board post was sent from, so bug
 * reports can be reproduced: build, browser, OS, screen, theme, language, page,
 * connection, timezone and the last few client errors.
 *
 * Only the board owners can read it back (see
 * supabase/migrations/20261105030000_feature_request_device_info.sql).
 * Never put IPs, tokens, keys, wallet secrets or query strings in here.
 */

const MAX_ERRORS = 5;
const recentErrors: { at: string; message: string }[] = [];
let errorsInstalled = false;

/** Strips query strings/fragments and long hex blobs so nothing secret rides along. */
export function scrubText(text: string, max = 200): string {
  return text
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, '$1')
    .replace(/0x[a-fA-F0-9]{64,}/g, '0x…')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .slice(0, max);
}

function remember(message: unknown) {
  const text = scrubText(String(message ?? '').trim());
  if (!text) return;
  recentErrors.push({ at: new Date().toISOString(), message: text });
  if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
}

/** Keeps the last few uncaught errors in memory. Cheap: two listeners. */
export function installRecentErrorBuffer() {
  if (errorsInstalled || typeof window === 'undefined') return;
  errorsInstalled = true;
  window.addEventListener('error', (e) => remember(e.message || (e.error as Error | undefined)?.message));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string } | undefined;
    remember(reason?.message ?? reason);
  });
}

export function getRecentErrors() {
  return recentErrors.slice();
}

type UAData = { brands?: { brand: string; version: string }[]; platform?: string; mobile?: boolean };

/** Browser + OS from the user agent. Good enough to tell Safari 17 on iOS from Chrome on Android. */
export function parseUserAgent(ua: string): { browser: string; os: string } {
  let browser = 'Unknown';
  const pick = (re: RegExp, name: string) => {
    const m = ua.match(re);
    return m ? `${name} ${m[1]}` : null;
  };
  browser =
    pick(/EdgA?\/([\d.]+)/, 'Edge') ??
    pick(/OPR\/([\d.]+)/, 'Opera') ??
    pick(/SamsungBrowser\/([\d.]+)/, 'Samsung Internet') ??
    pick(/Brave\/([\d.]+)/, 'Brave') ??
    pick(/CriOS\/([\d.]+)/, 'Chrome iOS') ??
    pick(/FxiOS\/([\d.]+)/, 'Firefox iOS') ??
    pick(/Firefox\/([\d.]+)/, 'Firefox') ??
    pick(/Chrome\/([\d.]+)/, 'Chrome') ??
    (/Safari\//.test(ua) ? pick(/Version\/([\d.]+)/, 'Safari') : null) ??
    browser;

  let os = 'Unknown';
  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS ([\d_]+)/);
  const android = ua.match(/Android ([\d.]+)/);
  const mac = ua.match(/Mac OS X ([\d_.]+)/);
  const win = ua.match(/Windows NT ([\d.]+)/);
  if (ios) os = `iOS ${ios[1].replace(/_/g, '.')}`;
  else if (android) os = `Android ${android[1]}`;
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (mac) os = `macOS ${mac[1].replace(/_/g, '.')}`;
  else if (win) os = win[1] === '10.0' ? 'Windows 10/11' : `Windows NT ${win[1]}`;
  else if (/Linux/.test(ua)) os = 'Linux';
  return { browser, os };
}

/** Phone model where the browser gives one away (Android does, iPhone doesn't). */
function deviceModel(ua: string): string | null {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build\/|\))/);
  if (m && m[1] && m[1] !== 'K') return m[1].trim();
  return null;
}

function themeName(): string | null {
  try {
    return document.documentElement.dataset.theme || localStorage.getItem('dehub.theme');
  } catch {
    return null;
  }
}

export type WebDeviceInfo = Record<string, unknown>;

export function collectWebDeviceInfo(extra: { username?: string | null; wallet?: string | null; language?: string | null } = {}): WebDeviceInfo {
  const ua = navigator.userAgent;
  const { browser, os } = parseUserAgent(ua);
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; saveData?: boolean } }).connection;
  const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  const info: WebDeviceInfo = {
    source: 'web',
    build: typeof __BUILD_ID__ === 'string' && __BUILD_ID__ ? __BUILD_ID__.slice(0, 12) : null,
    browser,
    os,
    device: deviceModel(ua),
    mobile: uaData?.mobile ?? /Mobi|Android|iPhone/.test(ua),
    installed_app: standalone,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    pixel_ratio: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    theme: themeName(),
    dark_mode: window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? null,
    reduced_motion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? null,
    language: extra.language || document.documentElement.lang || navigator.language,
    browser_language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    page: window.location.origin + window.location.pathname,
    connection: conn?.effectiveType ?? null,
    online: navigator.onLine,
    memory_gb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    cpu_cores: navigator.hardwareConcurrency ?? null,
    touch: navigator.maxTouchPoints > 0,
    username: extra.username || null,
    wallet: extra.wallet ? extra.wallet.toLowerCase() : null,
    user_agent: ua.slice(0, 300),
    recent_errors: getRecentErrors(),
  };
  return info;
}
