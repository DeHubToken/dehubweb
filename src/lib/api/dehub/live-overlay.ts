import { apiCall } from './core';
import type { CreatorOverlay, OverlayRenderIn, OverlayWidget, PublicOverlay } from '@/lib/live-overlay/types';

/**
 * The stream overlay routes on the stream API (`/api/live-overlay`).
 *
 * The two public reads are what draws an overlay — the app over a stream, and
 * an OBS page by its token. Everything under `mine` is the creator editing
 * their own, signed in.
 */

function unwrap<T>(res: T | { result: T }): T {
  return res && typeof res === 'object' && 'result' in (res as object) ? (res as { result: T }).result : (res as T);
}

const EMPTY: PublicOverlay = { renderIn: 'app', widgets: [], version: 0, stats: { totalTips: 0, followers: 0 } };

function publicOverlay(raw: Partial<PublicOverlay> | undefined): PublicOverlay {
  return {
    renderIn: raw?.renderIn === 'video' ? 'video' : 'app',
    widgets: Array.isArray(raw?.widgets) ? raw!.widgets : [],
    version: Number(raw?.version) || 0,
    stats: {
      totalTips: Number(raw?.stats?.totalTips) || 0,
      followers: Number(raw?.stats?.followers) || 0,
    },
  };
}

/** What the app draws over a stream. An empty overlay when the creator set none up. */
export async function getStreamOverlay(streamId: string): Promise<PublicOverlay> {
  if (!streamId) return EMPTY;
  const res = await apiCall<PublicOverlay | { result: PublicOverlay }>(
    `/api/live-overlay/stream/${encodeURIComponent(streamId)}`,
  );
  return publicOverlay(unwrap(res));
}

export async function getMyOverlay(): Promise<CreatorOverlay> {
  return unwrap(await apiCall<CreatorOverlay | { result: CreatorOverlay }>('/api/live-overlay/mine', { requiresAuth: true }));
}

export async function saveMyOverlay(overlay: { renderIn: OverlayRenderIn; widgets: OverlayWidget[] }): Promise<CreatorOverlay> {
  return unwrap(
    await apiCall<CreatorOverlay | { result: CreatorOverlay }>('/api/live-overlay/mine', {
      method: 'PUT',
      body: { renderIn: overlay.renderIn, widgets: overlay.widgets },
      requiresAuth: true,
    }),
  );
}

export type OverlayTestKind = 'tip' | 'follow' | 'subscribe' | 'share' | 'join';

/** A pretend alert for the creator's own screens. Never reaches viewers. */
export async function sendOverlayTest(kind: OverlayTestKind, extra: { amount?: number; message?: string } = {}): Promise<void> {
  await apiCall('/api/live-overlay/mine/test', { method: 'POST', body: { kind, ...extra }, requiresAuth: true });
}

/** What an OBS page draws, by its token: the widgets, whose they are, and the stream to join. */
export interface TokenOverlay extends PublicOverlay {
  creator: { address: string; username?: string; displayName?: string; avatarImageUrl?: string };
  live: { streamId: string; tokenId: number | null } | null;
}

export class OverlayNotFoundError extends Error {}

export async function getOverlayByToken(token: string): Promise<TokenOverlay> {
  let res: TokenOverlay | { result: TokenOverlay };
  try {
    res = await apiCall<TokenOverlay | { result: TokenOverlay }>(`/api/live-overlay/public/${encodeURIComponent(token)}`);
  } catch (err) {
    // A rotated or mistyped token is the one failure an OBS page must tell
    // apart from a network blip: it should stop retrying, not keep polling.
    if ((err as { httpStatus?: number })?.httpStatus === 404) throw new OverlayNotFoundError('Overlay not found');
    throw err;
  }
  const raw = unwrap(res);
  return {
    ...publicOverlay(raw),
    creator: raw?.creator ?? { address: '' },
    live: raw?.live?.streamId ? { streamId: String(raw.live.streamId), tokenId: raw.live.tokenId ?? null } : null,
  };
}

/** Retire the OBS URL and issue a new one. Anything still open on the old URL goes blank. */
export async function rotateOverlayToken(): Promise<CreatorOverlay> {
  return unwrap(
    await apiCall<CreatorOverlay | { result: CreatorOverlay }>('/api/live-overlay/mine/rotate', {
      method: 'POST',
      requiresAuth: true,
    }),
  );
}
