import { apiCall } from './core';

/**
 * Subathon timers and viewer points on the stream API. Kept out of
 * live-overlay.ts, which the live card reaches on the boot path; only the
 * overlay layer, the OBS page and Live Studio load this.
 */

function unwrap<T>(res: T | { result: T }): T {
  return res && typeof res === 'object' && 'result' in (res as object) ? (res as { result: T }).result : (res as T);
}

export interface SubathonSettings {
  secondsPerThousand: number;
  secondsPerFollow: number;
  secondsPerSubscribe: number;
  capHours: number;
}

export interface MySubathon extends SubathonSettings {
  running: boolean;
  endsAt: string | null;
}

function mySubathon(raw: any): MySubathon {
  const r = unwrap(raw) ?? {};
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    secondsPerThousand: n(r.secondsPerThousand, 30),
    secondsPerFollow: n(r.secondsPerFollow, 10),
    secondsPerSubscribe: n(r.secondsPerSubscribe, 300),
    capHours: n(r.capHours, 24),
    running: !!r.running && typeof r.endsAt === 'string',
    endsAt: typeof r.endsAt === 'string' ? r.endsAt : null,
  };
}

export async function getMySubathon(): Promise<MySubathon> {
  return mySubathon(await apiCall('/api/live-overlay/mine/subathon', { requiresAuth: true }));
}

export async function saveMySubathon(settings: SubathonSettings): Promise<MySubathon> {
  return mySubathon(await apiCall('/api/live-overlay/mine/subathon', { method: 'PUT', body: { ...settings }, requiresAuth: true }));
}

export async function startSubathon(minutes: number, settings: SubathonSettings): Promise<MySubathon> {
  return mySubathon(
    await apiCall('/api/live-overlay/mine/subathon/start', { method: 'POST', body: { ...settings, minutes }, requiresAuth: true }),
  );
}

export async function stopSubathon(): Promise<MySubathon> {
  return mySubathon(await apiCall('/api/live-overlay/mine/subathon/stop', { method: 'POST', requiresAuth: true }));
}

/** Time added or taken off by hand, up to an hour either way. */
export async function addSubathonTime(seconds: number): Promise<MySubathon> {
  return mySubathon(await apiCall('/api/live-overlay/mine/subathon/add', { method: 'POST', body: { seconds }, requiresAuth: true }));
}

export interface PointsRow {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  points: number;
  watchMinutes: number;
  giftedDhb: number;
}

/** A creator's most loyal viewers: a point a minute watched and one per 100 DHB paid. */
export async function getPointsBoard(creator: string, limit = 10): Promise<PointsRow[]> {
  if (!creator) return [];
  const res: any = unwrap(
    await apiCall(`/api/live-overlay/creator/${encodeURIComponent(creator)}/points?limit=${Math.min(50, Math.max(1, limit))}`),
  );
  return Array.isArray(res?.top)
    ? res.top.map((r: any) => ({
        address: String(r?.address || ''),
        username: r?.username || undefined,
        displayName: r?.displayName || undefined,
        avatarImageUrl: r?.avatarImageUrl || undefined,
        points: Number(r?.points) || 0,
        watchMinutes: Number(r?.watchMinutes) || 0,
        giftedDhb: Number(r?.giftedDhb) || 0,
      }))
    : [];
}
