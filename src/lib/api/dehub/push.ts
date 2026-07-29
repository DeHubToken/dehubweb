import { apiCall } from './core';

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

export async function registerPushToken(params: {
  token: string;
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
}): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/push/token", {
    method: "POST",
    body: { ...params },
    requiresAuth: true,
  });
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
