import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { closeBrainrotFeed, openBrainrotFeed, useBrainrotSession } from '@/lib/brainrot-feed';
import { videoItemToShort } from '@/lib/short-video';
import type { VideoItem } from '@/types/feed.types';
import { useVideoCardOpen } from '../use-video-card-open';

const video = { id: 'long-video', title: 'A long video', videoUrl: 'https://example.test/long.mp4', duration: '12:00', channel: 'Creator' } as VideoItem;
afterEach(() => { cleanup(); closeBrainrotFeed(); vi.restoreAllMocks(); });

function mount({ shorts = true, blocked = false, dismissed = false } = {}) {
  const post = vi.fn();
  const creator = vi.fn();
  const react = vi.fn();
  const pause = vi.fn();
  const open = vi.fn(() => { pause(); openBrainrotFeed(video.id, videoItemToShort(video)); });
  const wasDismissed = () => dismissed;
  function Card() {
    const mediaRef = useRef<HTMLDivElement>(null);
    const primary = useVideoCardOpen({ mediaRef, shorts, blocked, wasDismissed, openShorts: open, openPost: post });
    const session = useBrainrotSession();
    return <>
      <div data-feed-item data-testid="bento">
        <div ref={mediaRef}>
          <span onClick={primary}>Video title</span>
          <button onClick={creator}>Creator</button>
          <button onClick={react}>Like</button>
        </div>
      </div>
      <output data-testid="playing">{session?.first?.videoUrl}</output>
    </>;
  }
  const view = render(<Card />);
  return { ...view, post, creator, react, pause, open };
}

it.each(['Video title', 'bento'])('opens the seeded viewer immediately from %s without navigating to a post', target => {
  const { post, pause, open } = mount();
  fireEvent.click(target === 'bento' ? screen.getByTestId('bento') : screen.getByText(target));
  expect(open).toHaveBeenCalledOnce();
  expect(pause).toHaveBeenCalledOnce();
  expect(post).not.toHaveBeenCalled();
  expect(screen.getByTestId('playing').textContent).toBe(video.videoUrl);
});

it('leaves creator and reaction controls to their own handlers', () => {
  const { creator, react, open, post } = mount();
  fireEvent.click(screen.getByText('Creator'));
  fireEvent.click(screen.getByText('Like'));
  expect(creator).toHaveBeenCalledOnce();
  expect(react).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

it.each([{ blocked: true }, { dismissed: true }])('ignores navigation while a drawer owns the interaction (%o)', options => {
  const { open, post } = mount(options);
  fireEvent.click(screen.getByText('Video title'));
  fireEvent.click(screen.getByTestId('bento'));
  expect(open).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

it('keeps the dedicated flow for audio, gates and disabled-viewer contexts', () => {
  const { open, post } = mount({ shorts: false });
  fireEvent.click(screen.getByText('Video title'));
  expect(open).not.toHaveBeenCalled();
  expect(post).toHaveBeenCalledOnce();
});
