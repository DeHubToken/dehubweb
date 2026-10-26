/**
 * Being a guest on someone's live
 * ===============================
 * Full screen, over whatever page the guest came from. Their camera and
 * microphone go to the host over Agora; the host's browser puts them into the
 * broadcast. The guest sees and hears the host and the other guests directly
 * — never the broadcast itself, which runs seconds behind and would play
 * their own voice back at them.
 *
 * The seat is re-read every few seconds: the host muting, removing, or ending
 * the room all land here that way.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { costreamUid, getCoStream, leaveSeat, type CoStreamState } from '@/lib/live/costream-api';
import { joinCoStreamRtc, type CoStreamRtc, type RemoteMedia } from '@/lib/live/costream-rtc';
import { participantLabel } from '@/hooks/use-costream-host';

const SEAT_POLL_MS = 3000;

function RemoteTile({ media, label, large }: { media: RemoteMedia | undefined; label: string; large?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    const track = media?.videoTrack;
    if (!el || !track) return;
    track.play(el, { fit: 'cover' });
    return () => { try { track.stop(); } catch { /* gone */ } };
  }, [media?.videoTrack]);
  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-zinc-900', large ? 'h-full w-full' : 'aspect-video w-full')}>
      <div ref={ref} className="absolute inset-0" />
      {!media?.videoTrack && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
          {media ? label : <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-lg bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">{label}</span>
    </div>
  );
}

export function CoStreamGuestRoom({ roomId, wallet, onClose }: { roomId: string; wallet: string; onClose: () => void }) {
  const { t } = useTranslation();
  const me = wallet.toLowerCase();
  const [state, setState] = useState<CoStreamState | null>(null);
  const [remotes, setRemotes] = useState<RemoteMedia[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [connecting, setConnecting] = useState(true);
  const selfRef = useRef<HTMLVideoElement | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const rtcRef = useRef<CoStreamRtc | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const seat = state?.seats.find((s) => s.wallet === me) ?? null;
  const hostMuted = !!seat?.muted;

  // Camera, microphone, and the link.
  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | null = null;
    void (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) { media.getTracks().forEach((tr) => tr.stop()); return; }
        mediaRef.current = media;
        if (selfRef.current) selfRef.current.srcObject = media;
        const rtc = await joinCoStreamRtc(roomId, me);
        if (cancelled) { await rtc.leave(); return; }
        rtcRef.current = rtc;
        off = rtc.onChange(() => setRemotes(rtc.remotes()));
        setConnecting(false);
      } catch (error) {
        if (cancelled) return;
        toast.error(error instanceof Error && error.message ? error.message : t('costream.couldNotJoin', { defaultValue: 'Could not join the live' }));
        closeRef.current();
      }
    })();
    return () => {
      cancelled = true;
      off?.();
      void rtcRef.current?.leave();
      rtcRef.current = null;
      mediaRef.current?.getTracks().forEach((tr) => tr.stop());
      mediaRef.current = null;
    };
  }, [roomId, me, t]);

  // The seat: muted, removed, room over.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const next = await getCoStream(roomId);
      if (cancelled) return;
      const mine = next?.seats.find((s) => s.wallet === me);
      if (!next || next.room.status !== 'active') {
        toast.message(t('costream.ended', { defaultValue: 'The live has ended' }));
        closeRef.current();
        return;
      }
      if (!mine || mine.status !== 'accepted') {
        if (mine?.status === 'removed') toast.message(t('costream.removed', { defaultValue: 'The host took you off screen' }));
        closeRef.current();
        return;
      }
      setState(next);
    };
    void check();
    const timer = window.setInterval(() => void check(), SEAT_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [roomId, me, t]);

  // What goes to the others. A host mute stops the microphone being sent at
  // all, not just left out of the mix, so the other guests stop hearing it too.
  const sendAudio = micOn && !hostMuted;
  useEffect(() => {
    const rtc = rtcRef.current;
    const media = mediaRef.current;
    if (connecting || !rtc || !media) return;
    void rtc.publish(camOn ? media.getVideoTracks()[0] ?? null : null, sendAudio ? media.getAudioTracks()[0] ?? null : null)
      .catch(() => toast.error(t('costream.couldNotSend', { defaultValue: 'Could not send your camera' })));
  }, [connecting, camOn, sendAudio, t]);

  const leave = async () => {
    if (seat) await leaveSeat(me, seat.id).catch(() => undefined);
    onClose();
  };

  const host = state?.room.host_wallet;
  const hostMedia = host ? remotes.find((r) => r.uid === costreamUid(host)) : undefined;
  const others = (state?.seats || []).filter((s) => s.status === 'accepted' && s.wallet !== me);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="flex h-8 items-center gap-1.5 rounded-xl bg-red-500 px-3 text-[11px] font-semibold">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          {t('costream.youAreLive', { defaultValue: "You're on screen" })}
        </span>
        {host && (
          <span className="truncate text-xs text-white/70">
            {t('costream.withHost', { defaultValue: 'with {{name}}', name: participantLabel(state?.room.host_username, host) })}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 md:flex-row">
        <div className="min-h-0 flex-1">
          <RemoteTile
            media={hostMedia}
            label={host ? participantLabel(state?.room.host_username, host) : ''}
            large
          />
        </div>
        <div className="flex shrink-0 gap-2 md:w-64 md:flex-col">
          <div className="relative aspect-video w-1/2 overflow-hidden rounded-2xl bg-zinc-900 md:w-full">
            <video ref={selfRef} autoPlay muted playsInline className={cn('h-full w-full scale-x-[-1] object-cover', !camOn && 'opacity-0')} />
            <span className="absolute bottom-2 left-2 rounded-lg bg-black/55 px-2 py-0.5 text-[11px] font-medium">
              {t('costream.you', { defaultValue: 'You' })}
            </span>
            {connecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
          </div>
          {others.map((s) => (
            <div key={s.id} className="w-1/2 md:w-full">
              <RemoteTile media={remotes.find((r) => r.uid === costreamUid(s.wallet))} label={participantLabel(s.username, s.wallet)} />
            </div>
          ))}
        </div>
      </div>

      {hostMuted && (
        <p className="mx-auto mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white/80">
          {t('costream.hostMutedYou', { defaultValue: 'The host muted you' })}
        </p>
      )}

      <div className="flex items-center justify-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          onClick={() => setMicOn((v) => !v)}
          disabled={hostMuted}
          aria-label={micOn ? t('costream.muteMe', { defaultValue: 'Mute microphone' }) : t('costream.unmuteMe', { defaultValue: 'Unmute microphone' })}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 disabled:opacity-50"
        >
          {micOn && !hostMuted ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => setCamOn((v) => !v)}
          aria-label={camOn ? t('costream.cameraOff', { defaultValue: 'Turn camera off' }) : t('costream.cameraOn', { defaultValue: 'Turn camera on' })}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10"
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => void leave()}
          className="flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-medium"
        >
          <PhoneOff className="h-4 w-4" />
          {t('costream.leaveScreen', { defaultValue: 'Leave' })}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default CoStreamGuestRoom;
