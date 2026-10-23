import { apiCall } from './core';
import { parsePoll, type LivePoll } from '@/lib/live-overlay/polls';

/**
 * Live poll routes on the stream API (`/api/live-overlay/.../poll`). Kept out
 * of live-overlay.ts, which the live card reaches on the boot path; only the
 * overlay layer, the OBS page and Live Studio ever load this.
 */

function unwrap<T>(res: T | { result: T }): T {
  return res && typeof res === 'object' && 'result' in (res as object) ? (res as { result: T }).result : (res as T);
}

type PollResponse = { poll?: unknown; myVote?: number };

/** The poll a viewer opening the stream should see: an open one, or a result that just finished. */
export async function getStreamPoll(streamId: string): Promise<LivePoll | null> {
  if (!streamId) return null;
  const res = unwrap(await apiCall<PollResponse | { result: PollResponse }>(`/api/live-overlay/stream/${encodeURIComponent(streamId)}/poll`));
  return parsePoll(res?.poll);
}

/** One vote per person. Voting again answers with the first choice, which is the one that counts. */
export async function voteInPoll(streamId: string, pollId: string, option: number): Promise<{ poll: LivePoll | null; myVote: number }> {
  const res = unwrap(
    await apiCall<PollResponse | { result: PollResponse }>(`/api/live-overlay/stream/${encodeURIComponent(streamId)}/poll/vote`, {
      method: 'POST',
      body: { pollId, option },
      requiresAuth: true,
    }),
  );
  return { poll: parsePoll(res?.poll), myVote: Number.isInteger(res?.myVote) ? Number(res!.myVote) : option };
}

/** The creator's latest poll, open or finished. */
export async function getMyPoll(): Promise<LivePoll | null> {
  const res = unwrap(await apiCall<PollResponse | { result: PollResponse }>('/api/live-overlay/mine/poll', { requiresAuth: true }));
  return parsePoll(res?.poll);
}

/** Asks the room a question on the creator's live stream. Replaces a poll that is still open. */
export async function startPoll(draft: { question: string; options: string[]; durationSec: number }): Promise<LivePoll | null> {
  const res = unwrap(
    await apiCall<PollResponse | { result: PollResponse }>('/api/live-overlay/mine/poll', {
      method: 'POST',
      body: draft,
      requiresAuth: true,
    }),
  );
  return parsePoll(res?.poll);
}

export async function closePoll(): Promise<LivePoll | null> {
  const res = unwrap(
    await apiCall<PollResponse | { result: PollResponse }>('/api/live-overlay/mine/poll/close', { method: 'POST', requiresAuth: true }),
  );
  return parsePoll(res?.poll);
}
