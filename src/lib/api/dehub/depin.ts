/**
 * DePin REST endpoints
 * ====================
 * Public network stats and the authenticated node ledger for the browser
 * backup/pinning node feature. See `src/lib/depin-node.ts` for the node
 * lifecycle itself (socket registration, OPFS storage, challenge responses).
 */

import { apiCall } from './core';

/**
 * The API answers `{ status, result }`; callers here want the payload.
 *
 * Note the `/api` prefix on the paths below. `apiCall` resolves against the
 * bare origin, so omitting it 404s every request — and because both calls
 * degrade to "not tracked yet" on failure, that mistake reads as a backend
 * that simply isn't deployed rather than as a broken URL.
 */
function unwrap<T>(payload: unknown): T {
  const envelope = payload as { result?: T } | null;
  if (envelope && typeof envelope === 'object' && envelope.result != null) {
    return envelope.result;
  }
  return payload as T;
}

export interface DepinStats {
  onlineNodes: number;
  totalStoredBytes: number;
  totalVerifiedBytes: number;
}

export interface DepinStatsUnavailable {
  ok: false;
  reason: string;
  message?: string;
}

export type DepinStatsResponse = DepinStats | DepinStatsUnavailable;

function isUnavailable(payload: unknown): payload is DepinStatsUnavailable {
  return !!payload && typeof payload === 'object' && (payload as { ok?: unknown }).ok === false;
}

/**
 * Public — no wallet or auth required.
 *
 * The backend for this feature may not be deployed yet, in which case the
 * request itself fails (404/network error) rather than returning a body. That
 * is treated the same as an explicit `{ ok: false }` response — the caller
 * shows an honest "not tracked yet" state instead of a thrown error bubbling
 * into a generic failure UI.
 */
export async function getDepinStats(): Promise<DepinStatsResponse> {
  try {
    const payload = await apiCall<DepinStatsResponse>('/api/depin/stats');
    if (isUnavailable(payload)) return payload;
    return unwrap<DepinStats>(payload);
  } catch (err) {
    return { ok: false, reason: 'unconfigured', message: err instanceof Error ? err.message : undefined };
  }
}

export type DepinNodeStatus = 'unregistered' | 'online' | 'offline';

export interface DepinMe {
  /** Null until this wallet has connected as a node at least once. */
  nodeId: string | null;
  status: DepinNodeStatus;
  storedBytes: number;
  verifiedBytes: number;
  dhbEarnedThisPeriod: number;
}

export interface DepinMeUnavailable {
  ok: false;
  reason: string;
  message?: string;
}

export type DepinMeResponse = DepinMe | DepinMeUnavailable;

/** Authenticated — the connected wallet's own node ledger. Same unconfigured-on-failure handling as getDepinStats(). */
export async function getDepinMe(): Promise<DepinMeResponse> {
  try {
    const payload = await apiCall<DepinMeResponse>('/api/depin/me', { requiresAuth: true });
    if (isUnavailable(payload)) return payload;
    return unwrap<DepinMe>(payload);
  } catch (err) {
    return { ok: false, reason: 'unconfigured', message: err instanceof Error ? err.message : undefined };
  }
}
