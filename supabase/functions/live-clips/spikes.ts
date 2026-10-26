// Highlight detection for live clips: where the room went off.
//
// The stream's own log is the signal. Chat messages, reactions and gifts are
// bucketed by when they landed (seconds into the broadcast), smoothed over a
// half-minute, and compared with the stream's usual pace. A stretch that
// stands well clear of that pace, and is busy in absolute terms too, is a
// moment. Chat reacts after the thing it reacts to, so the clip reaches back
// further before the spike than it runs after it.
//
// Pure: no I/O, so `node --test` runs it as it is.

export type EventKind = 'chat' | 'reaction' | 'gift';

export interface StreamEvent {
  /** Seconds into the broadcast. */
  t: number;
  kind: EventKind;
  /** Gift amount in DHB; ignored for anything else. */
  amount?: number;
}

export interface Spike {
  /** Seconds into the broadcast where the burst starts. */
  at: number;
  /** How many robust deviations the burst stands above the stream's pace. */
  score: number;
  reason: 'chat' | 'gifts' | 'chat and gifts';
  /** The suggested cut, seconds into the broadcast. */
  start: number;
  end: number;
  /** What the editor may reach for around it. */
  windowStart: number;
  windowEnd: number;
}

export const BUCKET_S = 10;
/** Buckets summed into one reading: thirty seconds. */
export const SMOOTH = 3;
/** Standing above the stream's pace by at least this much. */
export const MIN_SCORE = 2.5;
/** And busy in absolute terms: about six messages in half a minute. */
export const MIN_WEIGHT = 6;
/** Chat lags the moment it reacts to. */
export const LEAD_S = 25;
export const TAIL_S = 20;
/** Room either side for the editor. */
export const SLACK_S = 20;
export const MAX_SPIKES = 5;
/** Two moments closer than this are one moment. */
export const MIN_GAP_S = 90;

/**
 * Weight of one event. A gift is worth several messages, and a big one a few
 * more (log scale, so a whale is not every highlight of the night).
 */
export function weight(e: StreamEvent): number {
  if (e.kind === 'chat') return 1;
  if (e.kind === 'reaction') return 0.5;
  const amount = Number.isFinite(e.amount) && (e.amount as number) > 0 ? (e.amount as number) : 0;
  return 4 + Math.min(6, Math.log10(1 + amount));
}

interface Bucketed {
  total: number[];
  gifts: number[];
}

export function bucketize(events: StreamEvent[], durationS: number): Bucketed {
  const n = Math.max(1, Math.ceil(Math.max(0, durationS) / BUCKET_S));
  const total = new Array(n).fill(0);
  const gifts = new Array(n).fill(0);
  for (const e of events) {
    if (!Number.isFinite(e.t) || e.t < 0 || e.t > durationS) continue;
    const i = Math.min(n - 1, Math.floor(e.t / BUCKET_S));
    const w = weight(e);
    total[i] += w;
    if (e.kind === 'gift') gifts[i] += w;
  }
  return { total, gifts };
}

/** Sum of each SMOOTH-bucket run starting at i. */
function smooth(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + SMOOTH <= values.length; i++) {
    let s = 0;
    for (let k = 0; k < SMOOTH; k++) s += values[i + k];
    out.push(s);
  }
  return out;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The stream's usual pace and spread, robustly: a few huge bursts must not
 * drag the baseline up and hide themselves. The spread never falls below one
 * message, so a near-silent stream does not call every message a spike.
 */
export function baseline(readings: number[]): { centre: number; spread: number } {
  const centre = median(readings);
  const mad = median(readings.map((v) => Math.abs(v - centre)));
  return { centre, spread: Math.max(1, 1.4826 * mad) };
}

function reasonFor(total: number, gifts: number): Spike['reason'] {
  if (gifts <= 0) return 'chat';
  if (gifts >= total * 0.7) return 'gifts';
  return 'chat and gifts';
}

function cut(at: number, durationS: number, score: number, reason: Spike['reason']): Spike {
  const start = Math.max(0, at - LEAD_S);
  const end = Math.min(durationS, at + SMOOTH * BUCKET_S + TAIL_S - BUCKET_S);
  return {
    at,
    score: Math.round(score * 10) / 10,
    reason,
    start,
    end,
    windowStart: Math.max(0, start - SLACK_S),
    windowEnd: Math.min(durationS, end + SLACK_S),
  };
}

/**
 * The best moments of a whole broadcast, strongest first, at most `max`, no
 * two within MIN_GAP_S. Each cut is at least ~10 s; the caller drops any the
 * recording cannot hold.
 */
export function findSpikes(events: StreamEvent[], durationS: number, max = MAX_SPIKES): Spike[] {
  const { total, gifts } = bucketize(events, durationS);
  const readings = smooth(total);
  if (!readings.length) return [];
  const giftReadings = smooth(gifts);
  const { centre, spread } = baseline(readings);

  const peaks: { i: number; score: number }[] = [];
  for (let i = 0; i < readings.length; i++) {
    const v = readings[i];
    if (v < MIN_WEIGHT) continue;
    // Local maximum: the first of a flat top wins.
    if (i > 0 && readings[i - 1] >= v) continue;
    if (i + 1 < readings.length && readings[i + 1] > v) continue;
    const score = (v - centre) / spread;
    if (score >= MIN_SCORE) peaks.push({ i, score });
  }
  peaks.sort((a, b) => b.score - a.score);

  const chosen: Spike[] = [];
  for (const p of peaks) {
    const at = p.i * BUCKET_S;
    if (chosen.some((c) => Math.abs(c.at - at) < MIN_GAP_S)) continue;
    chosen.push(cut(at, durationS, p.score, reasonFor(readings[p.i], giftReadings[p.i])));
    if (chosen.length >= max) break;
  }
  return chosen;
}

/**
 * Is the room spiking right now? Compares the last half-minute with the pace
 * of the broadcast before it (the last minute left out, so the spike is not
 * its own baseline). Null when it is not, or when there is too little history
 * to know what normal looks like.
 */
export function liveSpike(events: StreamEvent[], nowS: number): Spike | null {
  const recentFrom = nowS - SMOOTH * BUCKET_S;
  if (recentFrom < 0) return null;
  let recent = 0;
  let recentGifts = 0;
  for (const e of events) {
    if (e.t < recentFrom || e.t > nowS) continue;
    const w = weight(e);
    recent += w;
    if (e.kind === 'gift') recentGifts += w;
  }
  if (recent < MIN_WEIGHT) return null;

  const historyEnd = nowS - 60;
  // Two minutes of history at least; before that everything looks like a spike.
  if (historyEnd < 120) return null;
  const { total } = bucketize(events.filter((e) => e.t < historyEnd), historyEnd);
  const { centre, spread } = baseline(smooth(total));
  const score = (recent - centre) / spread;
  if (score < MIN_SCORE) return null;
  return cut(recentFrom, nowS, score, reasonFor(recent, recentGifts));
}
