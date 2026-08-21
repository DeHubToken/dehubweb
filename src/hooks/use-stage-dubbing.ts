/**
 * Live dubbing — the paying listener's half.
 * ==========================================
 *
 * Opens a tab, not a meter. Starting checks the wallet can afford it and
 * charges nothing; each minute silently ticks a counter on the server; when
 * the stage ends the listener sees what they used and confirms once.
 *
 * No wallet interaction happens anywhere in here. The only on-chain step in
 * the whole feature is topping up DHB, which happens in the wallet long before
 * any of this — the tab draws against that deposit.
 *
 * The generating half lives in `use-stage-captions.ts`, hanging off the same
 * finalised-line trigger as translation.
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
  DUB_TICK_MS,
  DubPlayer,
  setDubLanguage,
  setDubToken,
  useDubLanguage,
  type StageDubAudio,
} from '@/lib/stage-dub';
import { payForDubbing, readDhbBalance } from '@/lib/stage-dub-payment';
import { stageCaptionChannel } from '@/lib/stage-captions';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface DubQuote {
  pricePerMinuteDhb: number;
  minimumDhb: number;
  treasury: string;
  clonedVoice: boolean;
}

/** What the listener is asked to confirm once the stage ends. */
export interface DubBill {
  spaceId: string;
  minutes: number;
  owedDhb: number;
  /** Where the DHB goes. Served by the function so it is never hard-coded twice. */
  treasury: string;
}

export interface StageDubbing {
  language: string | null;
  quote: DubQuote | null;
  starting: boolean;
  /** Minutes counted by the server so far this session. */
  minutes: number;
  /** Set when there is a tab waiting to be confirmed and paid. */
  bill: DubBill | null;
  settling: boolean;
  start: (language: string) => Promise<void>;
  stop: () => void;
  settle: () => Promise<void>;
  dismissBill: () => void;
}

async function callDub<T>(body: Record<string, unknown>, wallet: string | null): Promise<{ data: T | null; error: string | null; code?: string }> {
  try {
    const headers: Record<string, string> = {};
    if (wallet) {
      const dehubToken = await ensureFreshToken();
      if (!dehubToken) return { data: null, error: 'signed out' };
      headers['x-dehub-token'] = dehubToken;
      headers['x-wallet-address'] = wallet.toLowerCase();
    }
    const { data, error } = await supabase.functions.invoke('dub-session', { body, headers });
    // supabase-js folds a non-2xx into `error` and still hands back the parsed
    // body, which is where our own code and numbers live — so read both.
    const payload = data as (T & { error?: string; code?: string }) | null;
    if (payload?.error) return { data: null, error: payload.error, code: payload.code };
    if (error) return { data: null, error: error.message ?? 'request failed' };
    return { data: payload as T, error: null };
  } catch {
    return { data: null, error: 'request failed' };
  }
}

