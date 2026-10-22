import { apiCall } from './core';

/**
 * A stream's recap, from the stream API (`GET /api/live/:streamId/recap`):
 * length, peak, paid gifts, new followers, chat, reactions, shares and polls.
 * Only what the chain confirmed counts as a gift. Loaded by Live Studio only.
 */

export interface RecapPerson {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export interface StreamRecap {
  streamId: string;
  tokenId: number | null;
  title: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  creator: RecapPerson;
  peakViewers: number;
  totalViews: number;
  tips: { total: number; count: number; supporters: number };
  topTippers: Array<RecapPerson & { total: number; count: number }>;
  newFollowers: number;
  chat: { messages: number; chatters: number };
  reactions: number;
  /** Null once the server no longer remembers who shared (two days after). */
  shares: number | null;
  polls: Array<{ question: string; options: Array<{ text: string; votes: number }>; total: number }>;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function person(raw: any): RecapPerson {
  return {
    address: String(raw?.address || ''),
    username: raw?.username || undefined,
    displayName: raw?.displayName || undefined,
    avatarImageUrl: raw?.avatarImageUrl || undefined,
  };
}

export function parseRecap(raw: any): StreamRecap {
  const r = raw?.result ?? raw;
  return {
    streamId: String(r?.streamId || ''),
    tokenId: r?.tokenId == null ? null : num(r.tokenId),
    title: String(r?.title || ''),
    status: String(r?.status || ''),
    startedAt: r?.startedAt || null,
    endedAt: r?.endedAt || null,
    durationSec: num(r?.durationSec),
    creator: person(r?.creator),
    peakViewers: num(r?.peakViewers),
    totalViews: num(r?.totalViews),
    tips: { total: num(r?.tips?.total), count: num(r?.tips?.count), supporters: num(r?.tips?.supporters) },
    topTippers: Array.isArray(r?.topTippers) ? r.topTippers.map((t: any) => ({ ...person(t), total: num(t?.total), count: num(t?.count) })) : [],
    newFollowers: num(r?.newFollowers),
    chat: { messages: num(r?.chat?.messages), chatters: num(r?.chat?.chatters) },
    reactions: num(r?.reactions),
    shares: r?.shares == null ? null : num(r.shares),
    polls: Array.isArray(r?.polls)
      ? r.polls.map((p: any) => ({
          question: String(p?.question || ''),
          options: Array.isArray(p?.options) ? p.options.map((o: any) => ({ text: String(o?.text || ''), votes: num(o?.votes) })) : [],
          total: num(p?.total),
        }))
      : [],
  };
}

export async function getStreamRecap(streamId: string): Promise<StreamRecap> {
  return parseRecap(await apiCall<unknown>(`/api/live/${encodeURIComponent(streamId)}/recap`));
}

/** The creator's most recent finished stream, or null if they have not streamed. */
export async function getLastEndedStreamId(address: string): Promise<string | null> {
  if (!address) return null;
  const res = await apiCall<any>(`/api/live/user/${encodeURIComponent(address)}`);
  const rows: any[] = Array.isArray(res?.result) ? res.result : Array.isArray(res) ? res : [];
  const ended = rows.find((s) => String(s?.status || '').toUpperCase() === 'ENDED' && !s?.isTest);
  const id = ended?._id ?? ended?.streamId ?? ended?.id;
  return id ? String(id) : null;
}

/** "1:05:09" or "12:40". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}
