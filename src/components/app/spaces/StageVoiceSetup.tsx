/**
 * Setting up the voice a stage gets dubbed in.
 * ============================================
 *
 * Shown when a host asks to be dubbed in their own voice, BEFORE the stage
 * opens — record, pay, done, and the room goes live with the voice already in
 * place. It used to happen invisibly thirty seconds into the broadcast, which
 * meant the host never agreed to a specific thing, never knew whether it
 * worked, and (because nothing saved the result) never actually got a voice.
 *
 * The order on screen is the order of the decision: what this does, what it
 * costs, record, pay. Nothing is charged until the last button, and two paths
 * never charge at all — a host who has paid before is switching their voice
 * back on, and a host whose last attempt failed after paying finishes on the
 * credit that is still on the books.
 *
 * Owning a voice already is NOT one of those paths. Cloning is free elsewhere
 * in the app, so the fee buys stage dubbing rather than the audio; what an
 * existing voice buys is skipping the recording step.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DhbAmount, DhbCoin } from '@/components/app/DhbAmount';
import { Mic, Square, Upload, Loader2, ChevronLeft, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  enableStageVoice,
  fetchVoiceCloneStatus,
  purchaseStageVoice,
  VoiceCloneError,
  type VoiceCloneStatus,
} from '@/lib/stage-voice-clone';

/** ElevenLabs wants ten seconds of clean speech; asking for fifteen leaves room. */
const MIN_SECONDS = 15;
const MAX_SECONDS = 60;

interface StageVoiceSetupProps {
  wallet: string | null;
  displayName: string;
  /** Ran once the wallet owns a stage voice — the caller ticks its box and moves on. */
  onReady: () => void;
  /** Backing out. The consent box goes back to off; dubbing falls back to the stock voice. */
  onCancel: () => void;
}

