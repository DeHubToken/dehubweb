/**
 * Product analytics (PostHog)
 * ===========================
 * A handful of growth events, sent only when `VITE_POSTHOG_KEY` is set. With
 * no key this module does nothing and posthog-js is never downloaded.
 *
 * The library is loaded with a dynamic import once the browser is idle after
 * first paint, so it never joins the entry bundle or the boot path. Events
 * raised before it arrives are queued and replayed in order.
 *
 * Autocapture and session recording are off: only the events named below and
 * page views go out, and visitors whose browser sends Do Not Track are skipped.
 */

type PostHog = typeof import('posthog-js').default;

export type AnalyticsEvent = 'signup' | 'first_post' | 'share' | 'invite_link_copied';

type Call = (ph: PostHog) => void;

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';

// Bounded so a load that never finishes cannot grow without limit.
const MAX_QUEUED = 50;

let client: PostHog | null = null;
let loading = false;
let identified: string | null = null;
const queue: Call[] = [];

function run(call: Call): void {
  if (!KEY) return;
  if (client) {
    try { call(client); } catch { /* analytics must never surface to the user */ }
    return;
  }
  if (queue.length < MAX_QUEUED) queue.push(call);
  initAnalytics();
}

function load(): void {
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY as string, {
        api_host: HOST,
        person_profiles: 'identified_only',
        capture_pageview: 'history_change',
        autocapture: false,
        disable_session_recording: true,
        respect_dnt: true,
        persistence: 'localStorage+cookie',
      });
      client = posthog;
      for (const call of queue.splice(0)) {
        try { call(posthog); } catch { /* ignore */ }
      }
    })
    .catch(() => { loading = false; });
}

/** Start loading PostHog once the page is idle. Safe to call repeatedly. */
export function initAnalytics(): void {
  if (!KEY || loading || typeof window === 'undefined') return;
  loading = true;
  const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (ric) ric(load, { timeout: 5000 });
  else setTimeout(load, 2000);
}

/** Tie events to the signed-in wallet, or forget it on sign-out. */
export function identifyAnalytics(address: string | null | undefined): void {
  if (!KEY) return;
  const addr = address?.toLowerCase() ?? null;
  if (addr === identified) return;
  const previous = identified;
  identified = addr;
  run((ph) => {
    if (addr) ph.identify(addr, { wallet_address: addr });
    else if (previous) ph.reset();
  });
}

export function trackEvent(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  run((ph) => { ph.capture(event, properties); });
}

/** A share of anything, by the route it went out on (copy_link, native, x, dm…). */
export function trackShare(channel: string, properties?: Record<string, unknown>): void {
  trackEvent('share', { channel, ...properties });
}

/** `event` once per wallet on this browser. */
function once(event: AnalyticsEvent, address: string | null | undefined): void {
  if (!KEY || !address) return;
  const addr = address.toLowerCase();
  const key = `dehub_tracked_${event}`;
  try {
    const seen = window.localStorage.getItem(key)?.split(',') ?? [];
    if (seen.includes(addr)) return;
    window.localStorage.setItem(key, [...seen, addr].slice(-20).join(','));
  } catch { /* still worth sending */ }
  trackEvent(event);
}

/** A brand-new account finished signing in. */
export const trackSignup = (address: string | null | undefined) => once('signup', address);

/** The first post this wallet published from this browser. */
export const trackFirstPost = (address: string | null | undefined) => once('first_post', address);
