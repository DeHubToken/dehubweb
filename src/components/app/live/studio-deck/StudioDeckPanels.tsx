/**
 * The broadcaster's studio panels: scenes, sources and the audio mixer.
 *
 * Each is a plain panel the broadcaster opens from its control bar, the same
 * way it opens looks or voice effects. The state lives with the broadcaster
 * (it owns the program and the desk); these only draw it and report clicks.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Film, Image as ImageIcon, MonitorPlay, Pause, Play, RotateCcw, Trash2, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
  SCENE_BACKGROUNDS,
  SCENE_IDS,
  SCENES,
  type SceneCustom,
  type SceneId,
} from '@/lib/studio/scenes';
import {
  MAX_SOURCES,
  SOURCE_POSITIONS,
  SOURCE_SIZES,
  describeRect,
  newSourceId,
  placeSource,
  loadImage,
  readImageFile,
  type SourceConfig,
  type SourcePosition,
  type SourceSize,
} from '@/lib/studio/sources';
import { DESK_CHANNELS, MAX_VOLUME, type AudioDesk, type DeskChannel, type GateStrength } from '@/lib/studio/audio-desk';
import type { StudioSources } from './use-studio-sources';
import type { BackgroundMode, BackgroundOptions } from '@/lib/studio/background';
import { getNFTInfo } from '@/lib/api/dehub';
import { buildVideoUrl } from '@/lib/media-url';
import { remixLinksUnavailable, startLiveReaction, stopLiveReaction, tokenIdFromPostUrl } from '@/lib/api/remix-links';
import { checkRemixSource } from '@/lib/remix/checkRemixSource';

const chip = (on: boolean) =>
  cn(
    'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
    on ? 'border-white bg-white text-black' : 'border-white/15 text-white/80 hover:border-white/40',
  );

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ───────────────────────── Scenes ───────────────────────── */

