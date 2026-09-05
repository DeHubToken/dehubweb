/**
 * Shared realtime channels, held by count rather than by whoever got there
 * first.
 *
 * `supabase.channel(topic)` does not return a new channel. It looks the topic
 * up and hands back the existing one if there is any, so two hooks naming the
 * same topic get the *same object* — and then `supabase.removeChannel(...)` in
 * either one's cleanup closes it for both. On a stage that reads as: the host
 * closes the captions panel and their own outbound captions stop; a listener
 * stops dubbing and the speaker's clip channel goes with it. Nothing throws,
 * the surviving panel simply never receives again.
 *
 * Two smaller edges come with it. The second caller's `config` is dropped, so
 * the presence key and the ack and self flags all belong to whoever mounted
 * first. And calling `.subscribe()` on a channel that has already joined is an
 * error the client logs rather than a second join.
 *
 * `leaseChannel` makes all of that explicit. The first lease builds and joins
 * the channel; later ones attach to it; the join only closes when the last
 * holder releases.
 *
 * ── Why holders declare listeners instead of calling `.on` themselves ──
 *
 * The first version of this took a `bind(channel)` callback and let each holder
 * add its own handlers. That leaked. `RealtimeChannel` has no public way to
 * take a binding back off, so a holder that released left its handlers attached
 * to a channel the others were keeping alive — and the captions feed re-runs
 * its effect whenever the panel is toggled, so every toggle stacked another
 * full set of handlers, each closing over a dead component. The old code got
 * away with the same accumulation only because `removeChannel` destroyed the
 * channel and took the bindings with it; leasing removed the one thing that was
 * cleaning up.
 *
 * So the lease owns the bindings. Each distinct (type, filter) gets exactly one
 * real `.on(...)` for the channel's whole life, dispatching to a set of holder
 * handlers, and releasing removes that holder's handlers from the set. The real
 * binding never needs removing, because the channel does not outlive the last
 * holder.
 *
 * Only use this for a topic more than one hook can hold at once. A channel with
 * a single owner is clearer with the plain client call.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Supabase types each `.on` overload separately and the payload shape differs
 * per event; every call site here narrows it immediately. Matching that rather
 * than inventing a union the client does not use.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeaseHandler = (payload: any, channel: RealtimeChannel) => void;

export interface LeaseListener {
  /** `broadcast` or `presence` — whatever `channel.on` accepts. */
  type: string;
  /** The filter that `.on` takes, e.g. `{ event: 'sync' }`. */
  filter: Record<string, unknown>;
  handler: LeaseHandler;
}

type JoinListener = (channel: RealtimeChannel) => void;

interface Lease {
  channel: RealtimeChannel;
  holders: number;
  joined: boolean;
  onJoin: Set<JoinListener>;
  /** One entry per distinct (type, filter); the Set is every holder's handler. */
  dispatch: Map<string, Set<LeaseHandler>>;
}

const leases = new Map<string, Lease>();

export interface ChannelLease {
  channel: RealtimeChannel;
  /** Idempotent: releasing twice does not drop somebody else's hold. */
  release: () => void;
}

export interface LeaseOptions {
  /** This holder's handlers. Removed again when it releases. */
  listen?: LeaseListener[];
  /**
   * Run once this holder is on a joined channel — the place for `track()`.
   * Fires immediately when the channel has already joined, so a holder that
   * arrives second is not left waiting for a `subscribe` callback that has
   * already been and gone.
   */
  onJoin?: JoinListener;
  /**
   * The join payload's `config`, unwrapped — pass `{ presence: { key } }`
   * rather than `{ config: { presence: … } }`.
   *
   * Used only when the channel is created. A later lease cannot change the
   * join payload of a channel that has already joined, and quietly pretending
   * otherwise is one of the traps this module exists to remove.
   */
  config?: NonNullable<Parameters<typeof supabase.channel>[1]>['config'];
}

/** Stable key for a (type, filter) pair, so two holders wanting the same event share one binding. */
function listenerKey(listener: LeaseListener): string {
  const filter = Object.keys(listener.filter)
    .sort()
    .map((k) => `${k}=${String(listener.filter[k])}`)
    .join('&');
  return `${listener.type}|${filter}`;
}

function attach(lease: Lease, listeners: LeaseListener[]): void {
  for (const listener of listeners) {
    const key = listenerKey(listener);
    let handlers = lease.dispatch.get(key);
    if (!handlers) {
      handlers = new Set();
      lease.dispatch.set(key, handlers);
      const fanOut = handlers;
      // One real binding per key, for the channel's whole life. Iterating a
      // copy so a handler that releases mid-dispatch cannot skip its sibling.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lease.channel as any).on(listener.type, listener.filter, (payload: unknown) => {
        for (const handler of [...fanOut]) handler(payload, lease.channel);
      });
    }
    handlers.add(listener.handler);
  }
}

function detach(lease: Lease, listeners: LeaseListener[]): void {
  for (const listener of listeners) {
    lease.dispatch.get(listenerKey(listener))?.delete(listener.handler);
  }
}

export function leaseChannel(topic: string, options: LeaseOptions = {}): ChannelLease {
  const { listen = [], onJoin, config } = options;
  let lease = leases.get(topic);

  if (!lease) {
    const channel = config ? supabase.channel(topic, { config }) : supabase.channel(topic);
    lease = {
      channel,
      holders: 1,
      joined: false,
      onJoin: new Set(),
      dispatch: new Map(),
    };
    leases.set(topic, lease);
    const held = lease;
    attach(held, listen);
    if (onJoin) held.onJoin.add(onJoin);
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      held.joined = true;
      for (const listener of [...held.onJoin]) listener(channel);
    });
    return { channel, release: releaser(topic, held, listen, onJoin) };
  }

  attach(lease, listen);
  lease.holders += 1;
  if (onJoin) {
    lease.onJoin.add(onJoin);
    if (lease.joined) onJoin(lease.channel);
  }
  return { channel: lease.channel, release: releaser(topic, lease, listen, onJoin) };
}

function releaser(
  topic: string,
  lease: Lease,
  listen: LeaseListener[],
  onJoin?: JoinListener,
): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    detach(lease, listen);
    if (onJoin) lease.onJoin.delete(onJoin);
    lease.holders -= 1;
    if (lease.holders > 0) return;
    // Last one out. Drop the map entry first, so a lease taken during teardown
    // builds a fresh channel rather than being handed one that is closing.
    if (leases.get(topic) === lease) leases.delete(topic);
    lease.onJoin.clear();
    lease.dispatch.clear();
    void supabase.removeChannel(lease.channel);
  };
}

/** Test seam. Never call this from application code. */
export function __resetChannelLeases(): void {
  leases.clear();
}
