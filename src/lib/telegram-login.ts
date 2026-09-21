/**
 * Telegram login — the client half.
 *
 * Telegram is not a Supabase Auth provider, so this does not go through
 * `signInWithOAuth`. Telegram authenticates the person on oauth.telegram.org
 * and the result is a signed payload that only the `telegram-auth` edge
 * function can verify.
 *
 * How the payload gets back here is the part that has bitten us. The first
 * version was a full-page redirect with `return_to` pointing at /auth/telegram,
 * trusting Telegram to send the browser back once the person confirmed in the
 * app. On Android Chrome it did not: after the in-app confirm Telegram left
 * the tab on its own "You are logged in" page and the redirect never came, so
 * nothing ever reached the edge function.
 *
 * Telegram's own login button does not depend on that redirect at all. Once a
 * person has authorised the bot, `POST https://oauth.telegram.org/auth/get`
 * with the bot id and Telegram's cookies returns the signed payload directly —
 * CORS is allowed for the bot's registered domain with credentials. So the
 * order is now:
 *
 *   1. Ask /auth/get first. Someone who already confirmed (including someone
 *      stranded on Telegram's page by the old flow) is signed in on the spot.
 *   2. Otherwise open Telegram's consent page in a popup and keep asking
 *      /auth/get while it is open. The answer arrives whether Telegram
 *      redirects the popup, posts a message, or just sits on its success page.
 *   3. Where popups are blocked (Telegram's in-app browser, some mobile
 *      browsers), fall back to the full-page redirect and the /auth/telegram
 *      bridge, which still works wherever Telegram honours `return_to`.
 */

import { supabase } from '@/integrations/supabase/client';

/** Where the payload waits between the bridge page and AuthProvider's boot. */
export const TELEGRAM_RESULT_KEY = 'dehub_telegram_auth_result';

export const TELEGRAM_OAUTH_ORIGIN = 'https://oauth.telegram.org';

export interface TelegramLoginConfig {
  enabled: boolean;
  botId: string | null;
  botUsername: string | null;
}

/** The fields Telegram signs. `hash` is the HMAC the edge function checks. */
export interface TelegramUser {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

export type TelegramLoginOutcome =
  | { kind: 'user'; user: TelegramUser }
  | { kind: 'redirected' }
  | { kind: 'cancelled' };

const DISABLED: TelegramLoginConfig = { enabled: false, botId: null, botUsername: null };

let configPromise: Promise<TelegramLoginConfig> | null = null;

/**
 * The bot id, from the edge function rather than a build-time env var.
 *
 * Deliberate: `supabase/functions/*` and the frontend are two separate deploy
 * tracks, and the bot is configured on the function's side. Reading it from
 * there means turning Telegram login on or swapping the bot never needs a
 * frontend build — and the button simply does not render until it is set.
 *
 * Cached for the life of the tab; a failure is cached too, so a login sheet
 * opened repeatedly on a bad network does not re-ask every time.
 */
export function fetchTelegramLoginConfig(): Promise<TelegramLoginConfig> {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-auth', { method: 'GET' });
      if (error || !data?.enabled || !data?.botId) return DISABLED;
      return {
        enabled: true,
        botId: String(data.botId),
        botUsername: data.botUsername ? String(data.botUsername) : null,
      };
    } catch {
      return DISABLED;
    }
  })();
  return configPromise;
}

/** True for anything shaped like a signed Telegram payload. */
export function isTelegramUser(value: unknown): value is TelegramUser {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return /^\d{1,20}$/.test(String(v.id ?? '')) && typeof v.hash === 'string' && v.hash.length > 0;
}

/**
 * Telegram's consent URL.
 *
 * `origin` and `return_to` both have to sit on the domain registered against
 * the bot with BotFather's /setdomain, or Telegram refuses the request with
 * "Bot domain invalid" before showing anything. Using window.location.origin
 * rather than a hardcoded https://dehub.io is what keeps that check honest:
 * a preview host that is not registered fails loudly at Telegram instead of
 * bouncing back to a page that cannot use the result.
 */
export function telegramAuthUrl(botId: string, returnTo: string): string {
  const url = new URL(TELEGRAM_OAUTH_ORIGIN + '/auth');
  url.searchParams.set('bot_id', botId);
  url.searchParams.set('origin', window.location.origin);
  url.searchParams.set('return_to', returnTo);
  // Lets the bot message the user later (order updates, security notices). It
  // is a checkbox on Telegram's own consent screen, not something we can grant
  // on their behalf.
  url.searchParams.set('request_access', 'write');
  return url.toString();
}

/**
 * The signed payload for a person who has already authorised this bot in
 * this browser, or null. This is what Telegram's own widget calls after its
 * popup closes; it needs Telegram's cookies, hence `credentials: 'include'`.
 * Any failure — CORS, network, third-party cookies blocked — is a null, and
 * the caller moves on to the next route.
 */
