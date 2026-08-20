/**
 * Live stage captions — the speaker half and the listener half.
 * =============================================================
 *
 * `useStageCaptionPublisher` runs inside StageProvider, so it lives as long as
 * the stage does rather than as long as the room UI is on screen — minimising
 * the stage must not stop captioning the person who minimised it.
 *
 * `useStageCaptionFeed` is what any surface showing the room calls. It is
 * read-only, needs no credential, and costs a listener nothing but a realtime
 * subscription.
 *
 * See `@/lib/stage-captions` for why the work is split per-speaker rather than
 * done once over the room mix.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import {
  CAPTION_EVENT,
  CAPTION_FINAL_TTL_MS,
  CAPTION_INTERIM_TTL_MS,
  CAPTION_MAX_LINES,
  CAPTION_SOURCE_LANGUAGE,
  CAPTION_TRANSLATION_EVENT,
  emitLocalCaption,
  onLocalCaption,
  onLocalTranslation,
  emitLocalTranslation,
  useCaptionLanguage,
  stageCaptionChannel,
  useSendCaptions,
  type StageCaptionMessage,
  type StageCaptionTranslation,
} from '@/lib/stage-captions';
import type { RealtimeChannel } from '@supabase/supabase-js';

const PCM_WORKLET_URL = '/dehub-caption-pcm.js';
const PCM_WORKLET_NAME = 'dehub-caption-pcm';

/**
 * RMS above which a frame counts as somebody talking. Room tone and fan noise
 * sit an order of magnitude below this; normal speech is several times above.
 */
const VOICE_RMS_THRESHOLD = 0.012;
/**
 * Close the socket after this long without speech. Deepgram bills the audio it
 * is streamed, so an unmuted co-host who says nothing for an hour should not
 * cost an hour. Reopening is fast and the pre-roll below covers the gap.
 */
const SILENCE_CLOSE_MS = 45_000;
/**
 * Frames kept while the socket is shut, replayed the moment it opens. Without
 * this, gating on speech would clip the first word of every sentence that
 * follows a pause — which is most of them.
 */
const PREROLL_FRAMES = 16; // ~1s at ~64ms per frame
/** Interim lines are re-sent no faster than this. Finals always go immediately. */
const INTERIM_THROTTLE_MS = 350;
/** Deepgram drops an idle socket after ~10s; this keeps a paused one alive. */
const KEEPALIVE_MS = 8000;

type CredentialScheme = 'bearer' | 'token';

interface CaptionCredential {
  token: string;
  scheme: CredentialScheme;
  params: Record<string, string>;
}

async function fetchCaptionCredential(spaceId: string, wallet: string): Promise<CaptionCredential | null> {
  try {
    const dehubToken = await ensureFreshToken();
    if (!dehubToken) return null;
    const { data, error } = await supabase.functions.invoke('stage-caption-token', {
      body: { spaceId },
      headers: {
        'x-dehub-token': dehubToken,
        'x-wallet-address': wallet.toLowerCase(),
      },
    });
    if (error || !data?.token) return null;
    return {
      token: data.token as string,
      scheme: (data.scheme as CredentialScheme) ?? 'token',
      params: (data.params as Record<string, string>) ?? {},
    };
  } catch {
    // Captions are an enhancement. A missing or not-yet-deployed function must
    // leave the stage exactly as it was, not surface an error at the speaker.
    return null;
  }
}

function newUtteranceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface CaptionPublisherOptions {
  spaceId: string | null;
  /** Only a speaker has a microphone in the room; a listener has nothing to caption. */
  isSpeaker: boolean;
  /** Muted must mean not transcribed — see the graph gate below. */
  isMuted: boolean;
  wallet: string | null;
  name: string;
  /** The pre-effects microphone stream, straight from getUserMedia. */
  getRawStream: () => MediaStream | null;
}

export interface CaptionPublisher {
  /**
   * Caption a clip whose words we already know — TTS, or a named soundboard
   * sound. No transcription involved, and it lands with the audio rather than
   * a second behind it.
   */
  publishAi: (text: string, name: string) => void;
}

