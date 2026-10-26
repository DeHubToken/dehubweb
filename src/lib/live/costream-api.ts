/**
 * Co-stream rooms and seats
 * =========================
 * Who is on screen with a video live, and who has asked or been asked to be.
 * The rows live in `live_costreams` / `live_costream_guests`; the rules about
 * who may move a seat where are enforced by the database (see
 * supabase/migrations/20261026090000_live_costreams.sql), so this file only
 * reads and writes — it never decides.
 *
 * Writes go through the wallet-scoped client so the signed wallet session
 * rides along; reads use the shared client because the rows are public.
 *
 * The tables are new. Until the migration is applied every read answers
 * "no room" rather than throwing, so the live page renders exactly as before.
 */
import { supabase } from '@/integrations/supabase/client';
import { walletScopedClient } from '@/lib/supabase-wallet-client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('CoStream');

export type CoStreamSeatStatus = 'invited' | 'requested' | 'accepted' | 'declined' | 'removed' | 'left';

export interface CoStreamRoom {
  id: string;
  host_wallet: string;
  host_stream_id: string;
  host_username: string | null;
  accepting_requests: boolean;
  status: 'active' | 'ended';
  battle_started_at: string | null;
  battle_ends_at: string | null;
  battle_round: number;
  created_at: string;
}

export interface CoStreamSeat {
  id: string;
  costream_id: string;
  wallet: string;
  stream_id: string | null;
  username: string | null;
  status: CoStreamSeatStatus;
  muted: boolean;
  updated_at: string;
}

export interface CoStreamState {
  room: CoStreamRoom;
  seats: CoStreamSeat[];
}

/** Most guests on screen at once, besides the host. Mirrors the database. */
export const MAX_COSTREAM_GUESTS = 3;

/**
 * The Agora uid a wallet uses on a co-stream channel. Pinned to the wallet so
 * the host can map a remote video back to its seat; agora-token refuses any
 * other uid on these channels.
 */
export function costreamUid(wallet: string): number {
  return (parseInt(wallet.toLowerCase().slice(2, 10), 16) >>> 1) || 1;
}

export const costreamChannel = (roomId: string) => `costream-${roomId}`;

export const costreamJoinPath = (roomId: string) => `/app/live/join/${roomId}`;

// The generated database types predate these tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (client: unknown, name: string) => (client as any).from(name);
const writer = (wallet: string) => walletScopedClient(wallet.toLowerCase());

/** PostgREST's answer for a table the schema cache has never heard of. */
function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message || ''));
}

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

async function seatsFor(roomId: string): Promise<CoStreamSeat[]> {
  const { data, error } = await table(supabase, 'live_costream_guests')
    .select('id, costream_id, wallet, stream_id, username, status, muted, updated_at')
    .eq('costream_id', roomId)
    .order('created_at', { ascending: true });
  if (error) {
    if (!isMissingTable(error)) logger.warn('Could not read co-stream seats', error);
    return [];
  }
  return (data || []) as CoStreamSeat[];
}

async function withSeats(room: CoStreamRoom | null): Promise<CoStreamState | null> {
  if (!room) return null;
  return { room, seats: await seatsFor(room.id) };
}

const ROOM_COLUMNS =
  'id, host_wallet, host_stream_id, host_username, accepting_requests, status, battle_started_at, battle_ends_at, battle_round, created_at';

export async function getCoStream(roomId: string): Promise<CoStreamState | null> {
  const { data, error } = await table(supabase, 'live_costreams').select(ROOM_COLUMNS).eq('id', roomId).maybeSingle();
  if (error) {
    if (!isMissingTable(error)) logger.warn('Could not read co-stream', error);
    return null;
  }
  return withSeats(data as CoStreamRoom | null);
}

/**
 * The open room a stream is part of, as host or as a seated guest with their
 * own live — which is what a battle partner is.
 *
 * `owner` is the wallet the stream belongs to, from the stream itself. A row
 * names a stream id the database cannot check, so a room only counts when
 * the wallet holding that stream's place in it is the stream's owner;
 * anything else is somebody claiming another creator's stream.
 */
