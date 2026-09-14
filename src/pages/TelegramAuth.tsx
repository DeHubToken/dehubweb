import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { sameOriginPath } from "@/lib/safe-redirect";
import { storeTelegramResult } from "@/lib/telegram-login";

// AuthProvider owns this flag; AuthConfirm keeps its own copy of the literal
// for the same reason. Importing it would drag the whole auth stack into a
// page whose entire job is to bounce.
const SUPA_LOGIN_PENDING_KEY = "dehub_supa_login_pending";
const SUPA_LOGIN_PENDING_AT_KEY = "dehub_supa_login_pending_at";

/** The fields Telegram signs, in the form the edge function expects. */
const WIDGET_FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];

/**
 * Pull Telegram's answer out of whichever place it left it.
 *
 * oauth.telegram.org appends `#tgAuthResult=<base64 of the JSON>` to
 * `return_to`. The older widget-with-data-auth-url form instead sends the
 * fields as ordinary query parameters. Both are accepted here and both are
 * normalised to the base64 form, so `telegram-auth` only has one shape to
 * verify — and the fragment never reaches a server log, which is the reason
 * Telegram puts it there.
 */
function readTelegramResult(search: URLSearchParams): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  const fromHash = new URLSearchParams(hash).get("tgAuthResult");
  if (fromHash) return fromHash;

  const fromQuery = search.get("tgAuthResult");
  if (fromQuery) return fromQuery;

  if (search.get("id") && search.get("hash")) {
    const payload: Record<string, string> = {};
    for (const field of WIDGET_FIELDS) {
      const value = search.get(field);
      if (value) payload[field] = value;
    }
    // btoa needs latin1; a Telegram first_name is routinely not. Encode the
    // UTF-8 bytes first or "Привет" throws InvalidCharacterError and the login
    // dies on the one screen with nothing to retry from.
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    return btoa(String.fromCharCode(...bytes));
  }

  return null;
}

/**
 * Telegram's landing page — the only address Telegram is allowed to return to.
 *
 * Telegram will only redirect to the domain registered against the bot, which
 * rules out sending it straight at a `dehub://` deep link. So the browser
 * comes back here, and here decides where the result actually belongs:
 *
 *  - `?app=1` — the request came from the mobile app's auth session. Hand the
 *    payload to the app's scheme and let expo-web-browser close the tab.
 *  - otherwise — stash the payload for AuthProvider and reload into the page
 *    the person left. The reload is deliberate: the pending flag below is read
 *    at module init, so the login sheet comes back up on the first paint
 *    already saying "Signing you in…", exactly as the Google return does.
 *
 * Nothing here trusts the payload. It is a signed blob that only the
 * telegram-auth edge function can check, and this page never looks inside it.
 */
export default function TelegramAuth() {
  const [params] = useSearchParams();
  const [failed, setFailed] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const result = readTelegramResult(params);
    const next = sameOriginPath(params.get("next"));

    if (!result) {
      // Telegram sends people back here empty-handed when they close its
      // consent screen. That is a cancel, not an error — go back where they
      // were rather than leaving them on a dead page.
      if (params.get("app") === "1") {
        window.location.replace("dehub://auth-callback?telegram=cancelled");
        setFailed(true);
        return;
      }
      window.location.replace(next);
      return;
    }

    if (params.get("app") === "1") {
      window.location.replace(`dehub://auth-callback#tgAuthResult=${encodeURIComponent(result)}`);
      // The app's auth session closes this tab itself. If the scheme does not
      // resolve — the browser was opened outside the app somehow — the notice
      // below is all there is to show.
      setFailed(true);
      return;
    }

    storeTelegramResult(result);
    try {
      localStorage.setItem(SUPA_LOGIN_PENDING_KEY, "1");
      localStorage.setItem(SUPA_LOGIN_PENDING_AT_KEY, String(Date.now()));
    } catch {
      /* private mode — the resume just won't be pre-opened */
    }
    window.location.replace(next);
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(var(--paper,0_0%_100%))]">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Signing you in…</h1>
        <p className="text-sm text-muted-foreground">
          {failed
            ? "You can close this tab and go back to DeHub."
            : "One moment while we finish your Telegram login."}
        </p>
      </div>
    </div>
  );
}
