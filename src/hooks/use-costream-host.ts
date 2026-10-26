/**
 * Co-streaming from the broadcaster
 * =================================
 * Everything the browser go-live screen needs to put other people in its
 * picture:
 *
 * - its own room: open seats, invite people, take requests, mute, remove;
 * - or someone else's room, joined from an invite while live — two creators
 *   on each other's streams, which is what a battle is.
 *
 * Either way the same three things happen: the seats are polled, the Agora
 * link is up while anyone else is on screen, and the mixer draws whoever is
 * on the link into the outgoing picture and sound.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptInvite,
  acceptRequest,
  costreamUid,
  declineInvite,
  declineRequest,
  endCoStream,
  getCoStream,
  getMyInvites,
  getMyOpenCoStream,
  inviteGuest,
  leaveSeat,
  openCoStream,
  removeGuest,
  setAcceptingRequests,
  setGuestMuted,
  type CoStreamRoom,
  type CoStreamSeat,
  type CoStreamState,
} from '@/lib/live/costream-api';
import { joinCoStreamRtc, type CoStreamRtc, type RemoteMedia } from '@/lib/live/costream-rtc';
import type { GuestMixer, GuestTile } from '@/lib/livepeer/guest-mixer';
import { createLogger } from '@/lib/logger';

const logger = createLogger('CoStreamHost');

const SEAT_POLL_MS = 3000;
const INVITE_POLL_MS = 10_000;

export interface CoStreamParticipant {
  wallet: string;
  label: string;
  seat: CoStreamSeat | null;
  /** On the Agora link right now. */
  connected: boolean;
  isHost: boolean;
}

export interface UseCoStreamHost {
  /** The room this broadcast is part of, whoever hosts it. */
  state: CoStreamState | null;
  role: 'host' | 'guest' | null;
  /** Everyone else on screen with this broadcast. */
  onScreen: CoStreamParticipant[];
  requests: CoStreamSeat[];
  invited: CoStreamSeat[];
  /** Rooms that have invited this creator, while they are live. */
  incoming: Array<CoStreamSeat & { room: CoStreamRoom }>;
  busy: boolean;
  error: string | null;
  open: () => Promise<void>;
  close: () => Promise<void>;
  invite: (wallet: string, username?: string | null) => Promise<void>;
  accept: (seatId: string) => Promise<void>;
  decline: (seatId: string) => Promise<void>;
  remove: (seatId: string) => Promise<void>;
  mute: (seatId: string, muted: boolean) => Promise<void>;
  setRequests: (accepting: boolean) => Promise<void>;
  joinInvite: (seatId: string) => Promise<void>;
  declineIncoming: (seatId: string) => Promise<void>;
  /** Guest side: step off someone else's stream. */
  leave: () => Promise<void>;
  /** Re-read the room now (after a match, say). */
  refresh: (roomId?: string) => Promise<void>;
}

