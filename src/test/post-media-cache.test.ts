import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { cacheImageForNavigation, cacheVideoForNavigation } from '@/lib/post-cache';
import { parseSoundtrackTag } from '@/lib/soundtrack';
import type { DeHubNFT } from '@/lib/api/dehub';
import type { ImagePost, VideoItem } from '@/types/feed.types';

vi.mock('@/lib/preload-post-page', () => ({ warmPostPage: vi.fn() }));

describe('media navigation cache', () => {
  it('renders an audio post as audio before the network response arrives', () => {
    const client = new QueryClient();
    cacheVideoForNavigation(client, {
      id: '42', title: 'Sound', duration: '0:30', views: '12',
      isAudio: true, audioUrl: 'https://example.com/sound.mp3', audioDuration: 30,
    } as VideoItem);
    expect(client.getQueryData(['single-post', '42'])).toMatchObject({
      postType: 'feed-audio', audioUrl: 'https://example.com/sound.mp3', audioDuration: 30,
    });
    client.clear();
  });

  it('keeps the image soundtrack in the description consumed by the post page', () => {
    const client = new QueryClient();
    const sound = { soundtrackUrl: 'https://example.com/sound.mp3', soundtrackTitle: 'Title: one', soundtrackCreator: 'Creator' };
    cacheImageForNavigation(client, {
      id: '43', description: 'Picture', image: 'https://example.com/picture.jpg', ...sound,
    } as ImagePost);
    const cached = client.getQueryData<DeHubNFT>(['single-post', '43']);
    expect(parseSoundtrackTag(cached?.description)).toEqual(sound);
    expect(cached?.description).toContain('Picture');
    client.clear();
  });
});
