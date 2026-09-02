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
 *
 * `stage-dub-payment` is imported dynamically, never at the top. This hook is
 * reached statically from AppLayout (→ AudioSpacesModal → StageCaptions), so a
 * top-level import pulls aa-utils, wagmi and RainbowKit into the ENTRY chunk and
 * `scripts/check-entry-bundle.mjs` fails the build — which is what happened
 * between #378 and #389, taking every deploy with it. Same reason
 * `use-tip-payment` and `use-ppv-payment` reach for aa-utils behind an await.
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
import { stageCaptionChannel } from '@/lib/stage-captions';
import { leaseChannel } from '@/lib/realtime-channel-lease';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface DubQuote {
  pricePerMinuteDhb: number;
  minimumDhb: number;
  treasury: string;
  clonedVoice: boolean;
}

/**
 * A transfer that has been signed for a tab but not yet confirmed by the
 * server, kept where a reload cannot lose it.
 *
 * The money leaves the wallet before the server is told about it, so the gap
 * between those two is the dangerous one: a dropped response, a closed tab, a
 * refresh. Anything that sends a fresh transfer to cover that gap charges the
 * listener twice for one session. The hash is the receipt, so it is kept until
 * the server acknowledges it and only then thrown away.
 */
const SENT_HASH_KEY = 'dehub.dub.sentHash';

function sentHashes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SENT_HASH_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function readSentHash(spaceId: string): string | null {
  return sentHashes()[spaceId] ?? null;
}

function rememberSentHash(spaceId: string, txHash: string): void {
  try {
    localStorage.setItem(SENT_HASH_KEY, JSON.stringify({ ...sentHashes(), [spaceId]: txHash }));
  } catch { /* private mode — the in-flight settle below still uses the hash */ }
}