export function useStageCaptionPublisher(options: CaptionPublisherOptions): CaptionPublisher {
  const { spaceId, isSpeaker, isMuted, wallet, name, getRawStream } = options;
  const sendCaptions = useSendCaptions();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const identityRef = useRef({ wallet, name });
  identityRef.current = { wallet, name };

  /** Languages a listener is reading right now, from Realtime presence. */
  const activeLanguagesRef = useRef<string[]>([]);
  /**
   * Lines already translated this stage, keyed `lang:text`. A host's stock
   * intro, a repeated question and "thanks for joining" are free after the
   * first time. Cleared wholesale rather than evicted per-entry when it grows
   * — the point is a cheap hit rate, not a correct LRU.
   */
  const translationCacheRef = useRef<Map<string, string>>(new Map());
  /** The previous finished sentence, handed to the translator as context only. */
  const previousFinalRef = useRef('');
  const translateRef = useRef<((message: StageCaptionMessage) => void) | null>(null);

  // ─── The broadcast channel ────────────────────────────────────────────────
  // Held for any speaker, not only one with transcription switched on: a TTS
  // clip is captionable whether or not the speaker's own microphone is.
  //
  // Presence is enabled here so this client can see which languages the room
  // is reading. That set — not the picker — decides what gets translated, so
  // fourteen languages on offer cost whatever two or three people chose.
  useEffect(() => {
    if (!spaceId || !isSpeaker) return;
    const channel = supabase.channel(stageCaptionChannel(spaceId), {
      config: { presence: { key: `speaker-${Math.random().toString(36).slice(2, 10)}` } },
    });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ lang?: string }>();
      const languages = new Set<string>();
      for (const entries of Object.values(state)) {
        for (const entry of entries) {
          if (entry.lang && entry.lang !== CAPTION_SOURCE_LANGUAGE) languages.add(entry.lang);
        }
      }
      activeLanguagesRef.current = [...languages];
    });
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      activeLanguagesRef.current = [];
    };
  }, [spaceId, isSpeaker]);

  const spaceIdRef = useRef(spaceId);
  spaceIdRef.current = spaceId;

  const publishTranslation = useCallback((spaceKey: string, payload: StageCaptionTranslation) => {
    if (!Object.keys(payload.translations).length) return;
    emitLocalTranslation(spaceKey, payload);
    channelRef.current
      ?.send({ type: 'broadcast', event: CAPTION_TRANSLATION_EVENT, payload })
      .catch(() => {
        /* the viewer falls back to the source line — better than a retry storm */
      });
  }, []);

  /**
   * Translate one finished line into every language the room is reading, and
   * broadcast the result.
   *
   * Fire-and-forget on purpose: nothing upstream should wait on a translation,
   * and a failure means viewers read the source line for that sentence rather
   * than losing the caption.
   */
  const translate = useCallback(
    async (message: StageCaptionMessage) => {
      const id = spaceIdRef.current;
      const wallet = identityRef.current.wallet;
      const languages = activeLanguagesRef.current;
      if (!id || !wallet || !languages.length || !message.text) return;

      const cache = translationCacheRef.current;
      const fromCache: Record<string, string> = {};
      const missing: string[] = [];
      for (const lang of languages) {
        const hit = cache.get(`${lang}:${message.text}`);
        if (hit) fromCache[lang] = hit;
        else missing.push(lang);
      }
      if (!missing.length) {
        publishTranslation(id, { id: message.id, translations: fromCache });
        return;
      }

      try {
        const dehubToken = await ensureFreshToken();
        if (!dehubToken) return;
        const { data, error } = await supabase.functions.invoke('translate-caption', {
          body: {
            spaceId: id,
            lineId: message.id,
            text: message.text,
            // Context disambiguates pronouns and homonyms across a sentence
            // boundary. It roughly doubles input tokens on a workload where
            // input is already the cheap half.
            context: previousFinalRef.current,
            languages: missing,
          },
          headers: { 'x-dehub-token': dehubToken, 'x-wallet-address': wallet.toLowerCase() },
        });
        if (error || !data?.translations) return;

        const fresh = data.translations as Record<string, string>;
        if (cache.size > 400) cache.clear();
        for (const [lang, text] of Object.entries(fresh)) {
          cache.set(`${lang}:${message.text}`, text);
        }
        publishTranslation(id, { id: message.id, translations: { ...fromCache, ...fresh } });
      } catch {
        /* not deployed, offline, rate limited — viewers keep the source line */
      }
    },
    [publishTranslation],
  );
  translateRef.current = translate;

  const send = useCallback((message: StageCaptionMessage) => {
    const id = spaceIdRef.current;
    if (!id) return;
    // Our own overlay first, with no round trip — see emitLocalCaption.
    emitLocalCaption(id, message);
    channelRef.current
      ?.send({ type: 'broadcast', event: CAPTION_EVENT, payload: message })
      .catch(() => {
        /* a dropped caption is not worth a retry — the next one is 350ms away */
      });

    // Finals only. An interim is rewritten every ~350ms, so translating one
    // would cost an order of magnitude more to produce subtitles that change
    // under the reader.
    if (message.final && message.text) {
      void translateRef.current?.(message);
      previousFinalRef.current = message.text;
    }
  }, []);

  const publishAi = useCallback(
    (text: string, label: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const me = identityRef.current;
      send({
        id: newUtteranceId(),
        wallet: (me.wallet || '').toLowerCase(),
        name: label,
        text: trimmed.slice(0, 500),
        final: true,
        kind: 'ai',
        at: Date.now(),
      });
    },
    [send],
  );

  // ─── Microphone → Deepgram → broadcast ────────────────────────────────────
  //
  // Gated on `!isMuted` deliberately. toggleMute disables the *processed*
  // track that Agora publishes, not the raw getUserMedia stream this reads —
  // so without this gate a muted speaker would keep being transcribed to the
  // whole room, which is the one behaviour a mute button must never have.
  const active = !!spaceId && isSpeaker && sendCaptions && !isMuted && !!wallet;

  useEffect(() => {
    if (!active || !spaceId || !wallet) return;

    let disposed = false;
    let ctx: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let workletNode: AudioWorkletNode | null = null;
    let socket: WebSocket | null = null;
    let keepalive: ReturnType<typeof setInterval> | null = null;
    let silenceTimer: ReturnType<typeof setInterval> | null = null;

    let credential: CaptionCredential | null = null;
    /** Set once if the account cannot serve `language=multi`; the retry pins English. */
    let forceEnglish = false;
    let connecting = false;
    let openedAt = 0;
    let lastVoiceAt = 0;
    let failures = 0;

    const preroll: ArrayBuffer[] = [];
    let utteranceId = newUtteranceId();
    let finalisedText = '';
    let lastInterimAt = 0;

    const emitLine = (text: string, final: boolean) => {
      const me = identityRef.current;
      send({
        id: utteranceId,
        wallet: (me.wallet || '').toLowerCase(),
        name: me.name,
        text,
        final,
        kind: 'speech',
        at: Date.now(),
      });
    };

    const closeSocket = (graceful: boolean) => {
      // A reopened socket starts a new sentence. Carrying a half-finished
      // utterance across a silence gap would glue two unrelated thoughts into
      // one caption line minutes apart.
      finalisedText = '';
      utteranceId = newUtteranceId();
      lastInterimAt = 0;
      if (keepalive) { clearInterval(keepalive); keepalive = null; }
      const s = socket;
      socket = null;
      if (!s) return;
      try {
        if (graceful && s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ type: 'CloseStream' }));
        s.close();
      } catch {
        /* already gone */
      }
    };

    const handleResults = (msg: any) => {
      const transcript: string = msg?.channel?.alternatives?.[0]?.transcript ?? '';
      const text = transcript.trim();
      if (!text) return;

      if (msg.is_final) {
        finalisedText = finalisedText ? `${finalisedText} ${text}` : text;
      }
      const display = msg.is_final ? finalisedText : (finalisedText ? `${finalisedText} ${text}` : text);

      if (msg.speech_final) {
        emitLine(display, true);
        finalisedText = '';
        utteranceId = newUtteranceId();
        lastInterimAt = 0;
        return;
      }

      const now = Date.now();
      if (now - lastInterimAt < INTERIM_THROTTLE_MS) return;
      lastInterimAt = now;
      emitLine(display, false);
    };

    const openSocket = async () => {
      if (disposed || socket || connecting) return;
      connecting = true;
      try {
        // Credentials expire in minutes, so each connect gets a fresh one
        // rather than caching one that will be stale by the next silence gap.
        credential = await fetchCaptionCredential(spaceId, wallet);
        if (disposed || !credential) return;

        const params = new URLSearchParams({
          model: 'nova-3',
          language: 'multi',
          encoding: 'linear16',
          sample_rate: '16000',
          channels: '1',
          interim_results: 'true',
          smart_format: 'true',
          punctuate: 'true',
          endpointing: '300',
          ...credential.params,
        });
        if (forceEnglish) params.set('language', 'en');

        const ws = new WebSocket(
          `wss://api.deepgram.com/v1/listen?${params.toString()}`,
          [credential.scheme, credential.token],
        );
        socket = ws;
        openedAt = Date.now();

        ws.onopen = () => {
          if (disposed) { closeSocket(true); return; }
          failures = 0;
          // Replay the moments before the socket was ready so the sentence
          // that woke it up is captioned from its first word.
          for (const frame of preroll.splice(0)) {
            try { ws.send(frame); } catch { /* closing */ }
          }
          keepalive = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try { ws.send(JSON.stringify({ type: 'KeepAlive' })); } catch { /* closing */ }
            }
          }, KEEPALIVE_MS);
        };

        ws.onmessage = (event) => {
          if (typeof event.data !== 'string') return;
          try {
            const msg = JSON.parse(event.data);
            if (msg?.type === 'Results') handleResults(msg);
          } catch {
            /* not JSON — nothing we can act on */
          }
        };

        ws.onerror = () => {
          /* onclose runs next and carries the reason; nothing useful to do twice */
        };

        ws.onclose = (event) => {
          if (keepalive) { clearInterval(keepalive); keepalive = null; }
          if (socket === ws) socket = null;
          if (disposed) return;

          // A socket that dies within seconds of opening was refused, not
          // dropped. The overwhelmingly likely cause is an account without
          // multilingual nova-3, so pin English once and try again rather than
          // leaving the speaker silently uncaptioned.
          const refusedImmediately = Date.now() - openedAt < 3000;
          if (refusedImmediately && !forceEnglish && event.code !== 1000) {
            forceEnglish = true;
            void openSocket();
            return;
          }
          if (refusedImmediately && event.code !== 1000) {
            failures += 1;
            if (failures >= 3) {
              console.warn('[stage-captions] giving up after repeated socket failures', event.code, event.reason);
              return;
            }
            setTimeout(() => { void openSocket(); }, 1000 * failures);
          }
        };
      } finally {
        connecting = false;
      }
    };

    void (async () => {
      const raw = getRawStream();
      if (!raw || disposed) return;

      try {
        // Its own AudioContext, not the voice-effects one: switching effect
        // closes and rebuilds that context, and captions should not stop
        // because somebody picked a robot voice.
        ctx = new AudioContext();
        await ctx.audioWorklet.addModule(PCM_WORKLET_URL);
        if (disposed) return;
        await ctx.resume();

        sourceNode = ctx.createMediaStreamSource(raw);
        workletNode = new AudioWorkletNode(ctx, PCM_WORKLET_NAME);
        sourceNode.connect(workletNode);
        // Not connected to ctx.destination on purpose — this branch exists to
        // be measured, never heard. A worklet with no output still runs.

        workletNode.port.onmessage = (event: MessageEvent) => {
          const { pcm, level } = event.data as { pcm: ArrayBuffer; level: number };
          if (level > VOICE_RMS_THRESHOLD) lastVoiceAt = Date.now();

          if (socket && socket.readyState === WebSocket.OPEN) {
            try { socket.send(pcm); } catch { /* closing */ }
            return;
          }

          preroll.push(pcm);
          if (preroll.length > PREROLL_FRAMES) preroll.shift();
          if (level > VOICE_RMS_THRESHOLD) void openSocket();
        };

        silenceTimer = setInterval(() => {
          if (socket && lastVoiceAt && Date.now() - lastVoiceAt > SILENCE_CLOSE_MS) {
            closeSocket(true);
          }
        }, 5000);
      } catch (err) {
        console.warn('[stage-captions] could not start local transcription', err);
      }
    })();

    return () => {
      disposed = true;
      if (silenceTimer) clearInterval(silenceTimer);
      closeSocket(true);
      try { workletNode?.port.close(); } catch { /* noop */ }
      try { workletNode?.disconnect(); } catch { /* noop */ }
      try { sourceNode?.disconnect(); } catch { /* noop */ }
      try { void ctx?.close(); } catch { /* noop */ }
    };
  }, [active, spaceId, wallet, getRawStream, send]);

  return useMemo(() => ({ publishAi }), [publishAi]);
}

