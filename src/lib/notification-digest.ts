/**
 * Smart notifications — combining a pile-up, and pacing it
 * ========================================================
 *
 * Two problems, one module, because the fix for the first one creates the
 * second.
 *
 * **Combining.** Notifications were raised one per event. Twelve things
 * happening while a tab sat in another window produced twelve cards, each
 * carrying a twelfth of the story, and the reader dismissed eleven of them to
 * get to the last. What they actually want to be told is "twelve things
 * happened, here is the newest and who it was from". So a surface that
 * announces should describe the pile it is holding, not announce every
 * addition to it — and the pile is exactly what has arrived since the reader
 * last looked, which is why nothing here fires while the tab is in front of
 * them.
 *
 * **Pacing.** For public chat a digest per burst is still not enough: it is an
 * open room, so it will be raided, and a raid is a thousand messages a minute
 * arriving in a hundred bursts. `claimAllowance` is a rolling-hour budget the
 * reader sets, and it is spent by *notifications*, never by messages. Running
 * out therefore delays the next card; it never drops what that card would have
 * said. The pile keeps growing and the next one to fire carries all of it,
 * which is the behaviour that makes a low limit usable rather than lossy —
 * "six an hour" means six cards, not six messages out of nine hundred.
 *
 * The spend lives in localStorage rather than in memory on purpose: a reload
 * would otherwise mint a fresh hour's allowance, and a reload is precisely
 * what a reader does when a raid starts. Per browser, not per account — it is
 * describing how often *this* machine is allowed to interrupt.
 *
 * @module lib/notification-digest
 */

/** The window an allowance is measured over. "Per hour" means this. */
export const ALLOWANCE_WINDOW_MS = 60 * 60 * 1000;

/** How many distinct names a digest line names before it says "and N others". */
export const DIGEST_NAME_LIMIT = 3;

const SPEND_PREFIX = 'dehub.notify.spend::';

function spendKey(channel: string): string {
  return SPEND_PREFIX + channel;
}

/**
 * The timestamps of the notifications this channel has already fired inside
 * the window. Anything older is dropped on read, so the stored array can never
 * outgrow the limit by more than one pass.
 */
function readSpend(channel: string, now: number): number[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(spendKey(channel));
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      // A clock that has gone backwards (a laptop waking up, a manual change)
      // would otherwise leave stamps "in the future" that never expire.
      .filter((ts) => ts <= now && now - ts < ALLOWANCE_WINDOW_MS)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function writeSpend(channel: string, stamps: number[]) {
  try {
    localStorage.setItem(spendKey(channel), JSON.stringify(stamps));
  } catch {
    /* private mode / quota — the in-memory pacing of this session still holds */
  }
}

export interface AllowanceState {
  /** Notifications fired inside the current window. */
  used: number;
  /** How many more may fire right now. */
  remaining: number;
  /**
   * When the next slot frees up, or null while one is free. This is what a
   * caller should wait until, rather than retrying on a timer of its own.
   */
  nextAt: number | null;
}

/** What the budget looks like without spending any of it. */
export function readAllowance(
  channel: string,
  limit: number,
  now: number = Date.now(),
): AllowanceState {
  const stamps = readSpend(channel, now);
  const used = stamps.length;
  const remaining = Math.max(0, limit - used);
  // The oldest stamp is the one whose expiry frees the next slot. With the
  // limit already exceeded (the reader lowered it mid-hour), it is the
  // (used - limit + 1)th oldest that has to fall out.
  const freeing = used >= limit ? stamps[used - limit] : undefined;
  return {
    used,
    remaining,
    nextAt: remaining > 0 || freeing === undefined ? null : freeing + ALLOWANCE_WINDOW_MS,
  };
}

/**
 * Take one slot if there is one. Returns false when the budget is spent — the
 * caller holds on to whatever it was going to say and tries again after
 * `readAllowance().nextAt`.
 */
export function claimAllowance(
  channel: string,
  limit: number,
  now: number = Date.now(),
): boolean {
  const stamps = readSpend(channel, now);
  if (stamps.length >= limit) {
    writeSpend(channel, stamps);
    return false;
  }
  stamps.push(now);
  writeSpend(channel, stamps);
  return true;
}

/** Forget this channel's spend. Used when a reader turns the channel off. */
export function resetAllowance(channel: string) {
  try {
    localStorage.removeItem(spendKey(channel));
  } catch {
    /* nothing stored, nothing to clear */
  }
}

export interface DigestItem {
  /** Who it was from — a display name or handle, already formatted. */
  from?: string | null;
  /** The line itself. The newest non-empty one is what a digest quotes. */
  text?: string | null;
  /**
   * Set when the item is aimed at the reader personally (a mention, a reply).
   * A digest leads with the newest of these instead of the newest item, so a
   * message addressed to you is not buried under the noise it arrived in.
   */
  personal?: boolean;
  /**
   * Carried through for the card's icon. Nothing here reads it — a digest has
   * many senders and one icon, so which one to show is the caller's call.
   */
  avatar?: string;
}

export interface Digest {
  /** Everything in the pile, including what the summary does not name. */
  count: number;
  /** Distinct senders in arrival order, capped at the name limit. */
  names: string[];
  /** Senders past `names` — the "and N others" number. */
  otherNames: number;
  /** The line worth quoting: the newest personal item, else the newest item. */
  latest: string;
  /** Whether `latest` came from an item aimed at the reader. */
  latestIsPersonal: boolean;
}

/**
 * Describe a pile of buffered items in the shape a single notification needs.
 *
 * Pure and synchronous so the wording can be unit-tested without a browser and
 * without faking `Notification`; the caller turns this into `t()` calls,
 * because everything here has to render in 110 languages.
 *
 * @param items In arrival order, oldest first.
 */
export function buildDigest(
  items: DigestItem[],
  nameLimit: number = DIGEST_NAME_LIMIT,
): Digest {
  const names: string[] = [];
  const seen = new Set<string>();
  let latest = '';
  let latestPersonal = '';

  for (const item of items) {
    const from = item.from?.trim();
    if (from) {
      const dedupeOn = from.toLowerCase();
      if (!seen.has(dedupeOn)) {
        seen.add(dedupeOn);
        names.push(from);
      }
    }
    const text = item.text?.trim();
    if (text) {
      latest = text;
      if (item.personal) latestPersonal = text;
    }
  }

  return {
    count: items.length,
    names: names.slice(0, nameLimit),
    otherNames: Math.max(0, names.length - nameLimit),
    latest: latestPersonal || latest,
    latestIsPersonal: Boolean(latestPersonal),
  };
}
