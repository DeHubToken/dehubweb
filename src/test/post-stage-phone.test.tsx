import { cleanup, fireEvent, render, screen, within, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const voteOnPost = vi.fn();
const reactToPost = vi.fn();
const getPostQuotes = vi.fn();
const getPostReposters = vi.fn();

vi.mock('@/lib/api/dehub', () => ({
  voteOnPost: (...args: unknown[]) => voteOnPost(...args),
  reactToPost: (...args: unknown[]) => reactToPost(...args),
  getPostQuotes: (...args: unknown[]) => getPostQuotes(...args),
  getPostReposters: (...args: unknown[]) => getPostReposters(...args),
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
vi.mock('@/hooks/use-bookmarks', () => ({
  useBookmarkPost: () => ({ isBookmarked: false, isLoading: false, toggleBookmark: vi.fn() }),
}));
vi.mock('@/components/app/bookmarks/SaveToFolderDrawerLazy', () => ({ SaveToFolderDrawerLazy: () => null }));
vi.mock('@/components/app/cards/PostUtilityButtons', () => ({
  PostUtilityButtons: () => <button type="button" aria-label="Post info">i</button>,
}));

import { ActionBar } from '@/components/app/cards/ActionBar';
import type { PostStageValue } from '@/components/app/post-stage/post-stage-context';
import { PostStagePhone, POST_STAGE_BODY_CLASS } from '@/components/app/post-stage/PostStagePhone';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function stageValue(overrides: Partial<PostStageValue> = {}): PostStageValue {
  return {
    onBack: vi.fn(),
    openComments: vi.fn(),
    openQuotes: vi.fn(),
    openReposts: vi.fn(),
    quoteCount: 12,
    repostCount: 34,
    ...overrides,
  };
}

beforeEach(() => {
  voteOnPost.mockResolvedValue({});
  reactToPost.mockResolvedValue({});
  getPostQuotes.mockResolvedValue({ result: [] });
  getPostReposters.mockResolvedValue({ items: [] });
  window.innerWidth = 390;
  class IO {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.className = '';
});

describe('the phone post page bar', () => {
  it('is five tiles — like, comments, repost, tip, save — with no share, dislike or info', () => {
    render(wrap(
      <ActionBar
        postId="1234"
        tokenId={1234}
        stage={stageValue()}
        likeCount={56}
        dislikeCount={2}
        commentCount={128}
        repostCount={46}
        onTip={vi.fn()}
      />,
    ));
    const bar = document.querySelector('[data-stage-bar]') as HTMLElement;
    expect(bar).not.toBeNull();
    const tiles = bar.querySelectorAll('[data-stage-tile]');
    expect(tiles).toHaveLength(5);
    expect([...tiles].map((t) => t.getAttribute('data-stage-action'))).toEqual(['like', 'comments', 'repost', 'tip', 'save']);
    expect(within(bar).queryByRole('button', { name: 'Share' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: /^Dislike/ })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Post info' })).toBeNull();
    // The like tile keeps the hold-to-react thumb.
    expect(within(bar).getByRole('button', { name: /hold to react/ })).toHaveAttribute('aria-haspopup', 'menu');
    expect(within(bar).getByRole('button', { name: 'Repost (46)' })).toBeInTheDocument();
  });

  it('sends the comments tile to the comments and composer', () => {
    const stage = stageValue();
    render(wrap(<ActionBar postId="1234" stage={stage} commentCount={3} />));
    fireEvent.click(screen.getByRole('button', { name: 'Comments (3)' }));
    expect(stage.openComments).toHaveBeenCalledOnce();
  });

  it('opens "Repost & share" from the repost tile, with view quotes and view reposts', async () => {
    const stage = stageValue();
    render(wrap(<ActionBar postId="1234" tokenId={1234} stage={stage} repostCount={46} onRepost={vi.fn()} onQuote={vi.fn()} />));
    fireEvent.click(screen.getByRole('button', { name: 'Repost (46)' }));
    const sheet = await screen.findByText('Repost & share');
    expect(sheet).toBeInTheDocument();
    const quotes = document.querySelector('[data-stage-view="quotes"]') as HTMLElement;
    const reposts = document.querySelector('[data-stage-view="reposts"]') as HTMLElement;
    expect(quotes).toHaveTextContent('View quotes');
    expect(quotes).toHaveTextContent('12');
    expect(reposts).toHaveTextContent('View reposts');
    expect(reposts).toHaveTextContent('34');
    for (const target of ['copy', 'x', 'telegram', 'whatsapp', 'more']) {
      expect(document.querySelector(`[data-stage-share-target="${target}"]`)).not.toBeNull();
    }
    fireEvent.click(quotes);
    expect(stage.openQuotes).toHaveBeenCalledOnce();
  });
});

describe('feed and desktop bars are untouched', () => {
  it('renders the usual row with its share button and no stage tiles', () => {
    render(wrap(<ActionBar postId="1234" tokenId={1234} likeCount={1} utilityDesktopAnchor />));
    expect(document.querySelector('[data-stage-bar]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });
});

describe('the stage page shell', () => {
  it('hides the app chrome while mounted and docks the composer above the screen edge', () => {
    const { unmount } = render(wrap(
      <PostStagePhone value={stageValue()} kind="video" title="Sunset" subtitle="Mal · 1h" comments={<div>comments</div>}>
        <div data-media-full />
      </PostStagePhone>,
    ));
    expect(document.body.classList.contains(POST_STAGE_BODY_CLASS)).toBe(true);
    // The mini player is portalled to <body> and starts hidden.
    const mini = document.body.querySelector(':scope > [data-stage-mini]');
    expect(mini).not.toBeNull();
    expect(mini).not.toHaveAttribute('data-visible');
    act(() => unmount());
    expect(document.body.classList.contains(POST_STAGE_BODY_CLASS)).toBe(false);
  });

  it('hides the bottom nav on phones only, and docks the composer as glass rather than solid', () => {
    const css = postcss.parse(readFileSync('src/styles/post-stage.css', 'utf8'));
    let hidesNav = false;
    let composerGlass = false;
    css.walkAtRules('media', (at) => {
      if (!at.params.includes('max-width: 639px')) return;
      at.walkRules((rule) => {
        if (rule.selector.includes('post-stage-mode') && rule.selector.includes('[data-bottom-nav]')) {
          rule.walkDecls('display', (d) => { if (d.value.includes('none')) hidesNav = true; });
        }
      });
    });
    css.walkRules((rule) => {
      if (!/\[data-stage-composer\](:not\(#_\))*$/.test(rule.selector)) return;
      let blur = false;
      let tint = false;
      rule.walkDecls((d) => {
        if (d.prop === 'backdrop-filter' && /blur\(28px\)/.test(d.value)) blur = true;
        if (d.prop === 'background' && /color-mix\(.*80%, transparent\)/.test(d.value)) tint = true;
      });
      if (blur && tint) composerGlass = true;
    });
    expect(hidesNav).toBe(true);
    expect(composerGlass).toBe(true);
    // Hand-written -webkit- prefixes make the minifier drop the standard one.
    expect(readFileSync('src/styles/post-stage.css', 'utf8')).not.toMatch(/-webkit-backdrop-filter/);
  });

  it('docks the stage composer to the screen in the comments section', () => {
    const src = readFileSync('src/components/app/cards/CommentsSection.tsx', 'utf8');
    expect(src).toMatch(/data-stage-composer=\{stage \|\| undefined\}/);
    expect(src).toContain('? "fixed inset-x-0 bottom-0');
    // Portalled, so a theme's filtered page frame cannot re-anchor `fixed`.
    expect(src).toContain('createPortal(el, document.body)');
  });
});
