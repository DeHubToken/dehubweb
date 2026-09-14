/**
 * Telegram login — the client half.
 *
 * Telegram is not a Supabase Auth provider, so this does not go through
 * `signInWithOAuth`. It is still an ordinary full-page redirect, exactly like
 * the Google and Apple buttons: send the browser to oauth.telegram.org, let
 * Telegram authenticate the person, and come back with a signed payload that
 * only the `telegram-auth` edge function can verify.
 *
 * A popup (telegram-widget.js + `Telegram.Login.auth`) was the other option and
 * was rejected: it means a third-party script on the login sheet, a `window`
 * global, and a flow that silently does nothing wherever popups are blocked —
 * which includes Telegram's own in-app browser, the one place a Telegram login
 * button is most likely to be tapped.
 */

import { supabase } from '@/integrations/supabase/client';

/** Where the payload waits between the bridge page and AuthProvider's boot. */
export const TELEGRAM_RESULT_KEY = 'dehub_telegram_auth_result';

export interface TelegramLoginConfig {
  enabled: boolean;
  botId: string | null;
  botUsername: string | null;
}

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

/**
 * Send the browser to Telegram.
 *
 * `origin` and `return_to` both have to sit on the domain registered against
 * the bot with BotFather's /setdomain, or Telegram refuses the request with
 * "Bot domain invalid" before showing anything. Using window.location.origin
 * rather than a hardcoded https://dehub.io is what keeps that check honest:
 * a preview host that is not registered fails loudly at Telegram instead of
 * bouncing back to a page that cannot use the result.
 *
 * `next` is where the person was when they tapped Log in, so they land back
 * there rather than on the feed.
 */
export function redirectToTelegramLogin(botId: string, next?: string): void {
  const origin = window.location.origin;
  const returnTo = new URL('/auth/telegram', origin);
  returnTo.searchParams.set('next', next || window.location.pathname + window.location.search);

  const url = new URL('https://oauth.telegram.org/auth');
  url.searchParams.set('bot_id', botId);
  url.searchParams.set('origin', origin);
  url.searchParams.set('return_to', returnTo.toString());
  url.searchParams.set('embed', '0');
  // Lets the bot message the user later (order updates, security notices). It
  // is a checkbox on Telegram's own consent screen, not something we can grant
  // on their behalf.
  url.searchParams.set('request_access', 'write');

  window.location.href = url.toString();
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