export function StageVoiceSetup({ wallet, displayName, onReady, onCancel }: StageVoiceSetupProps) {
  const [status, setStatus] = useState<VoiceCloneStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sample, setSample] = useState<File | null>(null);
  const [sampleSeconds, setSampleSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!wallet) { setLoading(false); return; }
      const result = await fetchVoiceCloneStatus(wallet);
      if (!cancelled) {
        setStatus(result);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
    clearTimer();
  }, [clearTimer]);

  // A recorder left running when this unmounts holds the microphone open for
  // the rest of the session — and the next thing this host does is go live.
  useEffect(() => () => {
    clearTimer();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, [clearTimer]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      let elapsed = 0;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setSample(new File([blob], 'stage-voice.webm', { type: 'audio/webm' }));
        setSampleSeconds(elapsed);
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
      setSample(null);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        // Instant cloning gains nothing past a minute, and a host about to run
        // a stage should not be left holding a running recorder.
        if (elapsed >= MAX_SECONDS) stopRecording();
      }, 1000);
    } catch {
      toast.error('Could not reach your microphone.', {
        description: 'Allow microphone access and try again.',
      });
    }
  }, [stopRecording]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('That file is too large. Keep it under 10MB.');
      return;
    }
    setSample(file);
    // An uploaded file's length is unknown here; the server checks the size
    // floor and ElevenLabs judges the content.
    setSampleSeconds(MIN_SECONDS);
  };

  // Free when they have paid before, or when a payment is already sitting on
  // the books from an attempt that failed after the transfer.
  const free = !!status && (status.entitled || status.creditedRetry);
  // A recording is only needed when there is no voice to speak with yet.
  const needsSample = !status?.owned;
  const canSubmit =
    !!wallet && !!status && !submitting && (!needsSample || (!!sample && sampleSeconds >= MIN_SECONDS));

  const handleSubmit = async () => {
    if (!wallet || !status) return;
    setSubmitting(true);
    try {
      // Paid before? Then this is a switch, not a purchase — no upload, no
      // wallet, no rate-limit slot on the cloning route.
      if (status.entitled && status.owned) {
        const enabled = await enableStageVoice(wallet);
        if (!enabled?.enabled) throw new VoiceCloneError('Could not switch on your voice.');
        toast.success('Your voice is switched on.', {
          description: 'Listeners in other languages will hear you.',
        });
        onReady();
        return;
      }

      const result = await purchaseStageVoice(
        wallet,
        sample,
        `${displayName || 'Host'} — stage voice`,
        status,
      );

      toast.success(result.adopted ? 'Your voice is switched on.' : 'Your voice is ready.', {
        description: 'Every stage from now on is dubbed in it — you only pay for this once.',
      });
      onReady();
    } catch (err) {
      const error = err as VoiceCloneError;
      if (error.paid) {
        // The transfer is on chain. Telling them to try again here would take
        // payment twice for one voice.
        toast.error(error.message, {
          description: 'Your DHB has already been taken for this. Try again — you will not be charged a second time.',
        });
        // Re-read: the server is now holding a credit, and the next attempt
        // must go down the free path.
        const refreshed = await fetchVoiceCloneStatus(wallet);
        if (refreshed) setStatus(refreshed);
      } else {
        toast.error(error.message || 'Could not set up your voice.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const format = (s: number) => `0:${s.toString().padStart(2, '0')}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-white/40" />
      </div>
    );
  }

  if (!wallet || !status) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          Your voice could not be set up right now. Your stage will still be dubbed for
          international listeners, using a stock voice.
        </p>
        <Button variant="ghost" onClick={onCancel} className="w-full text-white/60 hover:text-white hover:bg-white/10 rounded-xl">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-base font-medium text-white">Dub this stage in your voice</h3>
        <p className="text-sm text-white/60">
          Listeners who turn on dubbing hear your stage in their own language, spoken in
          your voice instead of a narrator's. Record yourself once and every stage you host
          from now on uses it.
        </p>
      </div>

      {/* What this costs, said plainly and before anything is recorded. */}
      <div className="p-3 rounded-xl bg-white/[0.06] space-y-1">
        {status.entitled ? (
          <>
            <p className="text-sm text-white">Already paid for — this is free.</p>
            <p className="text-xs text-white/50">
              {status.voiceName
                ? `Switching "${status.voiceName}" back on. You can turn it off and on whenever you like.`
                : 'Switching your voice back on.'}
            </p>
          </>
        ) : status.creditedRetry ? (
          <>
            <p className="text-sm text-white">Already paid — finish setting it up.</p>
            <p className="text-xs text-white/50">
              Your last attempt was charged but did not complete. This one costs nothing.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-white">
              {status.priceDhb.toLocaleString()} <DhbCoin />, once.
            </p>
            <p className="text-xs text-white/50">
              {status.owned
                ? 'You already have a voice, so there is nothing to record — this buys stage dubbing in it. One charge, ever.'
                : 'One charge, ever. Hosting stays free — listeners pay for their own dubbing.'}
            </p>
          </>
        )}
      </div>

      {needsSample && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
            <p className="text-xs text-white/50">
              Read anything at a normal speaking pace for at least {MIN_SECONDS} seconds —
              what you say does not matter, only how you sound.
            </p>

            <div className="flex items-center gap-3">
              <Button
                onClick={recording ? stopRecording : startRecording}
                disabled={submitting}
                className={cn(
                  'flex-1 rounded-xl border-0',
                  recording ? 'bg-white/20 hover:bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20 text-white',
                )}
              >
                {recording ? <Square className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                {recording ? `Stop — ${format(seconds)}` : sample ? 'Record again' : 'Record'}
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleUpload}
                className="hidden"
              />
              <Button
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={recording || submitting}
                className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl"
              >
                <Upload className="w-4 h-4" />
              </Button>
            </div>

            {recording && seconds < MIN_SECONDS && (
              <p className="text-xs text-white/40">
                {MIN_SECONDS - seconds}s more to go.
              </p>
            )}

            {sample && !recording && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className={cn('flex items-center gap-1.5', sampleSeconds >= MIN_SECONDS ? 'text-white/70' : 'text-white/40')}>
                  {sampleSeconds >= MIN_SECONDS ? <Check className="w-3.5 h-3.5" /> : null}
                  {sampleSeconds >= MIN_SECONDS
                    ? 'Sample ready.'
                    : `Too short — record at least ${MIN_SECONDS} seconds.`}
                </span>
                <button
                  onClick={() => { setSample(null); setSampleSeconds(0); }}
                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10"
                  aria-label="Discard recording"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl"
      >
        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
        {submitting
          ? 'Setting up your voice...'
          : free
            ? 'Use this voice'
            : status.owned
              // Nothing is cloned on this path — the voice already exists and
              // the fee is for dubbing stages in it.
              ? (
                <>
                  Pay <DhbAmount amount={status.priceDhb.toLocaleString()} /> and switch on
                </>
              ) : (
                <>
                  Pay <DhbAmount amount={status.priceDhb.toLocaleString()} /> and clone
                </>
              )}
      </Button>

      <Button
        variant="ghost"
        onClick={onCancel}
        disabled={submitting}
        className="w-full text-white/60 hover:text-white hover:bg-white/10 rounded-xl"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Not now — use a stock voice
      </Button>
    </div>
  );
}
