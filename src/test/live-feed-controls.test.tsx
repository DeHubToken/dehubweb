import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { LiveFeedPreview } from '@/components/app/cards/LiveFeedPreview';

vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/app' }) }));
vi.mock('@/hooks/use-video-fullscreen', () => ({
  useVideoFullscreen: () => ({ isFullscreen: false, toggleFullscreen: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const urls = ['https://live.dehub.io/example/index.m3u8'];

describe('live feed controls', () => {
  it('controls the actual live video and reflects playback events without a scrubber', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const { container } = render(<LiveFeedPreview urls={urls} controlsVisible />);
    const video = container.querySelector('video')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play', exact: true }));
    expect(play.mock.instances[0]).toBe(video);
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    fireEvent.playing(video);
    fireEvent.click(screen.getByRole('button', { name: 'Pause', exact: true }));
    expect(pause.mock.instances[0]).toBe(video);
    fireEvent.pause(video);
    expect(screen.getByRole('button', { name: 'Play', exact: true })).toBeTruthy();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(video.controls).toBe(false);
  });

  it('has one sound control that changes the live element and disappears with the row', () => {
    function Card({ controlsVisible }: { controlsVisible: boolean }) {
      const [muted, setMuted] = useState(true);
      return <LiveFeedPreview urls={urls} controlsVisible={controlsVisible} muted={muted} onToggleMute={() => setMuted(value => !value)} />;
    }
    const { container, rerender } = render(<Card controlsVisible />);
    const video = container.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Unmute' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(video.muted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Mute', exact: true }));
    expect(video.muted).toBe(true);
    rerender(<Card controlsVisible={false} />);
    expect(screen.queryByRole('button', { name: 'Unmute' })).toBeNull();
  });
});
