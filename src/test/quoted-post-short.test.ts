import { describe, expect, it } from 'vitest';
import type { DeHubNFT } from '@/lib/api/dehub/types';
import { quotedPostShort } from '@/lib/quoted-post-short';

const video = { tokenId: 42, postType: 'video', videoUrl: 'https://example.com/42.mp4' };
const photo = { tokenId: 43, postType: 'feed-images', imageUrls: ['nfts/images/photo.jpg'],
  description: '[soundtrack:7:Song:Artist:feed-audio/7.mp3]' };
const open = (post: object) => quotedPostShort(post as DeHubNFT);

describe('quoted media entry into Shorts', () => {
  it.each(['video', 'feed-video', 'short'])('seeds the quoted %s itself', postType => {
    expect(open({ ...video, postType })).toMatchObject({ id: '42', videoUrl: video.videoUrl });
  });
  it('seeds a photo with its soundtrack and resolved image', () => {
    expect(open(photo)).toMatchObject({ id: '43', videoUrl: '', soundtrackUrl: expect.stringContaining('/feed-audio/7.mp3') });
    expect(open(photo)?.imageUrls).toHaveLength(1);
  });
  it('supports legacy image posts with a soundtrack', () => {
    expect(open({ ...photo, postType: 'image' })?.imageUrls).toHaveLength(1);
  });
  it.each([
    { ...photo, description: 'Silent photo' }, { tokenId: 44, postType: 'feed-simple' },
    { ...video, postType: 'live' }, { ...video, postType: 'feed-audio' },
    { ...video, is_ppv: true }, { ...photo, streamInfo: { isLockContent: true, lockContentAmount: 1 } },
    { ...video, plansDetails: [{}] }, { ...video, contentRating: 'mature' },
    { ...photo, spoilerText: 'Reveal first' }, { ...video, visibility: 'followers' },
    { ...video, transcodingStatus: 'pending' }, { ...video, blockedYou: true },
  ])('keeps ineligible quotes on the post page: %j', post => {
    expect(open(post)).toBeNull();
  });
});
