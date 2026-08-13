import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emitPairEndSession,
  emitPairEnqueue,
  emitPairNext,
  emitPairSignal,
  getPairSocket,
  onPairError,
  onPairMatched,
  onPairPeerLeft,
  onPairQueued,
  onPairSignal,
  type PairIceServer,
} from '@/lib/api/dehub/pair-socket';

export type PairStatus = 'idle' | 'queued' | 'matched' | 'connected' | 'error';

export interface PairMessage {
  from: 'me' | 'them';
  text: string;
  at: number;
}

/** Batch window for outbound ICE. Each flush is one signalling round trip. */
const CANDIDATE_FLUSH_MS = 250;
/** How long a peer connection may sit in disconnected/failed before we give up. */
const LIVENESS_GRACE_MS = 5000;

/**
 * Did the media path go through TURN? Read once on connect and reported back on
 * session end — aggregated server-side this is what sizes relay bandwidth,
 * instead of guessing a relay rate.
 */
async function detectRelay(pc: RTCPeerConnection): Promise<boolean> {
  try {
    const stats = await pc.getStats();
    let selectedPairId: string | null = null;

    stats.forEach((report: any) => {
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        selectedPairId = report.selectedCandidatePairId;
      }
    });

    let relay = false;
    stats.forEach((report: any) => {
      const isSelected =
        report.type === 'candidate-pair' &&
        (report.id === selectedPairId || (report.selected && report.state === 'succeeded'));
      if (!isSelected) return;
      const local: any = stats.get(report.localCandidateId);
      const remote: any = stats.get(report.remoteCandidateId);
      if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') relay = true;
    });
    return relay;
  } catch {
    return false;
  }
}

