import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { isShortsPhoto, shortsPhotoMedia, interleaveShorts } from '@/lib/shorts-photos';
import { ShortsPhotoPager } from '@/components/app/cards/ShortsPhotoPager';
import { VideoSlide } from '@/components/app/cards/VideoSlide';
vi.mock('@/lib/thumbnail-fallback', () => ({ useResolvedThumbnail: (url: string) => url }));
vi.mock('@/hooks/use-tap-gestures', () => ({ useTapGestures: () => ({}) }));
vi.mock('@/components/app/cards/TapReactionBurst', () => ({ TapReactionBurst: () => null }));
vi.mock('@/components/app/cards/TranscodeRetry', () => ({ TranscodeRetry: () => null }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const post = { postType: 'feed-images', imageUrls: ['nfts/images/1.jpg', 'nfts/images/2.jpg'],
  description: 'A walk [soundtrack:5373:Morning:Artist:feed-audio/5373-audio.mp3]' };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('maps every photo and its single soundtrack without manufacturing a video', () => {
  const media = shortsPhotoMedia(post)!;
  expect(media.imageUrls).toHaveLength(2);
  expect(media.videoUrl).toBe('');
  expect(media.soundtrackUrl).toContain('/feed-audio/5373-audio.mp3');
  expect(media.description).toBe('A walk');
  expect(isShortsPhoto({ ...post, transcodingStatus: 'failed' } as typeof post)).toBe(true);
});
it('keeps gated, mature, silent and malformed posts out of the unguarded viewer', () => {
  for (const change of [{ description: '' }, { imageUrls: ['javascript:bad'] }, { contentRating: 'mature' },
    { streamInfo: { isPayPerView: true } }, { streamInfo: { isLockContent: true, lockContentAmount: 1 } },
    { plansDetails: [{}] }, { streamInfo: { isAddBounty: true } }]) {
    expect(isShortsPhoto({ ...post, ...change })).toBe(false);
  }
  expect(isShortsPhoto({ ...post, imageUrls: [], imageUrl: 'one.jpg' })).toBe(true);
});
it('includes photos before a full video reel consumes its limit', () => {
  expect(interleaveShorts(['v1', 'v2', 'v3'], ['p1', 'p2'])).toEqual(['v1', 'p1', 'v2', 'p2', 'v3']);
});
it('pages horizontally within bounds and leaves vertical keys alone', () => {
  render(<ShortsPhotoPager images={['one.jpg', 'two.jpg']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
  expect(screen.getByText('2 / 2')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next photo' })).toBeDisabled();
  fireEvent.keyDown(screen.getByLabelText('Post photos'), { key: 'ArrowUp' });
  expect(screen.getByText('2 / 2')).toBeTruthy();
  fireEvent.keyDown(screen.getByLabelText('Post photos'), { key: 'ArrowLeft' });
  expect(screen.getByText('1 / 2')).toBeTruthy();
});
it('does not show paging controls for a single musical photo', () => {
  render(<ShortsPhotoPager images={['one.jpg']} />);
  expect(screen.queryByRole('button')).toBeNull();
});
it('retains the same playing soundtrack and position across photos, then pauses on leaving the post', () => {
  vi.useFakeTimers();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const short = { id: '5421', type: 'short' as const, username: 'artist', verified: false, likes: '0',
    ...shortsPhotoMedia(post)! };
  const { container, rerender } = render(<VideoSlide short={short} isActive isMuted={false} />);
  act(() => { vi.advanceTimersByTime(60); });
  const player = container.querySelector('video')!;
  player.currentTime = 12;
  expect(play).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
  expect(container.querySelector('video')).toBe(player);
  expect(player.currentTime).toBe(12);
  expect(play).toHaveBeenCalledTimes(1);
  rerender(<VideoSlide short={short} isActive={false} isMuted={false} />);
  expect(pause).toHaveBeenCalled();
  play.mockClear();
  fireEvent.play(player);
  expect(play).not.toHaveBeenCalled();
});
