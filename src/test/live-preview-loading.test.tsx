import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveFeedPreview } from '@/components/app/cards/LiveFeedPreview';

vi.mock('@/components/app/cards/LiveEndedMedia', () => ({ LiveEndedMedia: () => <div>Poster</div> }));

let visibility: IntersectionObserverCallback;
beforeEach(() => {
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

function mount() {
  const result = render(<MemoryRouter><LiveFeedPreview urls={['https://example.com/live.m3u8']} /></MemoryRouter>);
  act(() => visibility([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver));
  return result.container.querySelector('video')!;
}

describe('live preview loading feedback', () => {
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
