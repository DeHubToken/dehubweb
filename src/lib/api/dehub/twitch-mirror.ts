import { apiCall } from './core';

export interface TwitchMirrorStatus {
  available: boolean;
  connected: boolean;
  login: string | null;
  displayName: string | null;
  enabled: boolean;
  state: string;
  live: boolean;
  lastError: string | null;
  postUrl: string | null;
}

function unwrap<T>(body: T | { result: T }): T {
  return body && typeof body === 'object' && 'result' in body ? body.result : body as T;
}

export const twitchMirror = {
  async status(): Promise<TwitchMirrorStatus> {
    return unwrap(await apiCall<TwitchMirrorStatus | { result: TwitchMirrorStatus }>('/api/live/twitch', { requiresAuth: true }));
  },
  async connect(): Promise<string> {
    return unwrap(await apiCall<{ url: string } | { result: { url: string } }>('/api/live/twitch/connect', {
      method: 'POST', requiresAuth: true,
    })).url;
  },
  async enable(enabled: boolean): Promise<TwitchMirrorStatus> {
    return unwrap(await apiCall<TwitchMirrorStatus | { result: TwitchMirrorStatus }>('/api/live/twitch', {
      method: 'PATCH', body: { enabled }, requiresAuth: true,
    }));
  },
  async disconnect(): Promise<TwitchMirrorStatus> {
    return unwrap(await apiCall<TwitchMirrorStatus | { result: TwitchMirrorStatus }>('/api/live/twitch', {
      method: 'DELETE', requiresAuth: true,
    }));
  },
};
