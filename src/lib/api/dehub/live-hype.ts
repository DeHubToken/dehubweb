import { apiCall } from './core';
import { roomUser, type StreamJoinUser } from './stream-presence';

/**
 * Gifted subscriptions, hype trains and limited-time chat badges on the
 * stream API. Kept apart from subscriptions.ts so the live card does not pull
 * the gift checkout onto its boot path.
 */

function unwrap<T>(res: T | { result: T }): T {
  return res && typeof res === 'object' && 'result' in (res as object) ? (res as { result: T }).result : (res as T);
}

// ─── Gifted subscriptions ─────────────────────────────────────────────────────

export interface GiftQuote {
  giftId: string;
  planId: string;
  planName?: string;
  creatorAddress: string;
  mode: 'user' | 'random';
  /** How many the checkout buys: fewer than asked when fewer chatters can receive one. */
  count: number;
  requested: number;
  /** Named for a gift to one account; random recipients are revealed once it is paid. */
  recipients: StreamJoinUser[];
  chainId: number;
  dhbToken: string;
  treasuryAddress: string;
  dhbAmount: number;
  dhbAmountWei: string;
  usdtTotal: number;
  quoteExpiresAt: string;
}

export interface GiftResult {
  giftId: string;
  status: 'pending' | 'granting' | 'granted';
  count: number;
  granted: number;
  recipients: StreamJoinUser[];
}

export type GiftTarget = { recipient: string } | { count: number; streamId: string };

export async function quoteSubscriptionGift(planId: string, target: GiftTarget, chainId?: number): Promise<GiftQuote> {
  const res: any = unwrap(
    await apiCall('/api/plan/gift', { method: 'POST', body: { planId, ...(chainId ? { chainId } : {}), ...target }, requiresAuth: true }),
  );
  return {
    ...res,
    giftId: String(res?.giftId ?? ''),
    count: Number(res?.count) || 0,
    requested: Number(res?.requested) || Number(res?.count) || 0,
    recipients: Array.isArray(res?.recipients) ? res.recipients.map(roomUser) : [],
    dhbAmount: Number(res?.dhbAmount) || 0,
    usdtTotal: Number(res?.usdtTotal) || 0,
  };
}

export async function confirmSubscriptionGift(giftId: string, hash: string, chainId: number): Promise<GiftResult> {
  const res: any = unwrap(
    await apiCall('/api/plan/gift/confirm', { method: 'POST', body: { giftId, hash, chainId }, requiresAuth: true }),
  );
  return {
    giftId: String(res?.giftId ?? giftId),
    status: res?.status ?? 'granted',
    count: Number(res?.count) || 0,
    granted: Number(res?.granted) || 0,
    recipients: Array.isArray(res?.recipients) ? res.recipients.map(roomUser) : [],
  };
}

interface PendingGiftPayment {
  giftId: string;
  hash: string;
  chainId: number;
}

const PENDING_GIFTS_KEY = 'dehub.pending-gift-payments.v1';

function pendingGifts(): PendingGiftPayment[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_GIFTS_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function storePendingGifts(list: PendingGiftPayment[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_GIFTS_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_GIFTS_KEY);
  } catch {
    // Private mode: the confirmation below is still tried once.
  }
}

export function rememberPendingGift(payment: PendingGiftPayment) {
  storePendingGifts([...pendingGifts().filter((p) => p.giftId !== payment.giftId), payment]);
}

export function clearPendingGift(giftId: string) {
  storePendingGifts(pendingGifts().filter((p) => p.giftId !== giftId));
}

/**
 * Finish a gift whose DHB transfer went through while its confirmation did
 * not. The API is idempotent, and a paid gift must never ask for a second transfer.
 */
export async function reconcilePendingGifts(): Promise<void> {
  for (const p of pendingGifts()) {
    try {
      await confirmSubscriptionGift(p.giftId, p.hash, p.chainId);
      clearPendingGift(p.giftId);
    } catch {
      // Kept for the next try.
    }
  }
}