export async function fetchTelegramSessionUser(botId: string): Promise<TelegramUser | null> {
  try {
    const res = await fetch(TELEGRAM_OAUTH_ORIGIN + '/auth/get', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: 'bot_id=' + encodeURIComponent(botId),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return isTelegramUser(data?.user) ? data.user : null;
  } catch {
    return null;
  }
}

/**
 * Full-page redirect out to Telegram and back through /auth/telegram.
 *
 * `next` is where the person was when they tapped Log in, so they land back
 * there rather than on the feed.
 */
export function redirectToTelegramLogin(botId: string, next?: string): void {
  const returnTo = new URL('/auth/telegram', window.location.origin);
  returnTo.searchParams.set('next', next || window.location.pathname + window.location.search);
  window.location.href = telegramAuthUrl(botId, returnTo.toString());
}

/** How long a person gets to find their phone and confirm. */
const POPUP_TIMEOUT_MS = 10 * 60 * 1000;
/** How often /auth/get is asked while the popup is open. */
const POPUP_POLL_MS = 2500;

/**
 * Run the whole Telegram login from the sheet, without leaving the page when
 * that can be avoided. Resolves with the signed payload, with `redirected`
 * when the browser is on its way to Telegram (the flow resumes after the
 * bridge page reloads the app), or `cancelled` when the person closed the
 * popup without confirming.
 */
export async function startTelegramLogin(botId: string, next?: string): Promise<TelegramLoginOutcome> {
  const existing = await fetchTelegramSessionUser(botId);
  if (existing) return { kind: 'user', user: existing };

  const returnTo = new URL('/auth/telegram', window.location.origin);
  returnTo.searchParams.set('popup', '1');
  const url = telegramAuthUrl(botId, returnTo.toString());

  const width = 550;
  const height = 470;
  const left = Math.max(0, (window.screen.width - width) / 2);
  const top = Math.max(0, (window.screen.height - height) / 2);
  let popup: Window | null = null;
  try {
    popup = window.open(
      url,
      'telegram_oauth_bot' + botId,
      `width=${width},height=${height},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`,
    );
  } catch {
    popup = null;
  }
  if (!popup) {
    redirectToTelegramLogin(botId, next);
    return { kind: 'redirected' };
  }

  return new Promise<TelegramLoginOutcome>((resolve) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let asking = false;

    const finish = (outcome: TelegramLoginOutcome) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearTimeout(pollTimer);
      clearTimeout(deadline);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        /* cross-origin popup — nothing to do */
      }
      resolve(outcome);
    };

    // Two senders are trusted: the bridge page (our own origin, opened with
    // ?popup=1) and Telegram itself, which posts `auth_result` from the popup
    // when its page can reach the opener. Both are checked against the popup
    // we opened, so a message from any other window is ignored.
    const onMessage = (event: MessageEvent) => {
      if (event.source !== popup) return;
      if (event.origin !== window.location.origin && event.origin !== TELEGRAM_OAUTH_ORIGIN) return;
      let data: unknown = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const msg = data as { event?: string; result?: unknown } | null;
      if (msg?.event !== 'auth_result') return;
      if (isTelegramUser(msg.result)) finish({ kind: 'user', user: msg.result });
      else if (msg.result === false) finish({ kind: 'cancelled' });
    };

    const ask = async () => {
      if (settled || asking) return;
      asking = true;
      const user = await fetchTelegramSessionUser(botId);
      asking = false;
      if (settled) return;
      if (user) {
        finish({ kind: 'user', user });
        return;
      }
      if (popup?.closed) {
        finish({ kind: 'cancelled' });
        return;
      }
      pollTimer = setTimeout(ask, POPUP_POLL_MS);
    };

    // Coming back from the Telegram app, or from the popup tab on a phone, is
    // the moment the answer is most likely ready. Ask straight away rather than
    // waiting out the poll.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void ask();
    };

    const deadline = setTimeout(() => finish({ kind: 'cancelled' }), POPUP_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    pollTimer = setTimeout(ask, POPUP_POLL_MS);
  });
}

/**
 * Pull the signed payload the bridge page left behind, if any.
 *
 * sessionStorage, not localStorage: it is consumed once, on the very next
 * page load, and must not survive into a second tab or a later visit where it
 * would sign somebody in out of nowhere.
 */
export function takeStoredTelegramResult(): string | null {
  try {
    const raw = sessionStorage.getItem(TELEGRAM_RESULT_KEY);
    if (raw) sessionStorage.removeItem(TELEGRAM_RESULT_KEY);
    return raw;
  } catch {
    return null;
  }
}

export function storeTelegramResult(raw: string): void {
  try {
    sessionStorage.setItem(TELEGRAM_RESULT_KEY, raw);
  } catch {
    /* private mode — the login just fails closed */
  }
}