export function usePairSession() {
  const [status, setStatus] = useState<PairStatus>('idle');
  const [messages, setMessages] = useState<PairMessage[]>([]);
  const [peerName, setPeerName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [relayUsed, setRelayUsed] = useState(false);
  const [canSend, setCanSend] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const iceServersRef = useRef<PairIceServer[]>([]);

  // Candidates that arrive before setRemoteDescription must be held back —
  // addIceCandidate throws without a remote description, and on a fast match
  // the peer's candidates routinely beat their SDP through the relay.
  const pendingRemote = useRef<RTCIceCandidateInit[]>([]);
  const outbound = useRef<RTCIceCandidateInit[]>([]);
  const flushTimer = useRef<number | null>(null);
  const livenessTimer = useRef<number | null>(null);

  const connectedRef = useRef(false);
  const relayRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (flushTimer.current) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (livenessTimer.current) {
      window.clearTimeout(livenessTimer.current);
      livenessTimer.current = null;
    }
  }, []);

  const teardownPeer = useCallback(() => {
    clearTimers();
    try {
      dcRef.current?.close();
    } catch {
      /* already closed */
    }
    try {
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    dcRef.current = null;
    pcRef.current = null;
    pendingRemote.current = [];
    outbound.current = [];
    connectedRef.current = false;
    relayRef.current = false;
    setCanSend(false);
  }, [clearTimers]);

  const flushOutbound = useCallback(() => {
    if (flushTimer.current) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const sessionId = sessionIdRef.current;
    if (!sessionId || outbound.current.length === 0) return;
    const batch = outbound.current;
    outbound.current = [];
    emitPairSignal(sessionId, 'candidates', batch);
  }, []);

  const bindChannel = useCallback((channel: RTCDataChannel) => {
    dcRef.current = channel;
    channel.onopen = () => setCanSend(true);
    channel.onclose = () => setCanSend(false);
    channel.onmessage = (e) => {
      setMessages((prev) => [...prev, { from: 'them', text: String(e.data), at: Date.now() }]);
    };
  }, []);

  /** Ends the session locally and tells the server, exactly once. */
  const finish = useCallback(
    (mode: 'end' | 'next') => {
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;

      if (sessionId) {
        if (mode === 'next') {
          emitPairNext(sessionId);
        } else {
          emitPairEndSession(sessionId, {
            connected: connectedRef.current,
            relayUsed: relayRef.current,
          });
        }
      }

      teardownPeer();
      setMessages([]);
      setPeerName(null);
      setStatus(mode === 'next' ? 'queued' : 'idle');
    },
    [teardownPeer],
  );

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current as RTCIceServer[],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        outbound.current.push(e.candidate.toJSON());
        if (!flushTimer.current) {
          flushTimer.current = window.setTimeout(flushOutbound, CANDIDATE_FLUSH_MS);
        }
      } else {
        // null candidate = gathering complete; send whatever is left.
        flushOutbound();
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;

      if (state === 'connected') {
        if (livenessTimer.current) {
          window.clearTimeout(livenessTimer.current);
          livenessTimer.current = null;
        }
        connectedRef.current = true;
        setStatus('connected');
        void detectRelay(pc).then((relay) => {
          relayRef.current = relay;
          setRelayUsed(relay);
        });
        return;
      }

      // The server cannot be relied on to notice a peer vanishing promptly, so
      // the client is the one that gives up. Without this the other side sits
      // on a dead connection indefinitely.
      if (state === 'disconnected' || state === 'failed') {
        if (livenessTimer.current) return;
        livenessTimer.current = window.setTimeout(() => {
          livenessTimer.current = null;
          if (pcRef.current !== pc) return;
          setError('Lost connection to the other person.');
          finish('end');
        }, LIVENESS_GRACE_MS);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [flushOutbound, finish]);

  const applyPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingRemote.current;
    pendingRemote.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* a candidate the browser rejects is not fatal */
      }
    }
  }, []);

  // ── Socket wiring ──────────────────────────────────────────────────────────

  useEffect(() => {
    getPairSocket();

    const offQueued = onPairQueued((data) => {
      iceServersRef.current = data?.iceServers || [];
      setStatus('queued');
    });

    const offMatched = onPairMatched(async (data) => {
      sessionIdRef.current = data.sessionId;
      setPeerName(data.peer?.username || null);
      setMessages([]);
      setStatus('matched');

      const pc = createPeer();

      if (data.role === 'caller') {
        // The caller owns the data channel; the callee receives it via
        // ondatachannel. Both sides creating one gives you two half-open pipes.
        bindChannel(pc.createDataChannel('pair'));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        emitPairSignal(data.sessionId, 'offer', offer);
      } else {
        pc.ondatachannel = (e) => bindChannel(e.channel);
      }
    });

    const offSignal = onPairSignal(async (data) => {
      const pc = pcRef.current;
      if (!pc || data.sessionId !== sessionIdRef.current) return;

      try {
        if (data.kind === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
          await applyPendingCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          emitPairSignal(data.sessionId, 'answer', answer);
        } else if (data.kind === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
          await applyPendingCandidates(pc);
        } else if (data.kind === 'candidates') {
          const list: RTCIceCandidateInit[] = Array.isArray(data.payload)
            ? data.payload
            : [data.payload];
          if (!pc.remoteDescription) {
            pendingRemote.current.push(...list);
          } else {
            for (const candidate of list) {
              try {
                await pc.addIceCandidate(candidate);
              } catch {
                /* ignore rejected candidate */
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('[Pair] signal handling failed:', err?.message || err);
      }
    });

    const offPeerLeft = onPairPeerLeft(() => {
      sessionIdRef.current = null;
      teardownPeer();
      setMessages([]);
      setPeerName(null);
      setStatus('idle');
    });

    const offError = onPairError((err) => {
      const msg = err?.msg || err?.message || 'Something went wrong.';
      // Rate limiting is advisory — it should not drop the user out of a call.
      if (err?.code === 'RATE_LIMITED') {
        setError(msg);
        return;
      }
      setError(msg);
      setStatus('error');
    });

    return () => {
      offQueued();
      offMatched();
      offSignal();
      offPeerLeft();
      offError();
    };
  }, [applyPendingCandidates, bindChannel, createPeer, teardownPeer]);

  // Leaving the page mid-session must not strand the other side.
  useEffect(() => {
    return () => {
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        emitPairEndSession(sessionId, {
          connected: connectedRef.current,
          relayUsed: relayRef.current,
        });
      }
      sessionIdRef.current = null;
      teardownPeer();
    };
  }, [teardownPeer]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const start = useCallback(() => {
    setError(null);
    setStatus('queued');
    emitPairEnqueue();
  }, []);

  const next = useCallback(() => {
    setError(null);
    finish('next');
  }, [finish]);

  const stop = useCallback(() => {
    setError(null);
    finish('end');
  }, [finish]);

  const send = useCallback((text: string) => {
    const channel = dcRef.current;
    if (!channel || channel.readyState !== 'open' || !text.trim()) return;
    channel.send(text);
    setMessages((prev) => [...prev, { from: 'me', text, at: Date.now() }]);
  }, []);

  return { status, messages, peerName, error, relayUsed, canSend, start, next, stop, send };
}
