import { describe, expect, it, vi } from 'vitest';
import { createGuestMixer, layoutTiles } from './guest-mixer';
import type { WhipSession } from './whip';

const track = (kind: 'video' | 'audio', id: string) =>
  ({ kind, id, enabled: true, readyState: 'live' } as unknown as MediaStreamTrack);

describe('layoutTiles', () => {
  it('gives one person the whole frame', () => {
    expect(layoutTiles(1, 1280, 720)).toEqual([{ x: 0, y: 0, w: 1280, h: 720 }]);
  });

  it('splits side by side on a wide frame and stacks on an upright one', () => {
    const wide = layoutTiles(2, 1280, 720);
    expect(wide).toHaveLength(2);
    expect(wide[0].h).toBe(720);
    expect(wide[1].x).toBeGreaterThan(wide[0].x + wide[0].w - 1);
    const tall = layoutTiles(2, 720, 1280);
    expect(tall[0].w).toBe(720);
    expect(tall[1].y).toBeGreaterThan(tall[0].y + tall[0].h - 1);
  });

  it('keeps every tile inside the frame without overlaps, up to four', () => {
    for (const [w, h] of [[1280, 720], [720, 1280]]) {
      for (let n = 1; n <= 4; n++) {
        const rects = layoutTiles(n, w, h);
        expect(rects).toHaveLength(n);
        for (const r of rects) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(w);
          expect(r.y + r.h).toBeLessThanOrEqual(h);
        }
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i];
            const b = rects[j];
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect(overlap).toBe(false);
          }
        }
      }
    }
  });
});

describe('createGuestMixer', () => {
  const session = () => {
    const s: WhipSession = { stop: vi.fn(async () => undefined), replaceTrack: vi.fn(async () => undefined) };
    return s;
  };

  it('passes track swaps straight through while nobody is on screen', async () => {
    const mixer = createGuestMixer();
    const inner = session();
    const wrapped = mixer.wrap(inner);
    const camera = track('video', 'cam');
    await wrapped.replaceTrack('video', camera);
    expect(inner.replaceTrack).toHaveBeenCalledWith('video', camera);
    expect(mixer.hostTracks().video).toBe(camera);
  });

  it('learns what is on air from the stream the session opened with', () => {
    const mixer = createGuestMixer();
    const cam = track('video', 'cam');
    const mic = track('audio', 'mic');
    const stream = { getVideoTracks: () => [cam], getAudioTracks: () => [mic] } as unknown as MediaStream;
    mixer.wrap(session(), stream);
    expect(mixer.hostTracks()).toEqual({ video: cam, audio: mic });
  });

  it('tells the host link when the host changes camera', async () => {
    const mixer = createGuestMixer();
    const listener = vi.fn();
    mixer.onHostTracksChange(listener);
    await mixer.wrap(session()).replaceTrack('video', track('video', 'back'));
    expect(listener).toHaveBeenCalled();
  });

  it('unwraps to the raw session for identity checks', () => {
    const mixer = createGuestMixer();
    const inner = session();
    const wrapped = mixer.wrap(inner);
    expect(wrapped).not.toBe(inner);
    expect(mixer.unwrap(wrapped)).toBe(inner);
    expect(mixer.unwrap(null)).toBeNull();
  });

  it('stops the inner session when the wrapper is stopped', async () => {
    const mixer = createGuestMixer();
    const inner = session();
    await mixer.wrap(inner).stop();
    expect(inner.stop).toHaveBeenCalled();
  });
});
