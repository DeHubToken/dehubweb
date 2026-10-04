import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const voteOnPost = vi.fn();
const reactToPost = vi.fn();

vi.mock('@/lib/api/dehub', () => ({
  voteOnPost: (...args: unknown[]) => voteOnPost(...args),
  reactToPost: (...args: unknown[]) => reactToPost(...args),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, walletAddress: '0xviewer', openLoginModal: vi.fn() }),
}));
vi.mock('@/hooks/use-engagement-weight', () => ({ useEngagementWeight: () => 1 }));
vi.mock('@/hooks/use-link-copy-count', () => ({
  usePostLinkCopyCount: () => ({ data: 0 }),
  useLinkCopyFloor: () => 0,
  useTrackPostLinkCopy: () => vi.fn(),
}));
vi.mock('@/hooks/use-post-tip-count', () => ({ useViewerTippedPost: () => false }));
vi.mock('@/components/app/cards/PostUtilityButtons', () => ({ PostUtilityButtons: () => null }));

import { ActionBar } from '@/components/app/cards/ActionBar';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  voteOnPost.mockResolvedValue({});
  reactToPost.mockResolvedValue({});
  window.innerWidth = 1280;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* storage may be unavailable */ }
});

describe('a post action bar with reactions on', () => {
  it('has no thumbs-down button — 👎 lives in the thumbs-up tray', () => {
    render(wrap(<ActionBar postId="101" likeCount={3} dislikeCount={2} />));
    expect(screen.queryByRole('button', { name: /^Dislike/ })).toBeNull();
    expect(screen.getByRole('button', { name: /hold to react/ })).toBeInTheDocument();
  });

  it('wears the viewer\'s 👎 on the thumbs-up, and a tap removes it', () => {
    render(
      wrap(
        <ActionBar
          postId="102"
          isDisliked
          myReaction="dislike"
          likeCount={3}
          dislikeCount={1}
          reactionCounts={{ like: 3, dislike: 1 }}
        />,
      ),
    );
    const thumb = screen.getByRole('button', { name: 'Dislike — hold to change your reaction' });
    expect(thumb).toHaveAttribute('data-engaged', 'dislike');
    expect(thumb.querySelector('[data-engaged-glyph]')).not.toBeNull();
    expect(thumb).toHaveTextContent('1');
    fireEvent.click(thumb);
    // Re-sending the held 👎 is the server's "remove it" — never a like.
    expect(voteOnPost).toHaveBeenCalledExactlyOnceWith({ tokenId: 102, voteType: 'against' });
    expect(thumb).not.toHaveAttribute('data-engaged');
    expect(thumb).toHaveTextContent('3');
  });

  it('shows the first dislike even when the post has no likes', () => {
    render(wrap(
      <ActionBar postId="104" isDisliked myReaction="dislike" likeCount={0} dislikeCount={1} />,
    ));
    expect(screen.getByRole('button', { name: /Dislike/ })).toHaveTextContent('1');
  });

  it('still likes on a plain tap when nothing is held', () => {
    render(wrap(<ActionBar postId="103" likeCount={0} />));
    fireEvent.click(screen.getByRole('button', { name: /hold to react/ }));
    expect(voteOnPost).toHaveBeenCalledExactlyOnceWith({ tokenId: 103, voteType: 'for' });
  });
});

describe('an action bar with its own vote handlers', () => {
  it('keeps the plain up/down pair (governance, feature requests)', () => {
    const onLike = vi.fn();
    const onDislike = vi.fn();
    render(wrap(<ActionBar postId="proposal-1" onLike={onLike} onDislike={onDislike} />));
    const down = screen.getByRole('button', { name: 'Dislike' });
    fireEvent.click(down);
    expect(onDislike).toHaveBeenCalledTimes(1);
    expect(onLike).not.toHaveBeenCalled();
  });
});
