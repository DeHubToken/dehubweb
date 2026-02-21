import { apiCall } from './core';

export interface PushDevice {
  deviceId: string;
  platform: string;
  token: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface PushPreferences {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  directMessages: boolean;
  liveStreams: boolean;
  tips: boolean;
  subscriptions: boolean;
  [key: string]: boolean;
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
    body: { ...preferences },
    requiresAuth: true,
  });
}

export async function resetPushPreferences(): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/push/preferences/reset", {
    method: "POST",
    requiresAuth: true,
  });
}