function forgetSentHash(spaceId: string): void {
  try {
    const all = sentHashes();
    delete all[spaceId];
    localStorage.setItem(SENT_HASH_KEY, JSON.stringify(all));
  } catch { /* nothing to clean up */ }
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
   * Ask the server what is owed and put that in front of the listener.
   *
   * The authority on the amount is the server's own count, not this hook's.
   * A tick whose response was lost still accrued a minute over there, so
   * billing `minutes × price` from here asks for less than is owed, the
   * transfer fails verification, and the DHB is gone with the tab still open.
   *
   * It is also how a stranded tab is recovered. The stage ending unmounts this
   * hook, so anything it held in state is gone; `bill` reads the tab back.
   */
  const raiseOpenTab = useCallback(
    async (forSpaceId?: string) => {
      const target = forSpaceId ?? spaceId;
      if (!target || !wallet) return false;

      const { data } = await callDub<{
        minutes: number;
        owedDhb: number;
        treasury: string;
        settled: boolean;
      }>({ action: 'bill', spaceId: target }, wallet);

      if (!data || data.settled || data.minutes <= 0 || data.owedDhb <= 0) return false;
      setBill({
        spaceId: target,
        minutes: data.minutes,
        owedDhb: data.owedDhb,
        treasury: data.treasury,
      });
      return true;
    },
    [spaceId, wallet],
  );

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
        // Shown at once so the prompt does not lag the click, then corrected
        // from the server, which is the only party whose count is authoritative.
        setBill({
          spaceId,
          minutes: used,
          owedDhb: used * quote.pricePerMinuteDhb,
          treasury: quote.treasury,
        });
        void raiseOpenTab(spaceId);
      }
      setMinutes(0);
    },
    [spaceId, quote, raiseOpenTab],
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
        const { readDhbBalance } = await import('@/lib/stage-dub-payment');
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
          if (code === 'UNSETTLED') {
            // The refusal carries the open tab, so turn it into something the
            // listener can act on. Without this the message was a dead end: the
            // tab that blocks them is usually one the stage ended out from
            // under, so there is no way back to the drawer that raised it and
            // dubbing stays refused on every stage, forever.
            await raiseOpenTab();
          } else {
            toast.error(error ?? 'Could not start dubbing.');
          }
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
      // A transfer already sent for this tab is reused rather than repeated.
      // Confirmation can fail after the DHB has left — a lost response, an
      // amount short of what the server counted — and the old code left the
      // Pay button live with the bill still on screen, which invited a second
      // transfer for the same session. The server takes the same hash twice
      // quite happily; the wallet does not get its money back.
      const sent = readSentHash(bill.spaceId);
      const { payForDubbing } = await import('@/lib/stage-dub-payment');
      const txHash = sent ?? (await payForDubbing(bill.owedDhb, bill.treasury)).txHash;
      if (!sent) rememberSentHash(bill.spaceId, txHash);

      const { data, error } = await callDub<{ ok: boolean; minutes: number; paidDhb: number }>(
        { action: 'settle', spaceId: bill.spaceId, txHash },
        wallet,
      );

      if (error || !data?.ok) {
        // The transfer is on chain either way — never tell them to send it
        // again, or they will pay twice for one session. The hash is kept, so
        // pressing Pay again retries confirmation with it rather than paying.
        toast.error(error ?? 'Payment sent but not confirmed yet.', {
          description: 'Your DHB has left your wallet. Press Pay again to retry confirming it.',
        });
        return;
      }

      forgetSentHash(bill.spaceId);
      toast.success(
        data.paidDhb > 0
          ? `Paid ${data.paidDhb} DHB for ${data.minutes} minutes of dubbing.`
          : 'Dubbing session closed.',
      );
      setBill(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setSettling(false);
    }
  }, [bill, settling, wallet]);

  /** Close the prompt without paying. The tab stays open and blocks the next session. */
  const dismissBill = useCallback(() => setBill(null), []);

  /**
   * A tab left open on this stage is put back in front of the listener when
   * they return to it.
   *
   * Without this the only way back to an unpaid tab was to be holding the
   * drawer that raised it, which the stage ending takes away. Wallet-gated, so
   * a signed-out visitor is asked nothing.
   */
  useEffect(() => {
    if (!spaceId || !wallet) return;
    let cancelled = false;
    void (async () => {
      const { data } = await callDub<{
        minutes: number;
        owedDhb: number;
        treasury: string;
        settled: boolean;
      }>({ action: 'bill', spaceId }, wallet);
      if (cancelled || !data || data.settled || data.minutes <= 0 || data.owedDhb <= 0) return;
      setBill({
        spaceId,
        minutes: data.minutes,
        owedDhb: data.owedDhb,
        treasury: data.treasury,
      });
    })();
    return () => { cancelled = true; };
  }, [spaceId, wallet]);

  // ─── Receive and play ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!spaceId || !language) return;

    // Leased: the caption publisher holds this same clip topic, so on a speaker
    // who is also dubbing both are on one object and either cleanup would close
    // it for the other.
    const lease = leaseChannel(`${stageCaptionChannel(spaceId)}:audio`, {
      bind: (chan) => {
        chan.on('broadcast', { event: DUB_AUDIO_EVENT }, ({ payload }) => {
          const clip = payload as StageDubAudio | undefined;
          if (!clip?.audio || clip.lang !== languageRef.current) return;
          playerRef.current?.enqueue(clip.id, clip.audio);
        });
      },
    });

    return () => { lease.release(); };
  }, [spaceId, language]);

  // Unmounting stops the audio and the ticking. It cannot raise the bill: the
  // host ending the stage clears the current space, which unmounts the button
  // this hook lives in, so there is no longer anything on screen to show a
  // prompt in. The tab stays open on the server and is picked up again by
  // `raiseOpenTab` — on the next visit to this stage, or on the next attempt to
  // start dubbing anywhere, which the server refuses while a tab is open.
  //
  // The language is cleared alongside the token. Leaving it set was what put
  // "Stop dubbing" in the menu after a stage ended, with no player, no timer
  // and no entitlement behind it.
  useEffect(() => {
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      playerRef.current?.stop();
      setDubToken(null);
      setDubLanguage(null);
      try { setRoomVolumeRef.current(DUB_FULL_VOLUME); } catch { /* already left the stage */ }
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
