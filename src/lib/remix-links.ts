/**
 * Remix links: duets, stitches and reactions made from another creator's video.
 *
 * One shared record for all three, kept by the remix-links edge function: it
 * checks the source creator's "Allow duets / stitches / reactions" setting
 * before anything is linked, notifies them, and sets the share of tips on the
 * remix that goes back to them (splitBps — see use-tip-payment).
 */
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';

export type RemixKind = 'duet' | 'stitch' | 'react';
export type RemixLinkKind = RemixKind | 'react_live';
export type RemixPolicy = 'everyone' | 'followers' | 'nobody';

export interface RemixLink {
  id: string;
  kind: RemixLinkKind;
  sourceTokenId: number;
  sourceAddress: string;
  sourceUsername: string | null;
  remixerAddress: string;
  remixerUsername: string | null;
  remixTokenId: number | null;
  streamTokenId: number | null;
  active: boolean;
  splitBps: number;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface RemixCounts { duets: number; stitches: number; reactions: number }
export interface RemixPolicySetting { post: RemixPolicy | null; account: RemixPolicy | null; effective: RemixPolicy }
export type RemixSettings = Record<RemixKind, RemixPolicySetting>;

async function call<T>(body: Record<string, unknown>, signedIn = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (signedIn) headers['x-dehub-token'] = await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke('remix-links', { body, headers });
  if (data?.error) throw Object.assign(new Error(data.error), { refused: !!data.refused });
  if (error) {
    // A non-2xx answer carries the reason in its body; FunctionsHttpError hides it.
    const context = (error as { context?: Response }).context;
    const reason = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw Object.assign(new Error(reason?.error || error.message || 'Remix request failed'), { refused: !!reason?.refused });
  }
  return data as T;
}

function toLink(row: any): RemixLink {
  return {
    id: row.id, kind: row.kind,
    sourceTokenId: Number(row.source_token_id), sourceAddress: row.source_address, sourceUsername: row.source_username ?? null,
    remixerAddress: row.remixer_address, remixerUsername: row.remixer_username ?? null,
    remixTokenId: row.remix_token_id == null ? null : Number(row.remix_token_id),
    streamTokenId: row.stream_token_id == null ? null : Number(row.stream_token_id),
    active: !!row.active, splitBps: Number(row.split_bps) || 0, details: row.details ?? {}, createdAt: row.created_at,
  };
}

/**
 * Whether the signed-in viewer may remix this video, and why not. When the
 * service itself cannot answer, the backend's own quote policy is the only
 * gate left, so this says allowed (with `unchecked`) rather than blocking.
 */
export async function checkRemix(sourceTokenId: string | number, kind: RemixKind): Promise<{ allowed: boolean; reason?: string; policy?: RemixPolicy; unchecked?: boolean }> {
  try {
    return await call({ action: 'check', sourceTokenId: String(sourceTokenId), kind }, true);
  } catch (error) {
    if ((error as { refused?: boolean }).refused) return { allowed: false, reason: (error as Error).message };
    console.warn('[remix-links] check unavailable', error);
    return { allowed: true, unchecked: true };
  }
}

/** Link a posted remix to its source. Refused (error.refused) when the creator does not allow it. */
export async function recordRemixLink(params: { kind: RemixKind; sourceTokenId: string | number; remixTokenId: string | number; details?: Record<string, unknown> }) {
  const res = await call<{ link: any }>({ action: 'record', ...params, sourceTokenId: String(params.sourceTokenId), remixTokenId: String(params.remixTokenId) }, true);
  return toLink(res.link);
}

export async function startLiveReaction(sourceTokenId: string | number, streamTokenId: string | number) {
  const res = await call<{ link: any }>({ action: 'live-start', sourceTokenId: String(sourceTokenId), streamTokenId: String(streamTokenId) }, true);
  return toLink(res.link);
}

export async function endLiveReaction(id: string) {
  await call({ action: 'live-end', id }, true);
}

export async function attachLiveReaction(id: string, remixTokenId: string | number) {
  const res = await call<{ link: any }>({ action: 'attach', id, remixTokenId: String(remixTokenId) }, true);
  return toLink(res.link);
}

/** Newest first; `react` includes live reactions. */
export async function listRemixes(sourceTokenId: string | number, kind?: RemixKind, page = 0) {
  const res = await call<{ links: any[]; hasMore: boolean }>({ action: 'list', sourceTokenId: String(sourceTokenId), kind, page });
  return { links: (res.links ?? []).map(toLink), hasMore: !!res.hasMore };
}

export async function getRemixCounts(sourceTokenIds: Array<string | number>): Promise<Record<string, RemixCounts>> {
  if (!sourceTokenIds.length) return {};
  const res = await call<{ counts: Record<string, RemixCounts> }>({ action: 'counts', sourceTokenIds: sourceTokenIds.map(String) });
  return res.counts ?? {};
}

/** What each of these posts was made from, keyed by remix token id. */
export async function getRemixLinks(remixTokenIds: Array<string | number>): Promise<Record<string, RemixLink>> {
  if (!remixTokenIds.length) return {};
  const res = await call<{ links: any[] }>({ action: 'links', remixTokenIds: remixTokenIds.map(String) });
  return Object.fromEntries((res.links ?? []).map(toLink).map(link => [String(link.remixTokenId), link]));
}

export async function getRemixLink(remixTokenId: string | number): Promise<RemixLink | null> {
  return (await getRemixLinks([remixTokenId]))[String(remixTokenId)] ?? null;
}

/** The owner's policy for one post (tokenId) or their account default. */
export function getRemixSettings(owner: string, tokenId?: string | number | null) {
  return call<{ settings: RemixSettings; splitBps: number }>({ action: 'settings-get', owner, tokenId: tokenId == null ? undefined : String(tokenId) });
}

/** Save the caller's own setting. A null value goes back to inheriting. */
export function saveRemixSettings(values: { tokenId?: string | number | null; allowDuet?: RemixPolicy | null; allowStitch?: RemixPolicy | null; allowReact?: RemixPolicy | null }) {
  return call<{ settings: RemixSettings; splitBps: number }>({ action: 'settings-set', ...values, tokenId: values.tokenId == null ? undefined : String(values.tokenId) }, true);
}

/** How a tip on a remix divides: the source creator's part first. Amounts are in the token's display units. */
export function splitRemixTip(amount: number, link: Pick<RemixLink, 'splitBps' | 'sourceAddress' | 'remixerAddress'> | null) {
  if (!link || link.splitBps <= 0 || link.sourceAddress === link.remixerAddress) return { source: 0, remixer: amount };
  const source = Math.floor(amount * link.splitBps) / 10000;
  return { source, remixer: amount - source };
}