export function ScenesPanel({
  active,
  customs,
  busy,
  canShareScreen,
  burnWidgets,
  onBurnWidgets,
  onSelect,
  onCustomize,
}: {
  active: SceneId | null;
  customs: Partial<Record<SceneId, SceneCustom>>;
  busy: boolean;
  canShareScreen: boolean;
  burnWidgets: boolean;
  onBurnWidgets: (on: boolean) => void;
  onSelect: (id: SceneId) => void;
  onCustomize: (id: SceneId, change: SceneCustom) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<SceneId | null>(null);
  const editable = editing && SCENES[editing].kind === 'card' ? editing : null;
  const custom = editable ? customs[editable] ?? {} : {};
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file || !editable) return;
    try {
      onCustomize(editable, { image: await readImageFile(file) });
    } catch {
      toast.error(t('studioDeck.imageTooLarge'));
    }
  };

  return (
    <div className={cn('space-y-4', busy && 'pointer-events-none opacity-60')}>
      <Section title={t('studioDeck.scenes.title')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SCENE_IDS.map((id) => {
            const disabled = id === 'gameplay' && !canShareScreen;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(id)}
                className={cn(
                  'rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors disabled:opacity-40',
                  active === id ? 'border-white bg-white text-black' : 'border-white/15 bg-white/5 text-white hover:border-white/40',
                )}
              >
                {customs[id]?.title?.trim() || t(`studioDeck.scenes.names.${id}`)}
                <span className={cn('mt-0.5 block text-[11px] font-normal', active === id ? 'text-black/60' : 'text-white/50')}>
                  {t(`studioDeck.scenes.hints.${id}`)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SCENE_IDS.filter((id) => SCENES[id].kind === 'card').map((id) => (
            <button key={id} type="button" className={chip(editing === id)} onClick={() => setEditing(editing === id ? null : id)}>
              {t('studioDeck.scenes.edit', { name: customs[id]?.title?.trim() || t(`studioDeck.scenes.names.${id}`) })}
            </button>
          ))}
        </div>
      </Section>

      {editable && (
        <div className="space-y-2 rounded-xl border border-white/10 p-3">
          <input
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
            maxLength={60}
            value={custom.title ?? ''}
            placeholder={t(`studioDeck.scenes.names.${editable}`)}
            onChange={(e) => onCustomize(editable, { title: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
            maxLength={120}
            value={custom.subtitle ?? ''}
            placeholder={t('studioDeck.scenes.subtitle')}
            onChange={(e) => onCustomize(editable, { subtitle: e.target.value })}
          />
          <div className="flex flex-wrap items-center gap-2">
            {SCENE_BACKGROUNDS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => onCustomize(editable, { background: c })}
                className={cn('h-7 w-7 rounded-full border-2', (custom.background ?? SCENE_BACKGROUNDS[0]) === c ? 'border-white' : 'border-transparent')}
                style={{ background: c }}
              />
            ))}
            <button type="button" className={chip(Boolean(custom.image))} onClick={() => fileRef.current?.click()}>
              <ImageIcon className="mr-1 inline h-3.5 w-3.5" />
              {t('studioDeck.scenes.picture')}
            </button>
            {custom.image && (
              <button type="button" className={chip(false)} onClick={() => onCustomize(editable, { image: null })}>
                {t('studioDeck.remove')}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickImage(e.target.files?.[0])} />
          </div>
          {editable === 'starting' && (
            <label className="flex items-center justify-between gap-3 text-sm text-white/80">
              <span>{t('studioDeck.scenes.countdown')}</span>
              <select
                className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-sm text-white"
                value={custom.countdownMinutes ?? SCENES.starting.countdownMinutes ?? 0}
                onChange={(e) => onCustomize(editable, { countdownMinutes: Number(e.target.value) })}
              >
                {[0, 1, 2, 3, 5, 10, 15].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? t('studioDeck.scenes.noCountdown') : t('studioDeck.scenes.minutes', { count: m })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center justify-between gap-3 text-sm text-white/80">
            <span>{t('studioDeck.scenes.muteMic')}</span>
            <Switch
              checked={custom.muteMic ?? Boolean(SCENES[editable].muteMic)}
              onCheckedChange={(v) => onCustomize(editable, { muteMic: v })}
            />
          </label>
        </div>
      )}

      <label className="flex items-start justify-between gap-3 rounded-xl border border-white/10 p-3">
        <span>
          <span className="block text-sm font-medium text-white">{t('studioDeck.widgets.title')}</span>
          <span className="block text-[11px] text-white/50">{t('studioDeck.widgets.hint')}</span>
        </span>
        <Switch checked={burnWidgets} onCheckedChange={onBurnWidgets} aria-label={t('studioDeck.widgets.title')} />
      </label>
    </div>
  );
}

/* ───────────────────────── Sources ───────────────────────── */

export function SourcesPanel({ sources, frameAspect, streamTokenId }: { sources: StudioSources; frameAspect: number; streamTokenId?: string }) {
  const { t } = useTranslation();
  const [reactLink, setReactLink] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const clipRef = useRef<HTMLInputElement>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [adding, setAdding] = useState(false);
  const full = sources.configs.length >= MAX_SOURCES;

  useEffect(() => {
    void navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((d) => setCameras(d.filter((x) => x.kind === 'videoinput' && x.deviceId)))
      .catch(() => undefined);
  }, []);

  const add = async (config: SourceConfig, file?: File) => {
    setAdding(true);
    const ok = await sources.add(config, file);
    setAdding(false);
    if (!ok) toast.error(t('studioDeck.sources.failed'));
  };

  const addImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const image = await readImageFile(file);
      const aspect = await new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
        img.onerror = () => resolve(1);
        img.src = image;
      });
      await add({
        id: newSourceId(),
        kind: 'image',
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || t('studioDeck.sources.image'),
        image,
        rect: placeSource('top-right', 'small', aspect, frameAspect),
        shape: 'rect',
        visible: true,
      });
    } catch {
      toast.error(t('studioDeck.imageTooLarge'));
    }
  };

  const addClip = async (file: File | undefined) => {
    if (!file) return;
    await add(
      {
        id: newSourceId(),
        kind: 'video',
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || t('studioDeck.sources.clip'),
        rect: placeSource('center', 'large', 16 / 9, frameAspect),
        shape: 'rounded',
        visible: true,
        withSound: true,
        loop: true,
      },
      file,
    );
  };

  const addCamera = async (device?: MediaDeviceInfo) => {
    await add({
      id: newSourceId(),
      kind: 'camera',
      name: device?.label?.slice(0, 40) || t('studioDeck.sources.camera'),
      deviceId: device?.deviceId,
      rect: placeSource('bottom-left', 'small', 1, frameAspect),
      shape: 'circle',
      visible: true,
      mirror: true,
    });
  };

  /**
   * React live: a DeHub video fills the frame for viewers, with the creator's
   * camera in a bubble over it. The server checks the video may be reacted to
   * and marks the stream as reacting to it before anything goes on screen.
   */
  const addReaction = async () => {
    const raw = (reactLink ?? '').trim();
    const tokenId = /^\d+$/.test(raw) ? Number(raw) : tokenIdFromPostUrl(raw);
    if (!tokenId) {
      toast.error(t('studioDeck.sources.reactInvalid', 'Paste a link to a DeHub video.'));
      return;
    }
    if (!streamTokenId) {
      toast.error(t('studioDeck.sources.reactNotLive', 'Go live first, then add the video.'));
      return;
    }
    setAdding(true);
    try {
      await checkRemixSource(`https://dehub.io/app/post/${tokenId}`, 'react');
      const post = await getNFTInfo(String(tokenId));
      // Marks the stream for the viewers' chip and the original's credit. If the
      // service is not reachable the checks above have passed and the video
      // still goes on screen, just without the chip.
      await startLiveReaction(streamTokenId, tokenId).catch((error) => {
        if (!remixLinksUnavailable(error)) throw error;
      });
      for (const c of sources.configs) if (c.reaction) sources.remove(c.id);
      const creator = post?.mintername || post?.minterUsername || null;
      const ok = await sources.add({
        id: newSourceId(),
        kind: 'video',
        name: (creator ? `@${creator} · ` : '') + (post?.name || t('studioDeck.sources.clip')).slice(0, 40),
        url: buildVideoUrl(tokenId),
        reaction: { tokenId, creator, title: String(post?.name ?? '').slice(0, 120) },
        rect: { x: 0, y: 0, w: 1, h: 1 },
        shape: 'rect',
        visible: true,
        withSound: true,
        loop: false,
      });
      if (!ok) {
        void stopLiveReaction(streamTokenId).catch(() => undefined);
        toast.error(t('studioDeck.sources.failed'));
        return;
      }
      setReactLink(null);
      // The creator's face goes over the video; without a second camera the
      // video shrinks to a corner so the main camera still shows.
      if (!sources.configs.some((c) => c.kind === 'camera')) {
        const bubble = await sources.add({
          id: newSourceId(),
          kind: 'camera',
          name: t('studioDeck.sources.camera'),
          rect: placeSource('bottom-right', 'medium', 1, frameAspect),
          shape: 'circle',
          visible: true,
          mirror: true,
        });
        if (!bubble) toast(t('studioDeck.sources.reactNoBubble', 'Your camera could not open twice here. Resize the video to keep your face on screen.'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('studioDeck.sources.failed'));
    } finally {
      setAdding(false);
    }
  };

  const removeSource = (c: SourceConfig) => {
    sources.remove(c.id);
    if (c.reaction && streamTokenId) void stopLiveReaction(streamTokenId).catch(() => undefined);
  };

  const move = (c: SourceConfig, position: SourcePosition, size: SourceSize) => {
    // The source's own shape in pixels, recovered from its current rect.
    const aspect = c.shape === 'circle' ? 1 : (c.rect.w / Math.max(0.0001, c.rect.h)) * frameAspect;
    sources.update(c.id, { rect: placeSource(position, size, aspect, frameAspect) });
  };

  return (
    <div className={cn('space-y-3', adding && 'pointer-events-none opacity-60')}>
      <Section title={t('studioDeck.sources.title')}>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" disabled={full} className={chip(false)} onClick={() => imageRef.current?.click()}>
            <ImageIcon className="mr-1 inline h-3.5 w-3.5" />
            {t('studioDeck.sources.addImage')}
          </button>
          <button type="button" disabled={full} className={chip(false)} onClick={() => void addCamera(cameras[1] ?? cameras[0])}>
            <Camera className="mr-1 inline h-3.5 w-3.5" />
            {t('studioDeck.sources.addCamera')}
          </button>
          <button type="button" disabled={full} className={chip(false)} onClick={() => clipRef.current?.click()}>
            <Film className="mr-1 inline h-3.5 w-3.5" />
            {t('studioDeck.sources.addClip')}
          </button>
          <button type="button" disabled={full} className={chip(reactLink !== null)} onClick={() => setReactLink(reactLink === null ? '' : null)}>
            <MonitorPlay className="mr-1 inline h-3.5 w-3.5" />
            {t('studioDeck.sources.addReaction', 'React to a video')}
          </button>
          <input ref={imageRef} type="file" accept="image/*" hidden onChange={(e) => void addImage(e.target.files?.[0])} />
          <input ref={clipRef} type="file" accept="video/*" hidden onChange={(e) => void addClip(e.target.files?.[0])} />
        </div>
        {reactLink !== null && (
          <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void addReaction(); }}>
            <input
              autoFocus
              value={reactLink}
              onChange={(e) => setReactLink(e.target.value)}
              placeholder={t('studioDeck.sources.reactPlaceholder', 'Paste a DeHub video link')}
              aria-label={t('studioDeck.sources.reactPlaceholder', 'Paste a DeHub video link')}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder:text-white/40"
            />
            <button type="submit" className={chip(true)}>{t('studioDeck.sources.reactAdd', 'Show')}</button>
          </form>
        )}
      </Section>

      {sources.configs.length === 0 ? (
        <p className="text-xs text-white/50">{t('studioDeck.sources.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {sources.configs.map((c) => {
            const { position, size } = describeRect(c.rect);
            return (
              <li key={c.id} className="space-y-2 rounded-xl border border-white/10 p-2.5">
                <div className="flex items-center gap-2">
                  {c.kind === 'image' ? <ImageIcon className="h-4 w-4 text-white/60" /> : c.kind === 'camera' ? <Camera className="h-4 w-4 text-white/60" /> : <Film className="h-4 w-4 text-white/60" />}
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{c.name}</span>
                  {c.kind === 'video' && (
                    <>
                      <button type="button" aria-label={t('studioDeck.sources.restart')} className="rounded-md p-1 text-white/70 hover:bg-white/10" onClick={() => sources.restart(c.id)}>
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label={t('studioDeck.sources.play')} className="rounded-md p-1 text-white/70 hover:bg-white/10" onClick={() => sources.togglePlay(c.id)}>
                        {sources.playing(c.id) ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                  <Switch checked={c.visible} onCheckedChange={(v) => sources.update(c.id, { visible: v })} aria-label={t('studioDeck.sources.show')} />
                  <button type="button" aria-label={t('studioDeck.remove')} className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => removeSource(c)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {SOURCE_POSITIONS.map((p) => (
                    <button key={p} type="button" className={chip(position === p)} onClick={() => move(c, p, size)}>
                      {t(`studioDeck.sources.positions.${p}`)}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {SOURCE_SIZES.map((s) => (
                    <button key={s} type="button" className={chip(size === s)} onClick={() => move(c, position, s)}>
                      {t(`studioDeck.sources.sizes.${s}`)}
                    </button>
                  ))}
                  {c.kind === 'camera' &&
                    (['circle', 'rounded', 'rect'] as const).map((shape) => (
                      <button key={shape} type="button" className={chip(c.shape === shape)} onClick={() => sources.update(c.id, { shape, rect: placeSource(position, size, shape === 'circle' ? 1 : 16 / 9, frameAspect) })}>
                        {t(`studioDeck.sources.shapes.${shape}`)}
                      </button>
                    ))}
                  {c.kind === 'camera' && cameras.length > 1 && (
                    <select
                      className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
                      value={c.deviceId ?? ''}
                      onChange={(e) => {
                        const device = cameras.find((d) => d.deviceId === e.target.value);
                        sources.remove(c.id);
                        void addCamera(device);
                      }}
                    >
                      {cameras.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `${t('studioDeck.sources.camera')} ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                  {c.kind === 'video' && (
                    <button type="button" className={chip(c.loop !== false)} onClick={() => sources.update(c.id, { loop: c.loop === false })}>
                      {t('studioDeck.sources.loop')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-white/40">{t('studioDeck.sources.hint')}</p>
    </div>
  );
}

/* ───────────────────────── Audio ───────────────────────── */

function Meter({ desk, channel }: { desk: AudioDesk; channel: DeskChannel }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const level = desk.level(channel);
      if (barRef.current) barRef.current.style.width = `${Math.round(Math.min(1, level * 1.4) * 100)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [desk, channel]);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div ref={barRef} className="h-full w-0 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-red-500" />
    </div>
  );
}

export interface DeskState {
  volume: Record<DeskChannel, number>;
  muted: Record<DeskChannel, boolean>;
  gate: GateStrength;
}

export function AudioPanel({
  desk,
  state,
  onVolume,
  onMute,
  onGate,
}: {
  desk: AudioDesk | null;
  state: DeskState;
  onVolume: (channel: DeskChannel, volume: number) => void;
  onMute: (channel: DeskChannel, muted: boolean) => void;
  onGate: (gate: GateStrength) => void;
}) {
  const { t } = useTranslation();
  if (!desk) return <p className="text-sm text-white/60">{t('studioDeck.audio.unavailable')}</p>;
  return (
    <div className="space-y-4">
      <Section title={t('studioDeck.audio.title')}>
        <div className="space-y-3">
          {DESK_CHANNELS.map((channel) => {
            const present = desk.hasInput(channel);
            const muted = state.muted[channel];
            return (
              <div key={channel} className={cn('space-y-1.5', !present && 'opacity-50')}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={muted ? t('studioDeck.audio.unmute') : t('studioDeck.audio.mute')}
                    onClick={() => onMute(channel, !muted)}
                    className="rounded-md p-1 text-white/80 hover:bg-white/10"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <span className="w-24 text-sm text-white">{t(`studioDeck.audio.channels.${channel}`)}</span>
                  <input
                    type="range"
                    min={0}
                    max={MAX_VOLUME * 100}
                    step={5}
                    value={Math.round(state.volume[channel] * 100)}
                    onChange={(e) => onVolume(channel, Number(e.target.value) / 100)}
                    className="flex-1 accent-white"
                    aria-label={t(`studioDeck.audio.channels.${channel}`)}
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-white/60">{Math.round(state.volume[channel] * 100)}%</span>
                </div>
                <Meter desk={desk} channel={channel} />
                {!present && <p className="text-[11px] text-white/40">{t(`studioDeck.audio.absent.${channel}`)}</p>}
              </div>
            );
          })}
        </div>
      </Section>
      {desk.gateSupported() && (
        <Section title={t('studioDeck.audio.gate')}>
          <div className="flex gap-1.5">
            {(['off', 'low', 'high'] as const).map((g) => (
              <button key={g} type="button" className={chip(state.gate === g)} onClick={() => onGate(g)}>
                {t(`studioDeck.audio.gateLevels.${g}`)}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-white/50">{t('studioDeck.audio.gateHint')}</p>
        </Section>
      )}
    </div>
  );
}

/* ───────────────────────── Background ───────────────────────── */

export function BackgroundPicker({
  mode,
  color,
  onChange,
}: {
  mode: BackgroundMode;
  color: string;
  onChange: (mode: BackgroundMode, opts?: BackgroundOptions) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const img = await loadImage(await readImageFile(file));
      onChange('image', { image: img });
    } catch {
      toast.error(t('studioDeck.imageTooLarge'));
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{t('studioDeck.background.title')}</p>
      <div className="flex flex-wrap gap-1.5">
        {(['none', 'blur', 'color'] as const).map((m) => (
          <button key={m} type="button" className={chip(mode === m)} onClick={() => onChange(m, m === 'color' ? { color } : undefined)}>
            {t(`studioDeck.background.modes.${m}`)}
          </button>
        ))}
        <button type="button" className={chip(mode === 'image')} onClick={() => fileRef.current?.click()}>
          {t('studioDeck.background.modes.image')}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickImage(e.target.files?.[0])} />
      </div>
      {mode === 'color' && (
        <div className="flex gap-2">
          {['#00b140', '#0b0b0f', '#ffffff', ...SCENE_BACKGROUNDS.slice(1)].map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => onChange('color', { color: c })}
              className={cn('h-7 w-7 rounded-full border-2', color === c ? 'border-white' : 'border-white/20')}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
      <p className="text-[11px] text-white/50">{t('studioDeck.background.hint')}</p>
    </div>
  );
}