// ─── Listener side ───────────────────────────────────────────────────────────

export interface StageCaptionLine {
  id: string;
  wallet: string;
  name: string;
  text: string;
  final: boolean;
  kind: 'speech' | 'ai';
  at: number;
  /** Language code → this line in that language. Arrives after the source line. */
  translations?: Record<string, string>;
}

/**
 * Fold one caption into the visible set.
 *
 * Replaces in place when the utterance is already on screen. Appending instead
 * would make a line jump to the bottom on every interim update, so two people
 * talking at once would swap positions several times a second and neither
 * would be readable.
 *
 * Translations already attached to the line are carried across. They arrive on
 * their own event, after the final that triggered them, and a later caption
 * update for the same utterance must not drop them.
 */
function foldCaption(lines: StageCaptionLine[], next: StageCaptionLine): StageCaptionLine[] {
  const existing = lines.findIndex((line) => line.id === next.id);
  if (existing >= 0) {
    const copy = lines.slice();
    const prior = copy[existing];
    copy[existing] = prior.translations
      ? { ...next, translations: { ...prior.translations, ...next.translations } }
      : next;
    return copy;
  }
  return [...lines, next].slice(-CAPTION_MAX_LINES);
}

/** Attach a translation to the line it belongs to, if that line is still on screen. */
function foldTranslation(
  lines: StageCaptionLine[],
  payload: StageCaptionTranslation,
): StageCaptionLine[] {
  const index = lines.findIndex((line) => line.id === payload.id);
  // The line already expired, or belongs to a stage we are no longer watching.
  // Nothing to attach it to, and inventing a line for it would resurrect text
  // the viewer has already scrolled past.
  if (index < 0) return lines;
  const copy = lines.slice();
  copy[index] = {
    ...copy[index],
    translations: { ...copy[index].translations, ...payload.translations },
  };
  return copy;
}

