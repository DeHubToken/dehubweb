/**
 * What the feed's poll lookup must not do.
 * ========================================
 * Every card asks whether its post has a poll, because the feed payload does
 * not say. One request per card, against a global per-IP throttle of 20 per 10
 * seconds, is how a scroll used to spend the whole budget on posts that have no
 * poll and leave the rest of the page to be rejected with 429.
 *
 * Pinned here: cards that ask together produce ONE request; an id that comes
 * back with no poll is remembered and never asked about again, including after
 * a reload; and a FAILED lookup is never remembered — react-query caches what a
 * queryFn returns, so answering "no poll" on a 429 would hide a real poll for
 * the full staleTime.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getPolls = vi.fn();

vi.mock('@/lib/api/dehub', () => ({
  POLL_BATCH_LIMIT: 50,
  getPolls: (...args: unknown[]) => getPolls(...args),
  createPoll: vi.fn(),
  voteOnPoll: vi.fn(),
  removePollVote: vi.fn(),
  closePoll: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: null }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const NO_POLL_KEY = 'dehub-posts-without-polls';

function poll(tokenId: number) {
  return { tokenId, question: `Q${tokenId}`, options: [], totalVotes: 0, userVote: null };
}

/**
 * The batcher and the remembered set are module state, which is the point of
 * them — so each test imports a fresh copy after seeding localStorage.
 */
async function freshHook() {
  vi.resetModules();
  return import('../use-polls');
}

beforeEach(() => {
  localStorage.clear();
  getPolls.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('poll lookup batching', () => {
  it('asks about the cards that came into view together in one request', async () => {
    getPolls.mockResolvedValue({ status: true, result: { '2': poll(2) } });
    const { __fetchPollBatched } = await freshHook();

    const all = Promise.all([
      __fetchPollBatched(1),
      __fetchPollBatched(2),
      __fetchPollBatched(3),
    ]);
    await vi.advanceTimersByTimeAsync(100);
    const [a, b, c] = await all;

    // The failure being pinned: this used to be one request per card.
    expect(getPolls).toHaveBeenCalledTimes(1);
    expect(getPolls).toHaveBeenCalledWith([1, 2, 3]);
    expect(a).toBeNull();
    expect(b?.tokenId).toBe(2);
    expect(c).toBeNull();
  });

  it('remembers the ids that had no poll, and reuses that after a reload', async () => {
    getPolls.mockResolvedValue({ status: true, result: {} });
    const first = await freshHook();

    const p = first.__fetchPollBatched(7);
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBeNull();
    expect(JSON.parse(localStorage.getItem(NO_POLL_KEY)!)).toContain(7);

    // A poll can only be attached when a post is created, so the answer holds.
    getPolls.mockClear();
    const afterReload = await freshHook();
    expect(await afterReload.__fetchPollBatched(7)).toBeNull();
    expect(getPolls).not.toHaveBeenCalled();
  });

  it('does not remember a failed lookup as "this post has no poll"', async () => {
    const rateLimited = Object.assign(new Error('Too Many Requests'), { status: 429 });
    getPolls.mockRejectedValue(rateLimited);
    const { __fetchPollBatched } = await freshHook();

    // The assertion is attached BEFORE the timers run: the promise rejects
    // during the advance, and a rejection with no handler yet attached is
    // reported as an unhandled rejection even though the test then passes.
    const p = __fetchPollBatched(9);
    // It must REJECT, not resolve null: react-query caches a returned value for
    // staleTime, so "no poll" here would hide a real poll for five minutes.
    const rejected = expect(p).rejects.toThrow('Too Many Requests');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(localStorage.getItem(NO_POLL_KEY)).toBeNull();
  });

  it('forgets the negative when a poll is created on that post', async () => {
    getPolls.mockResolvedValue({ status: true, result: {} });
    const { __fetchPollBatched, __forgetEmpty } = await freshHook();

    const p = __fetchPollBatched(11);
    await vi.advanceTimersByTimeAsync(100);
    await p;
    expect(JSON.parse(localStorage.getItem(NO_POLL_KEY)!)).toContain(11);

    // Otherwise the poll the user just made stays invisible behind an answer
    // recorded before it existed.
    __forgetEmpty(11);
    expect(JSON.parse(localStorage.getItem(NO_POLL_KEY)!)).not.toContain(11);

    getPolls.mockResolvedValue({ status: true, result: { '11': poll(11) } });
    const again = __fetchPollBatched(11);
    await vi.advanceTimersByTimeAsync(100);
    expect((await again)?.tokenId).toBe(11);
  });
});
