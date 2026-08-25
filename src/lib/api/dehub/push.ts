import { apiCall } from './core';
import { updateProfile } from './users';

export interface PushDevice {
  deviceId: string;
  platform: string;
  token: string;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * Notification preferences, in the shape the API actually returns.
 *
 * This previously declared a flat `{likes, comments, follows, …}` object. The
 * server has never used that shape — it groups toggles into categories and
 * wraps the payload in `{success, preferences}`. Because the old reader looked
 * for `response.result` (which does not exist) and the old keys sat at the
 * wrong level, every toggle in Settings read `undefined` and rendered as ON,
 * and every write posted a top-level key the server ignores.
 *
 * Verified against a live GET /api/push/preferences response.
 */

/** Toggle names, grouped exactly as the server groups them. */
export const NOTIFICATION_CATEGORIES = {
  engagement: ['likes', 'comments', 'commentReplies', 'mentions'],
  social: ['newFollowers'],
  monetization: ['tips', 'subscriptions', 'ppvPurchases'],
  content: ['milestones', 'livestreamStart'],
  system: ['accountAlerts', 'announcements'],
} as const;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

/** Every valid toggle key, flattened — handy for lookups and tests. */
export type NotificationKey =
  (typeof NOTIFICATION_CATEGORIES)[NotificationCategory][number];

/** Reverse index: toggle key → the category it lives under. */
export const CATEGORY_OF: Record<NotificationKey, NotificationCategory> =
  Object.entries(NOTIFICATION_CATEGORIES).reduce((acc, [cat, keys]) => {
    for (const k of keys as readonly string[]) {
      acc[k as NotificationKey] = cat as NotificationCategory;
    }
    return acc;
  }, {} as Record<NotificationKey, NotificationCategory>);

export interface QuietHoursPrefs {
  enabled: boolean;
  startHour: number;
  endHour: number;
  timezone: string;
}

export interface DigestModePrefs {
  enabled: boolean;
  frequency: string;
}

export interface PushPreferences {
  engagement: Partial<Record<'likes' | 'comments' | 'commentReplies' | 'mentions', boolean>>;
  social: Partial<Record<'newFollowers', boolean>>;
  monetization: Partial<Record<'tips' | 'subscriptions' | 'ppvPurchases', boolean>>;
  content: Partial<Record<'milestones' | 'livestreamStart', boolean>>;
  system: Partial<Record<'accountAlerts' | 'announcements', boolean>>;
  quietHours?: QuietHoursPrefs;
  digestMode?: DigestModePrefs;
  pushEnabled?: boolean;
}

/** Read a single toggle out of the categorised object. Defaults to on. */
export function getPref(prefs: PushPreferences | undefined, key: NotificationKey): boolean {
  const cat = CATEGORY_OF[key];
  if (!cat || !prefs) return true;
  const group = prefs[cat] as Record<string, boolean> | undefined;
  return group?.[key] ?? true;
}

/** Build the nested patch the server expects for a single toggle. */
export function buildPrefPatch(key: NotificationKey, value: boolean): Partial<PushPreferences> {
  const cat = CATEGORY_OF[key];
  if (!cat) return {};
  return { [cat]: { [key]: value } } as Partial<PushPreferences>;
}

export interface WebPushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function registerPushToken(params: {
  token: string;
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  deviceName?: string;
  /** Web only — the payload is encrypted to these keys, so an endpoint alone is useless. */
  webSubscription?: WebPushSubscriptionPayload;
}): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/push/token", {
    method: "POST",
    body: { ...params },
    requiresAuth: true,
  });
}

/**
 * The key a browser needs before it can subscribe.
 *
 * Unauthenticated by design, and an empty string is a real answer: it means
 * this deployment has no VAPID keys, so web push is off and the caller should
 * stay on in-tab notifications rather than showing a broken switch.
 */
export async function getVapidPublicKey(): Promise<string> {
  try {
    const response = await apiCall<{ publicKey?: string; configured?: boolean }>(
      "/api/push/vapid-public-key",
    );
    return response?.publicKey ?? '';
  } catch {
    // An older API has no such route. Same meaning as no key: no web push.
    return '';
  }
}

export async function unregisterPushToken(deviceId: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/push/token/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

export async function unregisterAllPushTokens(): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/push/tokens", {
    method: "DELETE",
    requiresAuth: true,
  });
}

