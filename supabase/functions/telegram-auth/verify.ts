/**
 * Telegram Login Widget signature checking.
 *
 * Split out of index.ts so it can be unit-tested from the app's vitest suite —
 * this is the one piece of the Telegram flow where a subtle mistake is a
 * security hole rather than a broken screen, and the rest of the function is
 * Deno-only glue that a test cannot reach.
 *
 * The scheme, from Telegram's own docs: build a "data check string" out of the
 * signed fields, HMAC-SHA256 it with SHA256(bot_token) as the key, and compare
 * against the `hash` field. Only the bot's owner can produce that HMAC, so a
 * payload that verifies is proof Telegram itself issued it.
 */

/**
 * Every field Telegram signs, sorted by key — which is the order the data
 * check string uses. Anything else in the payload is not covered by the hash
 * and must not be read as if it were.
 */
export const SIGNED_FIELDS = [
  "auth_date",
  "first_name",
  "id",
  "last_name",
  "photo_url",
  "username",
] as const;

/**
 * "key=value" for every signed field that is PRESENT, newline-joined.
 *
 * Absent fields are omitted, not sent empty. A Telegram account with no
 * @username or no profile picture signs a shorter string, so padding the gaps
 * with blanks produces a different HMAC and fails every one of those logins —
 * which is roughly a third of accounts, and looks exactly like a bad bot token.
 */
export function buildDataCheckString(payload: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const field of SIGNED_FIELDS) {
    const value = payload[field];
    if (value === undefined || value === null || value === "") continue;
    lines.push(field + "=" + String(value));
  }
  return lines.join("\n");
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent, value-independent comparison of two hex digests. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The HMAC Telegram would have produced for this payload and bot token. */
export async function signDataCheckString(dataCheckString: string, botToken: string): Promise<string> {
  const secret = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(dataCheckString)));
}

/** True only for a payload Telegram signed with this bot's token. */
export async function verifyTelegramPayload(
  payload: Record<string, unknown>,
  botToken: string,
): Promise<boolean> {
  const hash = String(payload?.hash || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return false;
  const expected = await signDataCheckString(buildDataCheckString(payload), botToken);
  return timingSafeEqual(expected, hash);
}

/**
 * Decode the `tgAuthResult` fragment Telegram hands back on the redirect path.
 *
 * base64url, and UTF-8 underneath — `JSON.parse(atob(...))` is wrong here even
 * though it usually appears to work. atob yields one character per BYTE, so a
 * name like "Данила" or "陳" comes back as mojibake, which then hashes to
 * something Telegram never signed: the login fails verification, and only for
 * people whose names are not ASCII.
 *
 * Returns null for anything that is not decodable JSON — callers treat that
 * the same as a bad signature.
 */
export function decodeTgAuthResult(raw: string): Record<string, unknown> | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Whether a payload is recent enough to act on.
 *
 * Telegram signs `auth_date` but has no notion of single use, so an old
 * payload stays valid forever unless something here refuses it. A day is
 * Telegram's own suggestion. The negative bound is separate and much tighter:
 * a payload dated in the future is either a clock skewed by minutes or a
 * replay trying to buy itself another day.
 */
export function authDateIsFresh(
  authDate: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 86400,
  maxSkewSeconds = 300,
): boolean {
  const seconds = Number(authDate);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  const age = nowSeconds - seconds;
  return age <= maxAgeSeconds && age >= -maxSkewSeconds;
}