export async function getCoStreamForStream(streamId: string, owner?: string | null): Promise<CoStreamState | null> {
  const ownerWallet = owner?.toLowerCase();
  const { data: hosted, error } = await table(supabase, 'live_costreams')
    .select(ROOM_COLUMNS)
    .eq('host_stream_id', streamId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    if (!isMissingTable(error)) logger.warn('Could not read co-stream for stream', error);
    return null;
  }
  const room = (hosted || [])[0] as CoStreamRoom | undefined;
  if (room && (!ownerWallet || room.host_wallet === ownerWallet)) return withSeats(room);

  const { data: seated } = await table(supabase, 'live_costream_guests')
    .select('costream_id, wallet')
    .eq('stream_id', streamId)
    .eq('status', 'accepted')
    .limit(3);
  for (const seat of (seated || []) as Pick<CoStreamSeat, 'costream_id' | 'wallet'>[]) {
    if (ownerWallet && seat.wallet !== ownerWallet) continue;
    const state = await getCoStream(seat.costream_id);
    if (state?.room.status === 'active') return state;
  }
  return null;
}

/** The host's open room, if one is already running. */
export async function getMyOpenCoStream(wallet: string): Promise<CoStreamState | null> {
  const { data, error } = await table(supabase, 'live_costreams')
    .select(ROOM_COLUMNS)
    .eq('host_wallet', wallet.toLowerCase())
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) logger.warn('Could not read own co-stream', error);
    return null;
  }
  return withSeats(data as CoStreamRoom | null);
}

/**
 * Opens (or reuses) the host's room for this broadcast. A room left open by
 * an earlier broadcast is closed first: its seats were for that stream.
 */
export async function openCoStream(wallet: string, streamId: string, username?: string | null): Promise<CoStreamState> {
  const host = wallet.toLowerCase();
  const existing = await getMyOpenCoStream(host);
  if (existing && existing.room.host_stream_id === streamId) return existing;
  if (existing) await endCoStream(host, existing.room.id);
  const { data, error } = await table(writer(host), 'live_costreams')
    .insert({ host_wallet: host, host_stream_id: streamId, host_username: username || null })
    .select(ROOM_COLUMNS)
    .single();
  if (error || !data) fail(error, 'Could not open guest seats');
  return { room: data as CoStreamRoom, seats: [] };
}

export async function endCoStream(wallet: string, roomId: string): Promise<void> {
  const { error } = await table(writer(wallet), 'live_costreams').update({ status: 'ended' }).eq('id', roomId);
  if (error) fail(error, 'Could not close guest seats');
}

export async function setAcceptingRequests(wallet: string, roomId: string, accepting: boolean): Promise<void> {
  const { error } = await table(writer(wallet), 'live_costreams').update({ accepting_requests: accepting }).eq('id', roomId);
  if (error) fail(error, 'Could not change requests');
}

async function upsertSeat(
  actor: string,
  roomId: string,
  wallet: string,
  status: 'invited' | 'requested',
  extra: Partial<Pick<CoStreamSeat, 'username' | 'stream_id'>> = {},
): Promise<void> {
  const guest = wallet.toLowerCase();
  const client = writer(actor);
  const { data: existing } = await table(supabase, 'live_costream_guests')
    .select('id, status')
    .eq('costream_id', roomId)
    .eq('wallet', guest)
    .maybeSingle();
  if (existing) {
    if (existing.status === status || existing.status === 'accepted') return;
    const { error } = await table(client, 'live_costream_guests').update({ status, ...extra }).eq('id', existing.id);
    if (error) fail(error, 'Could not update that seat');
    return;
  }
  const { error } = await table(client, 'live_costream_guests').insert({ costream_id: roomId, wallet: guest, status, ...extra });
  if (error) fail(error, 'Could not create that seat');
}

/** Host: ask someone onto the screen. */
export function inviteGuest(host: string, roomId: string, guest: string, username?: string | null) {
  return upsertSeat(host, roomId, guest, 'invited', { username: username || null });
}

/** Viewer: ask the host to be let on. */
export function requestToJoin(wallet: string, roomId: string, username?: string | null, streamId?: string | null) {
  return upsertSeat(wallet, roomId, wallet, 'requested', { username: username || null, stream_id: streamId || null });
}

