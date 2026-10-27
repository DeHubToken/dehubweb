/**
 * Social apps open links in their own browser (a WebView), and Google refuses
 * to sign anyone in there: the person lands on "Access blocked: this request
 * does not comply with Google's policies" (disallowed_useragent) after
 * tapping Continue with Google, with no way back. Shared links are where new
 * people come from, so this is the sign-up that fails most quietly.
 *
 * Email, phone and Apple still work in these browsers. Only Google needs the
 * person to move to a real browser first.
 */

const APPS: Array<[RegExp, string]> = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'],
  [/musical_ly|BytedanceWebview|TikTok|trill_/i, 'TikTok'],
  [/Twitter for iPhone|TwitterAndroid/i, 'X'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Snapchat/i, 'Snapchat'],
  [/ Line\//, 'LINE'],
  [/MicroMessenger/i, 'WeChat'],
  [/WhatsApp/i, 'WhatsApp'],
];

/**
 * The app whose built-in browser this is, or null in a real browser. An
 * unnamed Android WebView (the `; wv)` marker) counts too, as "this app".
 */
export function embeddedBrowserApp(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string | null {
  for (const [pattern, name] of APPS) if (pattern.test(ua)) return name;
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return '';
  return null;
}

/**
 * A link that opens `href` in the phone's own browser from inside a WebView,
 * or null where no such link exists (desktop, or an unknown platform).
 * Android hands an intent to the system; iOS 17+ honours x-safari-https.
 */
export function systemBrowserUrl(href: string, ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const rest = `${url.host}${url.pathname}${url.search}${url.hash}`;
  if (/Android/.test(ua)) {
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  }
  if (/iPhone|iPad|iPod/.test(ua)) return `x-safari-https://${rest}`;
  return null;
}