export function useStageDubbing(spaceId: string | undefined | null, wallet: string | null): StageDubbing {
  const language = useDubLanguage();
  const { setRoomVolume } = useStage();

  const [quote, setQuote] = useState<DubQuote | null>(null);
  const [starting, setStarting] = useState(false);
  const [settling, setSettling] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [bill, setBill] = useState<DubBill | null>(null);

  const playerRef = useRef<DubPlayer | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  const minutesRef = useRef(0);
  minutesRef.current = minutes;
  const setRoomVolumeRef = useRef(setRoomVolume);
  setRoomVolumeRef.current = setRoomVolume;

  /** The price and whether this stage has the host's voice. Free, and takes no wallet. */
  useEffect(() => {
    if (!spaceId) { setQuote(null); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await callDub<DubQuote>({ action: 'quote', spaceId }, null);
      if (!cancelled && data) setQuote(data);
    })();
    return () => { cancelled = true; };
  }, [spaceId]);

  /**
   * Stop listening. Deliberately does NOT settle — the tab stays open so the
   * listener confirms it deliberately rather than being charged by the act of
   * closing a drawer.
   */
  const stop = useCallback(
    (raiseBill = true) => {
      if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
      playerRef.current?.stop();
      playerRef.current = null;
      setDubToken(null);
      setDubLanguage(null);
      try { setRoomVolumeRef.current(DUB_FULL_VOLUME); } catch { /* already left the stage */ }

      const used = minutesRef.current;
      if (raiseBill && used > 0 && spaceId && quote) {
        setBill({
          spaceId,
          minutes: used,
          owedDhb: used * quote.pricePerMinuteDhb,
          treasury: quote.treasury,
        });
      }
      setMinutes(0);
    },
    [spaceId, quote],
  );

  const tick = useCallback(async () => {
    const lang = languageRef.current;
    if (!spaceId || !wallet || !lang) return;

    const { data, error, code } = await callDub<{ token: string; minutes: number; owedDhb: number }>(
      { action: 'tick', spaceId, language: lang },
      wallet,
    );

    if (error || !data?.token) {
      stop();
      toast.warning(
        'Dubbing stopped.',
        { description: 'Subtitles are still on.' },
      );
      return;
    }

    setDubToken(data.token);
    setMinutes(data.minutes);
  }, [spaceId, wallet, stop]);

  const start = useCallback(
    async (lang: string) => {
      if (!spaceId || !wallet || starting) return;
      setStarting(true);
      try {
        // Check the wallet can cover a reasonable session before starting one.
        // The real enforcement is that a tab cannot be closed without a
        // transfer landing on chain — this is here so nobody discovers they
        // are short only after listening for twenty minutes.
        const held = await readDhbBalance();
        if (quote && held < quote.minimumDhb) {
          toast.error('Not enough DHB for dubbing.', {
            description: `You need about ${quote.minimumDhb.toLocaleString()} DHB and hold ${Math.floor(held).toLocaleString()}.`,
          });
          return;
        }

        const { data, error, code } = await callDub<{ token: string; pricePerMinuteDhb: number }>(
          { action: 'start', spaceId, language: lang },
          wallet,
        );

        if (error || !data?.token) {
          toast.error(
            code === 'UNSETTLED'
              ? 'Settle your last dubbing session first.'
              : error ?? 'Could not start dubbing.',
          );
          return;
        }

        setDubToken(data.token);
        setDubLanguage(lang);
        setMinutes(0);

        playerRef.current?.stop();
        playerRef.current = new DubPlayer(
          (ducked) => {
            try { setRoomVolumeRef.current(ducked ? DUB_DUCK_VOLUME : DUB_FULL_VOLUME); } catch { /* not connected */ }
          },
          (backlogMs) => {
            if (backlogMs > DUB_MAX_BACKLOG_MS) {
              stop();
              toast.warning('Dubbing fell too far behind and stopped.', {
                description: 'You are only charged for the minutes you heard.',
              });
            }
          },
        );

        // The first minute is counted a minute in, not on start: a listener who
        // changes their mind in the first few seconds owes nothing.
        tickTimerRef.current = setInterval(() => { void tick(); }, DUB_TICK_MS);
      } finally {
        setStarting(false);
      }
    },
    [spaceId, wallet, starting, quote, stop, tick],
  );

  const settle = useCallback(async () => {
    if (!bill || settling) return;
    setSettling(true);
    try {
      // One signature, for the minutes actually heard, in the DHB the listener
      // already holds. The chain confirms it; we do not take their word.
      const payment = await payForDubbing(bill.owedDhb, bill.treasury);

      const { data, error } = await callDub<{ ok: boolean; minutes: number; paidDhb: number }>(
        { action: 'settle', spaceId: bill.spaceId, txHash: payment.txHash },
        wallet,
      );

      if (error || !data?.ok) {
        // The transfer is on chain either way — never tell them to send it
        // again, or they will pay twice for one session.
        toast.error(error ?? 'Payment sent but not confirmed yet.', {
          description: 'Your DHB has left your wallet. Reopen the stage to confirm it.',
        });
        return;
      }

      toast.success(`Paid ${data.paidDhb} DHB for ${data.minutes} minutes of dubbing.`);
      setBill(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setSettling(false);
    }
  }, [bill, settling, wallet]);

  /** Close the prompt without paying. The tab stays open and blocks the next session. */
  const dismissBill = useCallback(() => setBill(null), []);

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

  // Unmounting must stop the audio and the ticking, and raise the bill — a
  // listener who closes the drawer mid-stage still owes what they heard.
  useEffect(() => {
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      playerRef.current?.stop();
      setDubToken(null);
    };
  }, []);

  return {
    language,
    quote,
    starting,
    minutes,
    bill,
    settling,
    start,
    stop: () => stop(true),
    settle,
    dismissBill,
  };
}