function toLine(message: StageCaptionMessage, wallet: string): StageCaptionLine {
  return {
    id: message.id,
    wallet,
    name: message.name || 'Speaker',
    text: message.text.slice(0, 500),
    final: !!message.final,
    kind: message.kind === 'ai' ? 'ai' : 'speech',
    // Sender clocks disagree; stamping on arrival keeps expiry honest.
    at: Date.now(),
  };
}

/**
 * Subscribe to a stage's captions, in the language this viewer chose.
 *
 * Broadcast payloads carry no verified sender, so every line off the wire is
 * checked against the stage's current host/speaker roster before it is shown.
 * That stops a listener writing words into a speaker's mouth. It does not stop
 * a *speaker* sending text they did not say — but a speaker can already say
 * anything out loud, so the roster is the meaningful boundary.
 *
 * Captions this client produced arrive on the local bus instead and skip the
 * check: they never touched the network, and a client that is publishing is by
 * definition seated.
 *
 * The chosen language is published over Realtime presence. That is not a
 * cosmetic detail — it is what the speakers' clients read to decide which
 * languages to pay to translate into, so a viewer who picks Turkish is the
 * reason Turkish gets translated, and a room where nobody picks it never
 * spends a penny on it.
 */
export function useStageCaptionFeed(
  spaceId: string | undefined | null,
  enabled: boolean,
): StageCaptionLine[] {
  const [lines, setLines] = useState<StageCaptionLine[]>([]);
  const language = useCaptionLanguage();
  const allowedRef = useRef<Set<string>>(new Set());
  const lastRosterFetchRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;

  const refreshRoster = useCallback(async () => {
    if (!spaceId) return;
    lastRosterFetchRef.current = Date.now();
    const [{ data: seats }, { data: stage }] = await Promise.all([
      supabase
        .from('space_participants')
        .select('wallet_address, role')
        .eq('space_id', spaceId)
        .is('left_at', null),
      supabase.from('audio_spaces').select('host_wallet_address').eq('id', spaceId).maybeSingle(),
    ]);
    const next = new Set<string>();
    for (const seat of seats ?? []) {
      if (seat.role === 'host' || seat.role === 'speaker') {
        next.add(String(seat.wallet_address || '').toLowerCase());
      }
    }
    if (stage?.host_wallet_address) next.add(String(stage.host_wallet_address).toLowerCase());
    allowedRef.current = next;
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId || !enabled) {
      setLines([]);
      return;
    }

    void refreshRoster();

    const channel = supabase.channel(stageCaptionChannel(spaceId), {
      config: { presence: { key: `viewer-${Math.random().toString(36).slice(2, 10)}` } },
    });

    channel
      .on('broadcast', { event: CAPTION_EVENT }, ({ payload }) => {
        const message = payload as StageCaptionMessage | undefined;
        if (!message?.id || typeof message.text !== 'string') return;

        const wallet = String(message.wallet || '').toLowerCase();
        if (!allowedRef.current.has(wallet)) {
          // Probably somebody promoted since the last roster read rather than
          // an impostor. Re-read (at most every 10s) and let their next interim
          // through — that costs the speaker under a second of caption, where
          // trusting the payload would cost everyone the guarantee.
          if (Date.now() - lastRosterFetchRef.current > 10_000) void refreshRoster();
          return;
        }

        setLines((prev) => foldCaption(prev, toLine(message, wallet)));
      })
      .on('broadcast', { event: CAPTION_TRANSLATION_EVENT }, ({ payload }) => {
        const translation = payload as StageCaptionTranslation | undefined;
        if (!translation?.id || !translation.translations) return;
        // No roster check needed: a translation can only attach to a line that
        // already passed one, and it cannot create a line of its own.
        setLines((prev) => foldTranslation(prev, translation));
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        void channel.track({ lang: languageRef.current ?? CAPTION_SOURCE_LANGUAGE });
      });

    channelRef.current = channel;

    const unsubscribeCaption = onLocalCaption((localSpaceId, message) => {
      if (localSpaceId !== spaceId || !message?.id) return;
      setLines((prev) => foldCaption(prev, toLine(message, String(message.wallet || '').toLowerCase())));
    });

    const unsubscribeTranslation = onLocalTranslation((localSpaceId, payload) => {
      if (localSpaceId !== spaceId || !payload?.id) return;
      setLines((prev) => foldTranslation(prev, payload));
    });

    const sweeper = setInterval(() => {
      const now = Date.now();
      setLines((prev) => {
        const kept = prev.filter((line) =>
          now - line.at < (line.final ? CAPTION_FINAL_TTL_MS : CAPTION_INTERIM_TTL_MS),
        );
        return kept.length === prev.length ? prev : kept;
      });
    }, 1000);

    return () => {
      clearInterval(sweeper);
      unsubscribeCaption();
      unsubscribeTranslation();
      supabase.removeChannel(channel);
      channelRef.current = null;
      setLines([]);
    };
  }, [spaceId, enabled, refreshRoster]);

  // Re-publish the choice without tearing the subscription down. Putting
  // `language` in the effect above would resubscribe on every change, dropping
  // captions for the second it takes to rejoin — exactly while the viewer is
  // looking at them.
  useEffect(() => {
    channelRef.current?.track({ lang: language ?? CAPTION_SOURCE_LANGUAGE }).catch(() => {
      /* not subscribed yet — the subscribe callback tracks the current value */
    });
  }, [language]);

  return lines;
}