async function setSeat(actor: string, seatId: string, patch: Partial<Pick<CoStreamSeat, 'status' | 'muted' | 'stream_id' | 'username'>>) {
  const { error } = await table(writer(actor), 'live_costream_guests').update(patch).eq('id', seatId);
  if (error) fail(error, 'Could not update that seat');
}

export const acceptRequest = (host: string, seatId: string) => setSeat(host, seatId, { status: 'accepted' });
export const declineRequest = (host: string, seatId: string) => setSeat(host, seatId, { status: 'declined' });
export const removeGuest = (host: string, seatId: string) => setSeat(host, seatId, { status: 'removed' });
export const setGuestMuted = (host: string, seatId: string, muted: boolean) => setSeat(host, seatId, { muted });
/** Guest: take the invite. `streamId` is the guest's own live, if they are on one. */
export const acceptInvite = (guest: string, seatId: string, streamId?: string | null, username?: string | null) =>
  setSeat(guest, seatId, { status: 'accepted', stream_id: streamId || null, ...(username ? { username } : {}) });
export const declineInvite = (guest: string, seatId: string) => setSeat(guest, seatId, { status: 'declined' });
export const leaveSeat = (guest: string, seatId: string) => setSeat(guest, seatId, { status: 'left' });

/** Open invites for this wallet, newest first, in rooms that are still running. */
export async function getMyInvites(wallet: string): Promise<Array<CoStreamSeat & { room: CoStreamRoom }>> {
  const { data, error } = await table(supabase, 'live_costream_guests')
    .select('id, costream_id, wallet, stream_id, username, status, muted, updated_at')
    .eq('wallet', wallet.toLowerCase())
    .in('status', ['invited', 'accepted'])
    .order('updated_at', { ascending: false })
    .limit(5);
  if (error) {
    if (!isMissingTable(error)) logger.warn('Could not read co-stream invites', error);
    return [];
  }
  const out: Array<CoStreamSeat & { room: CoStreamRoom }> = [];
  for (const seat of (data || []) as CoStreamSeat[]) {
    const state = await getCoStream(seat.costream_id);
    if (state?.room.status === 'active') out.push({ ...seat, room: state.room });
  }
  return out;
}

// ── Battles ────────────────────────────────────────────────────────────────

export const BATTLE_DURATIONS_S = [60, 180, 300] as const;

export async function startBattle(host: string, roomId: string, seconds: number): Promise<void> {
  const now = Date.now();
  const { error } = await table(writer(host), 'live_costreams')
    .update({
      battle_started_at: new Date(now).toISOString(),
      battle_ends_at: new Date(now + seconds * 1000).toISOString(),
    })
    .eq('id', roomId);
  if (error) fail(error, 'Could not start the battle');
}

export async function stopBattle(host: string, roomId: string): Promise<void> {
  const { error } = await table(writer(host), 'live_costreams')
    .update({ battle_ends_at: new Date().toISOString() })
    .eq('id', roomId);
  if (error) fail(error, 'Could not stop the battle');
}

// ── Matchmaking ────────────────────────────────────────────────────────────

export type QueueAnswer =
  | { status: 'idle' }
  | { status: 'waiting'; waiting: number }
  | { status: 'matched'; role: 'host' | 'guest'; costream_id: string; partner_wallet?: string; partner_username?: string | null };

async function rpc<T>(wallet: string, name: string, args?: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (writer(wallet) as any).rpc(name, args);
  if (error) fail(error, 'Matchmaking is unavailable right now');
  return data as T;
}

export const joinCoStreamQueue = (wallet: string, streamId: string, username?: string | null) =>
  rpc<QueueAnswer>(wallet, 'costream_queue_join', { p_stream_id: streamId, p_username: username || null });
export const pollCoStreamQueue = (wallet: string) => rpc<QueueAnswer>(wallet, 'costream_queue_poll');
export const leaveCoStreamQueue = (wallet: string) => rpc<void>(wallet, 'costream_queue_leave');
export const coStreamQueueSize = (wallet: string) => rpc<number>(wallet, 'costream_queue_size');
