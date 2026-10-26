/**
 * Keeps the creator's extra sources live while they broadcast: opens the
 * cameras, decodes the images, plays the clips, and hands the program the
 * visible ones every time something changes.
 *
 * Everything opened here is owned here — a second camera's light goes off and
 * a clip's object URL is revoked when its source is removed or the broadcast
 * ends.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgramOutput, ProgramSource } from '@/lib/studio/program';
import type { AudioDesk } from '@/lib/studio/audio-desk';
import {
  loadImage,
  loadSourceConfigs,
  saveSourceConfigs,
  type SourceConfig,
} from '@/lib/studio/sources';
import { createLogger } from '@/lib/logger';

const logger = createLogger('StudioSources');

interface Live {
  element: HTMLImageElement | HTMLVideoElement;
  /** Things to release when the source goes. */
  release: () => void;
}

export interface StudioSources {
  configs: SourceConfig[];
  add: (config: SourceConfig, file?: File) => Promise<boolean>;
  update: (id: string, change: Partial<SourceConfig>) => void;
  remove: (id: string) => void;
  /** Clip controls. */
  playing: (id: string) => boolean;
  togglePlay: (id: string) => void;
  restart: (id: string) => void;
}

export function useStudioSources(program: ProgramOutput, desk: AudioDesk | null, enabled: boolean): StudioSources {
  const [configs, setConfigs] = useState<SourceConfig[]>(() => (enabled ? loadSourceConfigs() : []));
  const live = useRef(new Map<string, Live>());
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  const open = useCallback(async (config: SourceConfig, file?: File): Promise<Live | null> => {
    try {
      if (config.kind === 'image' && config.image) {
        const img = await loadImage(config.image);
        return { element: img, release: () => undefined };
      }
      if (config.kind === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: config.deviceId
            ? { deviceId: { exact: config.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        return {
          element: video,
          release: () => {
            stream.getTracks().forEach((t) => t.stop());
            video.srcObject = null;
          },
        };
      }
      if (config.kind === 'video' && file) {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = url;
        video.loop = config.loop ?? true;
        video.playsInline = true;
        // The sound reaches viewers through the audio desk; locally it stays
        // silent so the creator's speakers do not feed it back into the mic.
        video.muted = !(config.withSound ?? true) || !desk;
        video.crossOrigin = 'anonymous';
        await video.play().catch(() => undefined);
        return {
          element: video,
          release: () => {
            video.pause();
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(url);
          },
        };
      }
    } catch (error) {
      logger.warn('Source could not be opened', { kind: config.kind, error });
    }
    return null;
  }, [desk]);

  // Remembered sources (logos, cameras) come back on their own.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      for (const config of configs) {
        if (live.current.has(config.id)) continue;
        const opened = await open(config);
        if (cancelled) {
          opened?.release();
          return;
        }
        if (opened) live.current.set(config.id, opened);
      }
      rerender();
    })();
    return () => {
      cancelled = true;
    };
    // Only on start: later additions open themselves in `add`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // The program gets the visible sources, in list order (later on top).
  useEffect(() => {
    const visible: ProgramSource[] = [];
    let clip: HTMLVideoElement | null = null;
    for (const config of configs) {
      const l = live.current.get(config.id);
      if (!l || !config.visible) continue;
      visible.push({ id: config.id, element: l.element, rect: config.rect, shape: config.shape, mirror: config.mirror });
      if (config.kind === 'video' && config.withSound !== false && l.element instanceof HTMLVideoElement) clip = l.element;
    }
    program.setSources(visible);
    if (desk) {
      if (clip) clip.muted = false;
      desk.setClipElement(clip);
    }
  });

  // Released with the broadcast.
  useEffect(
    () => () => {
      live.current.forEach((l) => l.release());
      live.current.clear();
      program.setSources([]);
      desk?.setClipElement(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const persist = (next: SourceConfig[]) => {
    setConfigs(next);
    saveSourceConfigs(next);
  };

  return {
    configs,
    add: async (config, file) => {
      const opened = await open(config, file);
      if (!opened) return false;
      live.current.set(config.id, opened);
      persist([...configs, config]);
      return true;
    },
    update: (id, change) => {
      const next = configs.map((c) => (c.id === id ? { ...c, ...change } : c));
      const l = live.current.get(id);
      if (l?.element instanceof HTMLVideoElement && change.loop !== undefined) l.element.loop = change.loop;
      persist(next);
    },
    remove: (id) => {
      live.current.get(id)?.release();
      live.current.delete(id);
      persist(configs.filter((c) => c.id !== id));
    },
    playing: (id) => {
      const el = live.current.get(id)?.element;
      return el instanceof HTMLVideoElement ? !el.paused : false;
    },
    togglePlay: (id) => {
      const el = live.current.get(id)?.element;
      if (!(el instanceof HTMLVideoElement)) return;
      if (el.paused) void el.play().catch(() => undefined);
      else el.pause();
      rerender();
    },
    restart: (id) => {
      const el = live.current.get(id)?.element;
      if (!(el instanceof HTMLVideoElement)) return;
      el.currentTime = 0;
      void el.play().catch(() => undefined);
      rerender();
    },
  };
}
