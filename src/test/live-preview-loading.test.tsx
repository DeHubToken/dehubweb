import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveFeedPreview } from '@/components/app/cards/LiveFeedPreview';

vi.mock('@/components/app/cards/LiveEndedMedia', () => ({ LiveEndedMedia: () => <div>Poster</div> }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'viewer' }) }));
const presence = vi.hoisted(() => ({ join: vi.fn(), leave: vi.fn(), observe: vi.fn(() => ({ leave: vi.fn() })) }));
vi.mock('@/lib/api/dehub/stream-presence', () => ({
  joinStreamPresence: presence.join,
  watchStreamReactions: presence.observe,
}));

let visibility: IntersectionObserverCallback;
beforeEach(() => {
  vi.clearAllMocks();
  presence.join.mockReturnValue({ leave: presence.leave });
  vi.stubGlobal('RTCPeerConnection', undefined);
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { visibility = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(streamId?: string, isOwner = false) {
  const result = render(<MemoryRouter><LiveFeedPreview streamId={streamId} isOwner={isOwner} urls={['https://example.com/live.m3u8']} /></MemoryRouter>);
  act(() => visibility([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver));
  return result.container.querySelector('video')!;
}

describe('live preview loading feedback', () => {
  it('joins on actual playback and leaves when paused or scrolled out of view', async () => {
    const video = mount('stream-a');
    expect(presence.join).not.toHaveBeenCalled();
    fireEvent.playing(video);
    await waitFor(() => expect(presence.join).toHaveBeenCalledWith('stream-a', expect.any(Function)));
    fireEvent.pause(video);
    expect(presence.leave).toHaveBeenCalledTimes(1);
    fireEvent.playing(video);
    await waitFor(() => expect(presence.join).toHaveBeenCalledTimes(2));
    act(() => visibility([{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(presence.leave).toHaveBeenCalledTimes(2);
  });

  it('subscribes the host to reactions without adding them to the audience', async () => {
    const video = mount('stream-a', true);
    fireEvent.playing(video);
    await waitFor(() => expect(presence.observe).toHaveBeenCalledWith('stream-a', expect.any(Function)));
    expect(presence.join).not.toHaveBeenCalled();
  });
  it('stays visible through play intent until frames play, and returns while buffering', () => {
    const video = mount();
    expect(screen.getByRole('status')).toBeVisible();
    fireEvent.play(video);
    expect(screen.getByRole('status')).toBeVisible();
    fireEvent.playing(video);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.waiting(video);
    expect(screen.getByRole('status')).toBeVisible();
    fireEvent.pause(video);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clears feedback when autoplay is refused', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('Blocked', 'NotAllowedError'));
    mount();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('does not animate offscreen previews', () => {
    mount();
    act(() => visibility([{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
