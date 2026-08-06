import { apiCall } from './core';

export interface PushDevice {
  deviceId: string;
  platform: string;
  token: string;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * Push notification types. Key names are kept identical to mobile's
 * `NotificationPreferenceKey` (dehub-mobile services/push/push.service.ts) so
 * the two clients describe the same notification with the same word.
 *
 * `follows` and `liveStreams` are web's original spellings for what mobile
 * calls `newFollowers` and `livestreamStart`. Both are kept and both are
 * written on every update (see `updatePushPreferences`) so neither client can
 * silently read a preference the other never set.
 */
export interface PushPreferences {
  likes: boolean;
  comments: boolean;
  commentReplies: boolean;
  mentions: boolean;
  directMessages: boolean;
  /** Mobile's `newFollowers`. */
  newFollowers: boolean;
  /** @deprecated web-only alias of `newFollowers`, still written for back-compat. */
  follows: boolean;
  /** Mobile's `livestreamStart`. */
  livestreamStart: boolean;
  /** @deprecated web-only alias of `livestreamStart`, still written for back-compat. */
  liveStreams: boolean;
  tips: boolean;
  subscriptions: boolean;
  ppvPurchases: boolean;
  milestones: boolean;
  /** Matches mobile's `accountAlerts` key (services/push/push.service.ts). */
  accountAlerts: boolean;
  announcements: boolean;
  [key: string]: boolean;
}

/**
 * Keys whose value must be mirrored onto a second key, because web and mobile
 * historically named the same notification differently.
 */
const PREFERENCE_ALIASES: Record<string, string> = {
  newFollowers: 'follows',
  follows: 'newFollowers',
  livestreamStart: 'liveStreams',
  liveStreams: 'livestreamStart',
};

/** Expands a partial update so both spellings of an aliased key are sent. */
export function withPreferenceAliases(
  preferences: Partial<PushPreferences>
): Partial<PushPreferences> {
  const expanded: Record<string, boolean> = { ...preferences } as Record<string, boolean>;
  for (const [key, alias] of Object.entries(PREFERENCE_ALIASES)) {
    if (key in preferences && !(alias in preferences)) {
      expanded[alias] = preferences[key] as boolean;
    }
  }
  return expanded;
}

/** Reads a preference by mobile's name, falling back to web's legacy spelling. */
export function readPreference(
  prefs: PushPreferences | undefined,
  key: string,
  fallback = true
): boolean {
  if (!prefs) return fallback;
  const alias = PREFERENCE_ALIASES[key];
  return prefs[key] ?? (alias ? prefs[alias] : undefined) ?? fallback;
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

export async function getPushPreferences(): Promise<PushPreferences> {
  const response = await apiCall<{ result: PushPreferences }>("/api/push/preferences", {
    requiresAuth: true,
  });
  return response?.result ?? response as any;
}

export async function updatePushPreferences(preferences: Partial<PushPreferences>): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/push/preferences", {
    method: "POST",
    body: withPreferenceAliases(preferences),
    requiresAuth: true,
  });
}

export async function resetPushPreferences(): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/push/preferences/reset", {
    method: "POST",
    requiresAuth: true,
  });
}