export const participantLabel = (username: string | null | undefined, wallet: string) =>
  username ? `@${username.replace(/^@/, '')}` : `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

export function useCoStreamHost({
  wallet,
  username,
  streamId,
  mixer,
  live,
}: {
  wallet: string | null | undefined;
  username?: string | null;
  streamId?: string;
  mixer: GuestMixer;
  /** On air: invites are only looked for, and the link only kept, while live. */
  live: boolean;
}): UseCoStreamHost {
  const me = wallet?.toLowerCase() ?? null;
  const [state, setState] = useState<CoStreamState | null>(null);
  const [incoming, setIncoming] = useState<Array<CoStreamSeat & { room: CoStreamRoom }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remotes, setRemotes] = useState<RemoteMedia[]>([]);
  const rtcRef = useRef<CoStreamRtc | null>(null);
  const rtcRoomRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);

  const role: 'host' | 'guest' | null = !state || !me ? null : state.room.host_wallet === me ? 'host' : 'guest';
  const mySeat = role === 'guest' ? state?.seats.find((s) => s.wallet === me) ?? null : null;

  const refresh = useCallback(async (roomId?: string) => {
    const id = roomId ?? roomIdRef.current;
    if (!id) return;
    const next = await getCoStream(id);
    if (roomIdRef.current !== id && roomId === undefined) return;
    if (!next || next.room.status !== 'active') {
      roomIdRef.current = null;
      setState(null);
      return;
    }
    // A live guest who was removed, or who left, is off the room.
    if (me && next.room.host_wallet !== me) {
      const seat = next.seats.find((s) => s.wallet === me);
      if (!seat || seat.status !== 'accepted') {
        roomIdRef.current = null;
        setState(null);
        return;
      }
    }
    roomIdRef.current = id;
    setState(next);
  }, [me]);

  // Pick up a room this broadcast already has (a reload mid-stream).
  useEffect(() => {
    if (!me || !streamId) return;
    let cancelled = false;
    void getMyOpenCoStream(me).then((own) => {
      if (cancelled || roomIdRef.current) return;
      if (own && own.room.host_stream_id === streamId) {
        roomIdRef.current = own.room.id;
        setState(own);
      }
    });
    return () => { cancelled = true; };
  }, [me, streamId]);

  const openRoomId = state?.room.id ?? null;
  useEffect(() => {
    if (!openRoomId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden' && !mixer.isActive()) return;
      void refresh().catch((err) => logger.warn('Seat poll failed', err));
    }, SEAT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [openRoomId, refresh, mixer]);

  // The broadcast is over (this screen is going away): close our own room so
  // nobody is left holding a seat on a stream that has ended.
  const hostRoomRef = useRef<string | null>(null);
  hostRoomRef.current = role === 'host' ? openRoomId : null;
  useEffect(() => () => {
    const id = hostRoomRef.current;
    if (id && me) void endCoStream(me, id).catch(() => undefined);
  }, [me]);

  // Invites to other creators' rooms, only while live and not already in one.
  useEffect(() => {
    if (!me || !live || role === 'guest') { setIncoming([]); return; }
    let cancelled = false;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      void getMyInvites(me).then((list) => {
        if (!cancelled) setIncoming(list.filter((s) => s.status === 'invited' && s.room.host_wallet !== me));
      });
    };
    check();
    const timer = window.setInterval(check, INVITE_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [me, live, role]);

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }, []);

  // Who else belongs on screen, from the seats.
  const others = useMemo(() => {
    if (!state || !me) return [] as Array<{ wallet: string; label: string; seat: CoStreamSeat | null; isHost: boolean }>;
    const list: Array<{ wallet: string; label: string; seat: CoStreamSeat | null; isHost: boolean }> = [];
    if (state.room.host_wallet !== me) {
      list.push({ wallet: state.room.host_wallet, label: participantLabel(state.room.host_username, state.room.host_wallet), seat: null, isHost: true });
    }
    for (const seat of state.seats) {
      if (seat.status !== 'accepted' || seat.wallet === me) continue;
      list.push({ wallet: seat.wallet, label: participantLabel(seat.username, seat.wallet), seat, isHost: false });
    }
    return list;
  }, [state, me]);

  const wantLink = live && !!state && others.length > 0;
  const linkRoom = wantLink ? state!.room.id : null;

  // The Agora link: up while anyone else is on screen.
  useEffect(() => {
    if (!linkRoom || !me) return;
    let cancelled = false;
    let off: (() => void) | null = null;
    let offHost: (() => void) | null = null;
    void (async () => {
      try {
        const rtc = await joinCoStreamRtc(linkRoom, me);
        if (cancelled) { await rtc.leave(); return; }
        rtcRef.current = rtc;
        rtcRoomRef.current = linkRoom;
        off = rtc.onChange(() => setRemotes(rtc.remotes()));
        const publishMine = () => {
          const own = mixer.hostTracks();
          void rtc.publish(own.video, own.audio).catch((err) => logger.warn('Co-stream publish failed', err));
        };
        publishMine();
        // A camera flip or a look changes what the others should see too.
        let pending = 0;
        offHost = mixer.onHostTracksChange(() => {
          window.clearTimeout(pending);
          pending = window.setTimeout(publishMine, 300);
        });
      } catch (err) {
        logger.warn('Co-stream link failed', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not connect guests');
      }
    })();
    return () => {
      cancelled = true;
      off?.();
      offHost?.();
      const rtc = rtcRef.current;
      if (rtc && rtcRoomRef.current === linkRoom) {
        rtcRef.current = null;
        rtcRoomRef.current = null;
        void rtc.leave();
      }
      setRemotes([]);
    };
  }, [linkRoom, me, mixer]);

  // Feed the mixer: start with the first person on screen, stop with the last.
  const myLabel = participantLabel(username, me || '0x');
  useEffect(() => {
    if (!wantLink) {
      if (mixer.isActive()) void mixer.stop();
      return;
    }
    const tiles: GuestTile[] = others.map((p) => {
      const media = remotes.find((r) => r.uid === costreamUid(p.wallet));
      const muted = !!p.seat?.muted;
      if (media) rtcRef.current?.setVolume(media.uid, muted ? 0 : 100);
      return { id: p.wallet, video: media?.video ?? null, audio: media?.audio ?? null, label: p.label, muted };
    });
    if (!mixer.isActive()) {
      void mixer.start(mixer.hostTracks(), myLabel).then(() => mixer.setGuests(tiles));
    } else {
      mixer.setGuests(tiles);
    }
  }, [wantLink, others, remotes, mixer, myLabel]);

  // Off air, or unmounted: put the broadcast back to the host alone.
  useEffect(() => () => { if (mixer.isActive()) void mixer.stop(); }, [mixer]);

  const onScreen: CoStreamParticipant[] = others.map((p) => ({
    ...p,
    connected: remotes.some((r) => r.uid === costreamUid(p.wallet) && (r.video || r.audio)),
  }));

  return {
    state,
    role,
    onScreen,
    requests: role === 'host' ? state!.seats.filter((s) => s.status === 'requested') : [],
    invited: role === 'host' ? state!.seats.filter((s) => s.status === 'invited') : [],
    incoming,
    busy,
    error,
    refresh,
    open: () => run(async () => {
      if (!me || !streamId) throw new Error('Go live first');
      const next = await openCoStream(me, streamId, username);
      roomIdRef.current = next.room.id;
      setState(next);
    }),
    close: () => run(async () => {
      if (!me || !state) return;
      if (role === 'host') await endCoStream(me, state.room.id);
      else if (mySeat) await leaveSeat(me, mySeat.id);
      roomIdRef.current = null;
      setState(null);
    }),
    invite: (guest, name) => run(async () => {
      if (!me || !state || role !== 'host') return;
      if (guest.toLowerCase() === me) throw new Error('You are already on screen');
      await inviteGuest(me, state.room.id, guest, name);
      await refresh();
    }),
    accept: (seatId) => run(async () => { if (me) { await acceptRequest(me, seatId); await refresh(); } }),
    decline: (seatId) => run(async () => { if (me) { await declineRequest(me, seatId); await refresh(); } }),
    remove: (seatId) => run(async () => { if (me) { await removeGuest(me, seatId); await refresh(); } }),
    mute: (seatId, muted) => run(async () => { if (me) { await setGuestMuted(me, seatId, muted); await refresh(); } }),
    setRequests: (accepting) => run(async () => {
      if (!me || !state) return;
      await setAcceptingRequests(me, state.room.id, accepting);
      await refresh();
    }),
    joinInvite: (seatId) => run(async () => {
      if (!me) return;
      const invite = incoming.find((s) => s.id === seatId);
      if (!invite) return;
      // Our own room, if any, closes: a broadcast is in one room at a time.
      if (state && role === 'host') await endCoStream(me, state.room.id);
      await acceptInvite(me, seatId, streamId, username);
      setIncoming((list) => list.filter((s) => s.id !== seatId));
      roomIdRef.current = invite.costream_id;
      await refresh(invite.costream_id);
    }),
    declineIncoming: (seatId) => run(async () => {
      if (!me) return;
      await declineInvite(me, seatId);
      setIncoming((list) => list.filter((s) => s.id !== seatId));
    }),
    leave: () => run(async () => {
      if (!me || !mySeat) return;
      await leaveSeat(me, mySeat.id);
      roomIdRef.current = null;
      setState(null);
    }),
  };
}
