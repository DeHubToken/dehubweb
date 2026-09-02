/**
 * The bug this module exists for.
 *
 * `supabase.channel(topic)` is a lookup, not a constructor: name a topic that
 * already has a channel and you get that same object back. Two hooks that name
 * one topic therefore share one channel, and the first of them to run its
 * cleanup calls `removeChannel` on the thing the other is still using. On a
 * stage that is a host closing the captions panel and silently ending their own
 * outbound captions, or a listener stopping dubbing and taking the speaker's
 * clip channel with it.
 *
 * The fake client below reproduces exactly that lookup behaviour, so these are
 * tests of the sharing rule and not of a mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeChannel {
  topic: string;
  config: unknown;
  removed: boolean;
  bindings: string[];
  subscribeCalls: number;
  on: (type: string, filter: unknown, cb: unknown) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
}

const channels: FakeChannel[] = [];
/** Held so a test can decide when the join lands. */
let pendingJoins: (() => void)[] = [];

function makeChannel(topic: string, config: unknown): FakeChannel {
  const chan: FakeChannel = {
    topic,
    config,
    removed: false,
    bindings: [],
    subscribeCalls: 0,
    on(type: string) {
      chan.bindings.push(type);
      return chan;
    },
    subscribe(cb?: (status: string) => void) {
      chan.subscribeCalls += 1;
      if (cb) pendingJoins.push(() => cb('SUBSCRIBED'));
      return chan;
    },
  };
  return chan;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (topic: string, opts?: unknown) => {
      // The real client's behaviour: look the topic up, return what is there.
      const existing = channels.find((c) => c.topic === topic && !c.removed);
      if (existing) return existing;
      const chan = makeChannel(topic, opts);
      channels.push(chan);
      return chan;
    },
    removeChannel: (chan: FakeChannel) => {
      chan.removed = true;
      return Promise.resolve('ok');
    },
  },
}));

const TOPIC = 'stage:captions:abc';

/** The lease deals in RealtimeChannel; the fake above is what is behind it. */
const asFake = (chan: unknown) => chan as FakeChannel;

function flushJoins() {
  const queued = pendingJoins;
  pendingJoins = [];
  for (const join of queued) join();
}

beforeEach(async () => {
  channels.length = 0;
  pendingJoins = [];
  const { __resetChannelLeases } = await import('../realtime-channel-lease');
  __resetChannelLeases();
});

describe('leaseChannel', () => {
  it('gives both holders the one channel and joins it once', async () => {
    const { leaseChannel } = await import('../realtime-channel-lease');
    const bindAs = (type: string) => (c: unknown) => void asFake(c).on(type, {}, () => {});
    const first = leaseChannel(TOPIC, { bind: bindAs('presence') });
    const second = leaseChannel(TOPIC, { bind: bindAs('broadcast') });

    expect(second.channel).toBe(first.channel);
    expect(channels).toHaveLength(1);
    // One join, and both holders' handlers on it. A second `subscribe()` on a
    // joined channel is an error the client logs, not a second join.
    expect(channels[0].subscribeCalls).toBe(1);
    expect(channels[0].bindings).toEqual(['presence', 'broadcast']);
  });

  it('keeps the channel open when one holder leaves', async () => {
    const { leaseChannel } = await import('../realtime-channel-lease');
    const publisher = leaseChannel(TOPIC);
    const feed = leaseChannel(TOPIC);

    feed.release();
    expect(publisher.channel.topic).toBe(TOPIC);
    expect(channels[0].removed).toBe(false);

    publisher.release();
    expect(channels[0].removed).toBe(true);
  });

  it('does not let a double release drop somebody else’s hold', async () => {
    const { leaseChannel } = await import('../realtime-channel-lease');
    const first = leaseChannel(TOPIC);
    const second = leaseChannel(TOPIC);

    first.release();
    first.release();
    first.release();

    expect(channels[0].removed).toBe(false);
    second.release();
    expect(channels[0].removed).toBe(true);
  });

  it('builds a fresh channel after the last holder leaves', async () => {
    const { leaseChannel } = await import('../realtime-channel-lease');
    leaseChannel(TOPIC).release();
    const again = leaseChannel(TOPIC);

    expect(channels).toHaveLength(2);
    expect(asFake(again.channel).removed).toBe(false);
  });

  it('runs onJoin for every holder when the join lands', async () => {
    const { leaseChannel } = await import('../realtime-channel-lease');
    const joined: string[] = [];
    leaseChannel(TOPIC, { onJoin: () => joined.push('publisher') });
    leaseChannel(TOPIC, { onJoin: () => joined.push('feed') });

    expect(joined).toEqual([]);
    flushJoins();
    expect(joined).toEqual(['publisher', 'feed']);
  });

  /**
   * The half a plain `subscribe` callback cannot do: a holder arriving after the
   * join has already landed would otherwise wait forever for a callback that has
   * been and gone, and never publish its presence.
   */
  it('runs onJoin immediately for a holder that arrives after the join', async () => {
    const { leaseChannel } = await import('../realtime-channel-lease');
    leaseChannel(TOPIC);
    flushJoins();

    const late: string[] = [];
    leaseChannel(TOPIC, { onJoin: () => late.push('feed') });
    expect(late).toEqual(['feed']);
  });

  it('does not call onJoin for a holder that already left', async () => {
    const { leaseChannel } = await import('../realtime-channel-lease');
    const keep = leaseChannel(TOPIC);
    const gone: string[] = [];
    const leaving = leaseChannel(TOPIC, { onJoin: () => gone.push('feed') });

    leaving.release();
    flushJoins();

    expect(gone).toEqual([]);
    keep.release();
  });

  it('passes config only when it builds the channel', async () => {
    const { leaseChannel } = await import('../realtime-channel-lease');
    leaseChannel(TOPIC, { config: { presence: { key: 'speaker-1' } } });
    leaseChannel(TOPIC, { config: { presence: { key: 'viewer-1' } } });

    // The real client silently drops the second config, which is why the
    // module documents it rather than pretending to apply it.
    expect(channels[0].config).toEqual({ config: { presence: { key: 'speaker-1' } } });
  });

  it('keeps separate topics separate', async () => {
    const { leaseChannel } = await import('../realtime-channel-lease');
    const text = leaseChannel(TOPIC);
    const audio = leaseChannel(`${TOPIC}:audio`);

    expect(audio.channel).not.toBe(text.channel);
    audio.release();
    expect(asFake(text.channel).removed).toBe(false);
  });
});
