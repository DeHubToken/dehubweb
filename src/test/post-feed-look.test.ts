import { readFileSync } from 'node:fs';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setPostFeedLook, usePostFeedLook } from '@/lib/post-feed-look';

describe('post feed look', () => {
  it('tells the header when a phone post keeps the feed chrome', () => {
    const { result } = renderHook(() => usePostFeedLook());
    expect(result.current).toBe(false);
    act(() => setPostFeedLook(true));
    expect(result.current).toBe(true);
    act(() => setPostFeedLook(false));
    expect(result.current).toBe(false);
  });

  it('keeps the logo bar and the feed bento on every phone post page, video included', () => {
    const header = readFileSync('src/components/app/navigation/MobileHeader.tsx', 'utf8');
    expect(header).toContain('(isPostPage && postFeedLook)');
    const page = readFileSync('src/pages/app/SinglePostPage.tsx', 'utf8');
    expect(page).toContain('(isTextPost || isImagePost || isAudioPost || isVideoPost)');
    expect(page).toContain('if (isVideoPost && post && !feedLookPhone) {');
    expect(page).toContain("feedLookPhone ? 'pt-1 pb-8 lg:pt-0'");
    expect(page).toContain("contentType !== 'live' && !feedLookPhone");
  });
});
