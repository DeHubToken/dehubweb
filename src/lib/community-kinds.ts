/**
 * Groups and channels
 * ===================
 * Both are communities with a `kind` (see
 * 20261102060000_community_groups_channels.sql): a group is a chat everyone
 * talks in, a channel is one only the owner and admins post to. Either can
 * charge a one-off entry price in DeHub tokens, paid straight to the owner.
 * The database reads the transfer from the chain itself before it lets the
 * member in; the client only hands over the transaction hash.
 */

import { translateCopy as _translateCopy } from '@/i18n/copy';
import { payDhb } from '@/lib/dhb-payment';
import { callRpc } from '@/hooks/use-community-admin';
import type { Community } from '@/hooks/use-communities';

export type CommunityKind = 'community' | 'group' | 'channel';

type KindColumns = { kind?: string | null; entry_price?: number | string | null };

export function communityKindOf(community: (Partial<Community> & KindColumns) | null | undefined): CommunityKind {
  const kind = community?.kind;
  return kind === 'group' || kind === 'channel' ? kind : 'community';
}

/** Whole DeHub tokens to get in, or 0 when it is free. */
export function entryPriceOf(community: (Partial<Community> & KindColumns) | null | undefined): number {
  const price = Number(community?.entry_price ?? 0);
  return Number.isFinite(price) && price > 0 ? Math.ceil(price) : 0;
}

/** Messages-list chats: groups and channels the wallet is in, newest first. */
export function chatsFromMemberships<T extends { communities?: (Community & KindColumns) | null; joined_at?: string | null }>(rows: T[] | undefined): (Community & KindColumns)[] {
  return (rows ?? [])
    .map(row => row.communities)
    .filter((c): c is Community & KindColumns => !!c && communityKindOf(c) !== 'community')
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}

export interface EntryResult {
  status: 'free' | 'paid' | 'pending' | 'failed' | 'none';
  amount?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Poll the database until it has read the transfer off the chain. */
export async function waitForEntry(communityId: string, walletAddress: string | null | undefined): Promise<EntryResult> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(attempt === 0 ? 800 : 1500);
    const result = await callRpc<EntryResult>('community_entry_check', { _community_id: communityId }, walletAddress);
    if (result && result.status !== 'pending') return result;
  }
  return { status: 'failed' };
}

/** Already paid (or free)? Cheap read used before offering to pay. */
export async function entryStatus(communityId: string, walletAddress: string | null | undefined): Promise<EntryResult> {
  return callRpc<EntryResult>('community_entry_check', { _community_id: communityId }, walletAddress);
}

/**
 * Pay the owner the entry price in DeHub tokens, then have the database
 * confirm it. Resolves 'paid' once the member row may go in.
 */
export async function payCommunityEntry(community: Community & KindColumns, walletAddress: string | null | undefined): Promise<EntryResult> {
  const price = entryPriceOf(community);
  if (!price) return { status: 'free' };
  const before = await entryStatus(community.id, walletAddress).catch(() => null);
  if (before?.status === 'paid' || before?.status === 'free') return before;
  const owner = community.creator_wallet_address;
  if (!owner) throw new Error(_translateCopy('communities.entry.noOwner', { defaultValue: 'This channel has no owner wallet to pay.' }));
  const payment = await payDhb(price, owner, {
    context: _translateCopy('communities.entry.context', { defaultValue: 'Entry to {{name}}', name: community.name }),
    expectedSigner: null,
  });
  await callRpc('community_entry_submit', {
    _community_id: community.id,
    _chain_id: payment.chainId,
    _tx_hash: payment.txHash,
  }, walletAddress);
  return waitForEntry(community.id, walletAddress);
}
