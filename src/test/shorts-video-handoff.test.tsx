import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoSlide } from '@/components/app/cards/VideoSlide';
import { claimHandoffVideo, releaseHandoffVideo } from '@/lib/video-handoff';
import type { ShortVideo } from '@/types/feed.types';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_: string, fallback?: string) => fallback ?? '' }) }));
vi.mock('@/lib/visual-activity', () => ({ useFeedPlaybackAllowed: () => true, visualActivity: { isCallBusy: () => false } }));
vi.mock('@/hooks/use-playback-recovery', () => ({ usePlaybackRecovery: () => 'idle' }));
vi.mock('@/hooks/use-picture-in-picture', () => ({ usePictureInPicture: () => false }));
vi.mock('@/lib/picture-in-picture', () => ({ isVideoInPictureInPicture: () => false, releaseAfterPictureInPicture: (_: unknown, release: () => void) => release() }));
vi.mock('@/lib/thumbnail-fallback', () => ({ useResolvedThumbnail: (url: string) => url }));
vi.mock('@/hooks/use-tap-gestures', () => ({ useTapGestures: () => ({}) }));
vi.mock('@/components/app/cards/TapReactionBurst', () => ({ TapReactionBurst: () => null }));
vi.mock('@/hooks/use-video-processing-status', () => ({ useVideoProcessingStatus: (_: string, status: string) => status }));
vi.mock('@/lib/video-preferences', () => ({ useMediaLooping: () => true }));
vi.mock('@/lib/video-start', () => ({ requestVideoPlayback: (video: HTMLVideoElement) => video.play() }));

const short = { id: 'handoff-short', videoUrl: 'https://example.test/clip.mp4', username: 'creator' } as ShortVideo;
const props = { short, isActive: true, isMuted: true };

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('feed to shorts playback', () => {
  it('adopts the same buffered video without reassigning its source or resetting its time', () => {
    const feedSlot = document.createElement('div');
    document.body.appendChild(feedSlot);
    const claim = claimHandoffVideo(short.id, feedSlot);
    claim.el.src = short.videoUrl;
    claim.el.currentTime = 12;
    const setSource = vi.spyOn(claim.el, 'src', 'set');
    const view = render(<VideoSlide {...props} handoffKey={short.id} />);
    expect(view.container.querySelector('video')).toBe(claim.el);
    expect(claim.el.currentTime).toBe(12);
    expect(setSource).not.toHaveBeenCalled();
    expect(claim.el.play).toHaveBeenCalled(); // no 50ms timer or transition gate
    view.unmount();
    expect(feedSlot.querySelector('video')).toBe(claim.el);
    releaseHandoffVideo(short.id, claim.token);
    feedSlot.remove();
  });

  it('preloads the next slide immediately but starts only the active player', () => {
    const view = render(<VideoSlide {...props} isActive={false} preload="auto" />);
    const video = view.container.querySelector('video')!;
    expect(video.preload).toBe('auto');
    expect(video.play).not.toHaveBeenCalled();
    view.rerender(<VideoSlide {...props} preload="auto" />);
    expect(video.play).toHaveBeenCalledTimes(1);
    view.rerender(<VideoSlide {...props} isActive={false} preload="auto" />);
    vi.mocked(video.pause).mockClear();
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    act(() => { video.dispatchEvent(new Event('play')); });
    expect(video.pause).toHaveBeenCalled(); // reject a late native play event
  });
});


describe('interrupted timeline scrubs', () => {
  it('releases navigation on lost capture and does not seek on pointer cancellation', () => {
    const end = vi.fn();
    const start = vi.fn();
    const view = render(<VideoSlide {...props} onSeekStart={start} onSeekEnd={end} />);
    const bar = view.container.querySelector('[data-no-pull]')!;
    const video = view.container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 100 });
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 400 } as DOMRect);
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, clientX: x, clientY: y });
      act(() => { bar.dispatchEvent(event); });
    };
    pointer('pointerdown', 100, 700);
    pointer('pointercancel', 100, 700);
    expect(video.currentTime).toBe(0);
    pointer('pointerdown', 100, 700);
    pointer('pointermove', 140, 700);
    expect(start).toHaveBeenCalledTimes(1);
    pointer('lostpointercapture', 140, 700);
    expect(end).toHaveBeenCalledTimes(1);
    pointer('pointerup', 140, 700);
    expect(end).toHaveBeenCalledTimes(1);
    pointer('pointerdown', 100, 700);
    pointer('pointermove', 100, 600);
    expect(start).toHaveBeenCalledTimes(1); // vertical swipe stays with carousel
  });
});