// ─── Hype trains ──────────────────────────────────────────────────────────────

export interface HypeTrain {
  streamId: string;
  active: boolean;
  points: number;
  /** The level being filled. */
  level: number;
  /** Levels finished: what the badge pays out at. */
  completed: number;
  into: number;
  need: number;
  startedAt: string;
  expiresAt: string;
  contributors: number;
  top: Array<StreamJoinUser & { points: number }>;
  started?: boolean;
  ended?: boolean;
  levelUp?: boolean;
}

export function parseHypeTrain(raw: any): HypeTrain | null {
  if (!raw || typeof raw !== 'object' || !raw.streamId) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    streamId: String(raw.streamId),
    active: !!raw.active,
    points: n(raw.points),
    level: Math.max(1, n(raw.level)),
    completed: n(raw.completed),
    into: n(raw.into),
    need: Math.max(1, n(raw.need)),
    startedAt: String(raw.startedAt || ''),
    expiresAt: String(raw.expiresAt || ''),
    contributors: n(raw.contributors),
    top: Array.isArray(raw.top) ? raw.top.slice(0, 3).map((u: any) => ({ ...roomUser(u), points: n(u?.points) })) : [],
    started: !!raw.started,
    ended: !!raw.ended,
    levelUp: !!raw.levelUp,
  };
}

export async function getHypeTrain(streamId: string): Promise<HypeTrain | null> {
  if (!streamId) return null;
  const res: any = unwrap(await apiCall(`/api/live-hype/stream/${encodeURIComponent(streamId)}`));
  return parseHypeTrain(res?.train);
}

// ─── Limited-time badges ──────────────────────────────────────────────────────

export type BadgeAudience = 'subscribers' | 'gifters' | 'both';

export interface EventBadge {
  id: string;
  name: string;
  emoji: string;
  audience: BadgeAudience;
  startsAt: string;
  endsAt: string;
  active: boolean;
  holders?: number;
}

function badge(raw: any): EventBadge {
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    emoji: String(raw?.emoji ?? ''),
    audience: raw?.audience === 'subscribers' || raw?.audience === 'gifters' ? raw.audience : 'both',
    startsAt: String(raw?.startsAt ?? ''),
    endsAt: String(raw?.endsAt ?? ''),
    active: !!raw?.active,
    ...(raw?.holders !== undefined ? { holders: Number(raw.holders) || 0 } : {}),
  };
}

export async function getMyEventBadges(): Promise<EventBadge[]> {
  const res: any = unwrap(await apiCall('/api/live-badges/mine', { requiresAuth: true }));
  return Array.isArray(res) ? res.map(badge) : [];
}

export async function createEventBadge(input: { name: string; emoji: string; audience: BadgeAudience; days: number }): Promise<EventBadge> {
  return badge(unwrap(await apiCall('/api/live-badges/mine', { method: 'POST', body: input, requiresAuth: true })));
}

export async function endEventBadge(id: string): Promise<EventBadge> {
  return badge(unwrap(await apiCall(`/api/live-badges/mine/${encodeURIComponent(id)}`, { method: 'DELETE', requiresAuth: true })));
}

export async function getCreatorEventBadges(creator: string): Promise<EventBadge[]> {
  if (!creator) return [];
  const res: any = unwrap(await apiCall(`/api/live-badges/creator/${encodeURIComponent(creator)}`));
  return Array.isArray(res) ? res.map(badge) : [];
}

export { parseChatBadges, type ChatCreatorBadge } from '@/lib/live/chat-badges';

/**
 * Whether the stream API serves gifts, hype trains and badges yet. Asked once
 * per session, so the gift sheet never offers a checkout the API cannot take.
 */
export async function liveHypeSupported(): Promise<boolean> {
  try {
    await apiCall('/api/live-hype/stream/000000000000000000000000');
    return true;
  } catch {
    return false;
  }
}
