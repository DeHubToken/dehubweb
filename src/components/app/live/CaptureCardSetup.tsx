import { useEffect, useRef, useState } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CAPTURE_QUALITIES,
  captureVideoConstraints,
  isCaptureCardDevice,
  listMediaDevices,
  readCaptureCardChoice,
  resolveCaptureCardChoice,
  saveCaptureCardChoice,
  type CaptureCardChoice,
  type CaptureQuality,
} from '@/lib/livepeer/capture-card';

/**
 * The Capture card source on the Go Live sheet: a live look at the card and
 * the four choices that matter (which card, its sound, an optional mic, and
 * quality). Everything is pre-picked; the streamer only checks the preview.
 *
 * Choices save as they change, so the broadcaster (which mounts after the
 * mint, long after this is gone) opens exactly what was previewed here.
 */
export function CaptureCardSetup() {
  const { t: _copy } = _useCopy();
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null);
  const [choice, setChoice] = useState<CaptureCardChoice>(readCaptureCardChoice);
  const [previewError, setPreviewError] = useState(false);
  const [actual, setActual] = useState<{ w: number; h: number; fps: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load the device list (asking for permission once, so names show).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const list = await listMediaDevices().catch(() => []);
      if (cancelled) return;
      setDevices(list);
      setChoice((prev) => resolveCaptureCardChoice(list, prev));
    };
    void load();
    const md = navigator.mediaDevices;
    md?.addEventListener?.('devicechange', load);
    return () => {
      cancelled = true;
      md?.removeEventListener?.('devicechange', load);
    };
  }, []);

  useEffect(() => {
    saveCaptureCardChoice(choice);
  }, [choice]);

  // Live preview of the picked card at the picked quality.
  useEffect(() => {
    if (!choice.videoId) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    const el = videoRef.current;
    setPreviewError(false);
    setActual(null);
    navigator.mediaDevices
      .getUserMedia({ video: captureVideoConstraints(choice.videoId, choice.quality), audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        const settings = s.getVideoTracks()[0]?.getSettings?.() ?? {};
        setActual({
          w: settings.width ?? 0,
          h: settings.height ?? 0,
          fps: Math.round(settings.frameRate ?? 0),
        });
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (el) el.srcObject = null;
    };
  }, [choice.videoId, choice.quality]);

  const videos = devices?.filter((d) => d.kind === 'videoinput') ?? [];
  const audios = devices?.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default') ?? [];
  const update = (patch: Partial<CaptureCardChoice>) => setChoice((prev) => ({ ...prev, ...patch }));

  const qualityLabel = (q: CaptureQuality) =>
    q === 'auto'
      ? _copy("copy.a2838b66518a", { defaultValue: "Auto (best your card can do)" })
      : q === '1080p60'
        ? '1080p · 60 fps'
        : q === '1080p30'
          ? '1080p · 30 fps'
          : '720p · 30 fps';

  if (!devices) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-800/40 p-3 text-xs text-zinc-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {_copy("copy.0f3dd376ee85", { defaultValue: "Looking for your capture card…" })}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-zinc-800/40 p-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        {choice.videoId && !previewError && (
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
        )}
        {(!choice.videoId || previewError) && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-zinc-400">
            {!choice.videoId
              ? _copy("copy.594bea9c9448", { defaultValue: "No capture card found. Plug it in over USB, then pick it below." })
              : _copy("copy.67004337fb60", { defaultValue: "Can't open this device. Close OBS or Elgato Studio (only one app can use it at a time)." })}
          </p>
        )}
        {actual && actual.w > 0 && (
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {actual.w}×{actual.h} · {actual.fps} fps
          </span>
        )}
      </div>

      <Field label={_copy("copy.d534be829e32", { defaultValue: "Video" })}>
        <Select value={choice.videoId} onChange={(v) => update({ videoId: v })}>
          {!choice.videoId && <option value="">{_copy("copy.de6694f3ada3", { defaultValue: "Pick a device" })}</option>}
          {videos.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
              {isCaptureCardDevice(d) ? ' ★' : ''}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={_copy("copy.96882965394f", { defaultValue: "Game audio" })}>
        <Select value={choice.audioId} onChange={(v) => update({ audioId: v, micId: choice.micId === v ? '' : choice.micId })}>
          <option value="">{_copy("copy.dc937b598926", { defaultValue: "None" })}</option>
          {audios.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Input ${i + 1}`}</option>
          ))}
        </Select>
      </Field>

      <Field label={_copy("copy.36cffc7912e4", { defaultValue: "Your mic (to talk over the game)" })}>
        <Select value={choice.micId} onChange={(v) => update({ micId: v })}>
          <option value="">{_copy("copy.ca7981b46ecf", { defaultValue: "Off" })}</option>
          {audios
            .filter((d) => d.deviceId !== choice.audioId)
            .map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${i + 1}`}</option>
            ))}
        </Select>
      </Field>

      <Field label={_copy("copy.1b2c08a8733d", { defaultValue: "Quality" })}>
        <Select value={choice.quality} onChange={(v) => update({ quality: v as CaptureQuality })}>
          {CAPTURE_QUALITIES.map((q) => (
            <option key={q} value={q}>{qualityLabel(q)}</option>
          ))}
        </Select>
      </Field>

      <ul className="space-y-1 text-[11px] text-zinc-500">
        <li>{_copy("copy.d7038cc95b8e", { defaultValue: "Play on your TV through the card's passthrough, not this preview. It's a little behind." })}</li>
        <li>{_copy("copy.b8643d1cc81a", { defaultValue: "1080p 60 needs about 9 Mbps upload. Pick 720p on slow Wi‑Fi." })}</li>
        <li>{_copy("copy.8bb1dbd60bce", { defaultValue: "Keep this tab open while you're live." })}</li>
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white backdrop-blur-xl',
        'focus:outline-none focus:ring-1 focus:ring-white/30 [&>option]:bg-zinc-900 [&>option]:text-white'
      )}
    >
      {children}
    </select>
  );
}
