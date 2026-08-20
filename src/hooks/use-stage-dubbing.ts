/**
 * Live dubbing — the paying listener's half.
 * ==========================================
 *
 * Buys a minute at a time, publishes the entitlement so the speakers' clients
 * know to generate, plays what comes back, and ducks the room underneath it.
 *
 * The generating half lives in `use-stage-captions.ts`, hanging off the same
 * finalised-line trigger as translation — one sentence produces one transcript,
 * one translation per language, and one clip per paid language.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { useStage } from '@/contexts/StageContext';
import {
  DUB_AUDIO_EVENT,
  DUB_DUCK_VOLUME,
  DUB_FULL_VOLUME,
  DUB_MAX_BACKLOG_MS,
  DUB_RENEW_LEAD_MS,
  DubPlayer,
  setDubLanguage,
  setDubToken,
  useDubLanguage,
  type StageDubAudio,
} from '@/lib/stage-dub';
import { stageCaptionChannel } from '@/lib/stage-captions';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface DubQuote {
  priceDhb: number;
  blockSeconds: number;
  clonedVoice: boolean;
}

export interface StageDubbing {
  /** null when off; a language code while paying. */
  language: string | null;
  /** What a block costs on this stage, once quoted. */
  quote: DubQuote | null;
  /** True between asking for a block and holding one. */
  starting: boolean;
  /** DHB spent on this stage this session — what the listener sees ticking. */
  spentDhb: number;
  start: (language: string) => Promise<void>;
  stop: () => void;
}

async function invokeDub<T>(body: Record<string, unknown>, wallet: string): Promise<T | null> {
  try {
    const dehubToken = await ensureFreshToken();
    if (!dehubToken) return null;
    const { data, error } = await supabase.functions.invoke('dub-session', {
      body,
      headers: { 'x-dehub-token': dehubToken, 'x-wallet-address': wallet.toLowerCase() },
    });
    if (error || !data) return null;
    return data as T;
  } catch {
    return null;
  }
}

export function useStageDubbing(spaceId: string | undefined | null, wallet: string | null): StageDubbing {
  const language = useDubLanguage();
  const { setRoomVolume } = useStage();

  const [quote, setQuote] = useState<DubQuote | null>(null);
  const [starting, setStarting] = useState(false);
  const [spentDhb, setSpentDhb] = useState(0);

  const playerRef = useRef<DubPlayer | null>(null);
  const renewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  const setRoomVolumeRef = useRef(setRoomVolume);
  setRoomVolumeRef.current = setRoomVolume;

  /** Quote is free and takes no payment — it is what the listener reads before deciding. */
  useEffect(() => {
    if (!spaceId || !wallet) { setQuote(null); return; }
    let cancelled = false;
    void (async () => {
      const data = await invokeDub<DubQuote>({ spaceId, language: 'en', quoteOnly: true }, wallet);
      if (!cancelled && data) {
        setQuote({
          priceDhb: data.priceDhb,
          blockSeconds: data.blockSeconds,
          clonedVoice: data.clonedVoice,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [spaceId, wallet]);

  const stop = useCallback(() => {
    if (renewTimerRef.current) { clearTimeout(renewTimerRef.current); renewTimerRef.current = null; }
    playerRef.current?.stop();
    playerRef.current = null;
    setDubToken(null);
    setDubLanguage(null);
    // Whatever happens, the room goes back to full. A listener left with a
    // permanently ducked stage would read as the audio being broken.
    try { setRoomVolumeRef.current(DUB_FULL_VOLUME); } catch { /* left the stage already */ }
  }, []);

  /**
   * Buy one block and arm the next.
   *
   * Renewal is a chain rather than an interval so a failure stops the chain
   * instead of retrying into an empty balance every minute.
   */
  const buyBlock = useCallback(
    async (lang: string, isFirst: boolean) => {
      if (!spaceId || !wallet) return;

      const data = await invokeDub<{
        token: string; expiresAt: number; priceDhb: number; blockSeconds: number; clonedVoice: boolean;
      }>({ spaceId, language: lang }, wallet);

      // A refusal is almost always an empty balance. Stop cleanly and say so
      // once — subtitles keep running, which is the free tier underneath.
      if (!data?.token) {
        stop();
        toast.error(
          isFirst ? 'Not enough DHB to start dubbing.' : 'Dubbing stopped — DHB ran out.',
          { description: 'Subtitles are still on.' },
        );
        return;
      }

      setDubToken(data.token);
      setSpentDhb((prev) => prev + (data.priceDhb ?? 0));

      const msUntilRenew = Math.max(1000, data.expiresAt - Date.now() - DUB_RENEW_LEAD_MS);
      renewTimerRef.current = setTimeout(() => {
        if (languageRef.current === lang) void buyBlock(lang, false);
      }, msUntilRenew);
    },
    [spaceId, wallet, stop],
  );

  const start = useCallback(
    async (lang: string) => {
      if (!spaceId || !wallet || starting) return;
      setStarting(true);
      try {
        setDubLanguage(lang);
        playerRef.current?.stop();
        playerRef.current = new DubPlayer(
          (ducked) => {
            try {
              setRoomVolumeRef.current(ducked ? DUB_DUCK_VOLUME : DUB_FULL_VOLUME);
            } catch { /* not connected */ }
          },
          (backlogMs) => {
            // Too far behind to be worth hearing. Stopping here is the honest
            // move: the listener is no longer listening to this conversation.
            if (backlogMs > DUB_MAX_BACKLOG_MS) {
              stop();
              toast.warning('Dubbing fell too far behind and stopped.', {
                description: 'Subtitles are still on.',
              });
            }
          },
        );
        await buyBlock(lang, true);
      } finally {
        setStarting(false);
      }
    },
    [spaceId, wallet, starting, buyBlock, stop],
  );

  // ─── Receive and play ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!spaceId || !language) return;

    const channel: RealtimeChannel = supabase
      .channel(`${stageCaptionChannel(spaceId)}:audio`)
      .on('broadcast', { event: DUB_AUDIO_EVENT }, ({ payload }) => {
        const clip = payload as StageDubAudio | undefined;
        if (!clip?.audio || clip.lang !== languageRef.current) return;
        playerRef.current?.enqueue(clip.id, clip.audio);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [spaceId, language]);

  // Leaving the stage, or unmounting, must never leave a meter running.
  useEffect(() => stop, [stop]);

  return { language, quote, starting, spentDhb, start, stop };
}
