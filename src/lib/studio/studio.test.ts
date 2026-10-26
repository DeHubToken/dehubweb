import { describe, expect, it } from 'vitest';
import { fadeProgress, formatCountdown, outputSize, pixelRect } from './program';
import { cardForScene, loadSceneCustoms, sceneMutesMic } from './scenes';
import { describeRect, loadSourceConfigs, placeSource, saveSourceConfigs, type SourceConfig } from './sources';
import { clampVolume } from './audio-desk';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('program output helpers', () => {
  it('keeps the frame even and caps the long side at 1080p', () => {
    expect(outputSize(1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(outputSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(outputSize(1081, 1921)).toEqual({ width: 1080, height: 1920 });
    expect(outputSize(0, 0)).toEqual({ width: 1280, height: 720 });
  });

  it('eases a fade from 0 to 1', () => {
    expect(fadeProgress(0, 0)).toBe(0);
    expect(fadeProgress(0, 200)).toBeCloseTo(0.5, 2);
    expect(fadeProgress(0, 10_000)).toBe(1);
  });

  it('counts down and stops at zero', () => {
    expect(formatCountdown(65_000, 0)).toBe('1:05');
    expect(formatCountdown(0, 5_000)).toBe('0:00');
  });

  it('clamps a placed source inside the frame', () => {
    expect(pixelRect({ x: 0.9, y: 0.9, w: 0.3, h: 0.3 }, 1000, 1000)).toEqual({ x: 700, y: 700, w: 300, h: 300 });
  });
});

describe('scenes', () => {
  it('only card scenes mute the mic, and the creator can override it', () => {
    expect(sceneMutesMic('brb')).toBe(true);
    expect(sceneMutesMic('brb', { muteMic: false })).toBe(false);
    expect(sceneMutesMic('chatting', { muteMic: true })).toBe(false);
  });

  it('builds a card with the countdown anchored to when the scene went up', () => {
    const card = cardForScene('starting', { countdownMinutes: 2 }, { title: 'Starting soon', subtitle: 'In' }, null, 1_000);
    expect(card?.countdownTo).toBe(121_000);
    expect(card?.title).toBe('Starting soon');
    expect(cardForScene('gameplay', undefined, { title: 'x' }, null, 0)).toBeNull();
  });

  it('drops anything unsafe from stored customisations', () => {
    const store = memory();
    store.setItem('dehub.studio.scenes.v1', JSON.stringify({ brb: { title: 'Snack', background: 'red', image: 'javascript:alert(1)' } }));
    const loaded = loadSceneCustoms(store);
    expect(loaded.brb?.title).toBe('Snack');
    expect(loaded.brb?.background).toBeUndefined();
    expect(loaded.brb?.image).toBeNull();
  });
});

describe('sources', () => {
  it('places a corner source inside the frame and reads it back', () => {
    const rect = placeSource('bottom-right', 'medium', 16 / 9);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1);
    expect(describeRect(rect)).toEqual({ position: 'bottom-right', size: 'medium' });
    expect(describeRect(placeSource('center', 'large', 1))).toEqual({ position: 'center', size: 'large' });
  });

  it('a square source stays square on a 16:9 frame', () => {
    const rect = placeSource('top-left', 'small', 1, 16 / 9);
    expect(rect.w * 16).toBeCloseTo(rect.h * 9, 5);
  });

  it('remembers images and cameras but not clips', () => {
    const store = memory();
    const base = { rect: { x: 0, y: 0, w: 0.2, h: 0.2 }, shape: 'rect' as const, visible: true, name: 'n' };
    const configs: SourceConfig[] = [
      { ...base, id: 'a', kind: 'image', image: 'data:image/png;base64,AAAA' },
      { ...base, id: 'b', kind: 'camera', deviceId: 'cam' },
      { ...base, id: 'c', kind: 'video' },
      { ...base, id: 'd', kind: 'image', image: 'https://evil.example/x.png' },
    ];
    saveSourceConfigs(configs, store);
    expect(loadSourceConfigs(store).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('audio desk', () => {
  it('clamps volume to 0–200%', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(5)).toBe(2);
    expect(clampVolume(Number.NaN)).toBe(1);
  });
});
