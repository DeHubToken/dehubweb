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
 * holder releases. Handlers are registered per lease and bindings are matched
 * when a message arrives, so `.on(...)` after the join still receives — which
 * is what lets a later holder listen for its own events on a live channel.
 *
 * Only use this for a topic more than one hook can hold at once. A channel with
 * a single owner is clearer with the plain client call.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type Bind = (channel: RealtimeChannel) => void;
type JoinListener = (channel: RealtimeChannel) => void;

interface Lease {
  channel: RealtimeChannel;
  holders: number;
  joined: boolean;
  onJoin: Set<JoinListener>;
}

const leases = new Map<string, Lease>();

export interface ChannelLease {
  channel: RealtimeChannel;
  /** Idempotent: releasing twice does not drop somebody else's hold. */
  release: () => void;
}

export interface LeaseOptions {
  /** This holder's handlers. Called before the join on the first lease. */
  bind?: Bind;
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

export function leaseChannel(topic: string, options: LeaseOptions = {}): ChannelLease {
  const { bind, onJoin, config } = options;
  let lease = leases.get(topic);

  if (!lease) {
    const channel = config ? supabase.channel(topic, { config }) : supabase.channel(topic);
    lease = { channel, holders: 1, joined: false, onJoin: new Set() };
    leases.set(topic, lease);
    const held = lease;
    bind?.(channel);
    if (onJoin) held.onJoin.add(onJoin);
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      held.joined = true;
      for (const listener of held.onJoin) listener(channel);
    });
    return { channel, release: releaser(topic, held, onJoin) };
  }

  bind?.(lease.channel);
  lease.holders += 1;
  if (onJoin) {
    lease.onJoin.add(onJoin);
    if (lease.joined) onJoin(lease.channel);
  }
  return { channel: lease.channel, release: releaser(topic, lease, onJoin) };
}

function releaser(topic: string, lease: Lease, onJoin?: JoinListener): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (onJoin) lease.onJoin.delete(onJoin);
    lease.holders -= 1;
    if (lease.holders > 0) return;
    // Last one out. Drop the map entry first, so a lease taken during teardown
    // builds a fresh channel rather than being handed one that is closing.
    if (leases.get(topic) === lease) leases.delete(topic);
    lease.onJoin.clear();
    void supabase.removeChannel(lease.channel);
  };
}

/** Test seam. Never call this from application code. */
export function __resetChannelLeases(): void {
  leases.clear();
}