export async function getRegisteredDevices(): Promise<PushDevice[]> {
  const response = await apiCall<{ result: PushDevice[] } | PushDevice[]>("/api/push/devices", {
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as PushDevice[];
}

/**
 * The live endpoint answers `{success, preferences}`. This used to look for
 * `.result`, found nothing, and handed back the whole envelope — so every
 * caller read `undefined` for every toggle. `.result` and the bare object are
 * still accepted in case other deployments differ.
 */
export function unwrapPreferences(response: unknown): PushPreferences {
  const r = response as Record<string, unknown> | null | undefined;
  const body = (r?.preferences ?? r?.result ?? r ?? {}) as PushPreferences;
  return body;
}

export async function getPushPreferences(): Promise<PushPreferences> {
  const response = await apiCall<unknown>("/api/push/preferences", {
    requiresAuth: true,
  });
  return unwrapPreferences(response);
}

/**
 * Sends the categorised shape the server returns, and mirrors the same values
 * as flat top-level keys.
 *
 * The mirror is deliberate belt-and-braces: web has only ever sent flat keys,
 * and we cannot confirm from the client whether the server normalises them or
 * ignores them. Sending both means the write lands whichever it does, and the
 * two can never disagree because they are derived from the same patch. A live
 * `GET` shows no stray flat keys stored server-side, so the mirror cannot
 * pollute the saved object. Once the server's contract is confirmed, drop
 * `flatMirror` and send `patch` alone.
 */
export async function updatePushPreferences(
  patch: Partial<PushPreferences>,
): Promise<{ result: boolean }> {
  const flatMirror: Record<string, boolean> = {};
  for (const [group, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && group in NOTIFICATION_CATEGORIES) {
      for (const [key, v] of Object.entries(value as Record<string, boolean>)) {
        if (typeof v === 'boolean') flatMirror[key] = v;
      }
    }
  }

  return apiCall<{ result: boolean }>("/api/push/preferences", {
    method: "POST",
    body: { ...flatMirror, ...patch },
    requiresAuth: true,
  });
}

export async function resetPushPreferences(): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/push/preferences/reset", {
    method: "POST",
    requiresAuth: true,
  });
}

// ---------------------------------------------------------------------------
// Per-type delivery preferences
// ---------------------------------------------------------------------------
//
// These live on the account document, NOT in the push-preferences collection
// the endpoints above talk to. The notification service reads
// `accounts.notificationPreferences` to decide whether a row gets created at
// all, and never reads the push-preferences collection for per-type toggles —
// that one is consulted only for quiet hours and digest mode.
//
// Web used to drive its Settings toggles through /api/push/preferences, so
// every one of them was a no-op: it wrote to a store nothing checks, and the
// one-way sync in update_profile overwrote it wholesale the next time the user
// saved anything on mobile. Mobile has always written here. Same store now.

/** The account document's notification block. Keys match NotificationKey exactly. */
export interface AccountNotificationPreferences {
  inAppEnabled?: boolean;
  pushEnabled?: boolean;
  inApp?: Partial<Record<NotificationKey, boolean>>;
  push?: Partial<Record<NotificationKey, boolean>>;
}

/**
 * Read the signed-in user's preferences. The API only returns this block when
 * you ask for your own profile; for anyone else's it is stripped server-side.
 */
export async function getAccountNotificationPreferences(
  address: string,
): Promise<AccountNotificationPreferences> {
  const response = await apiCall<{ result?: { notificationPreferences?: AccountNotificationPreferences } }>(
    `/api/account_info/${encodeURIComponent(address)}`,
    { requiresAuth: true },
  );
  return response?.result?.notificationPreferences ?? {};
}

/** Read one in-app toggle. Absent means on — the server treats `!== false` as enabled. */
export function getInAppPref(
  prefs: AccountNotificationPreferences | undefined,
  key: NotificationKey,
): boolean {
  if (prefs?.inAppEnabled === false) return false;
  return prefs?.inApp?.[key] ?? true;
}

/**
 * Write one in-app toggle.
 *
 * update_profile applies this block as dot-notation $set ops, so a single-key
 * patch is a genuine partial update — no read-modify-write, and no risk of
 * clobbering the `push` block that mobile manages with its own switches.
 */
export async function updateInAppNotificationPref(
  key: NotificationKey,
  value: boolean,
): Promise<{ result: boolean }> {
  return updateProfile({
    notificationPreferences: JSON.stringify({ inApp: { [key]: value } }),
  });
}
