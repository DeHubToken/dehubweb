import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PostCard } from '@/components/app/cards/PostCard';
import { DOUBLE_TAP_LIKE_EVENT } from '@/lib/tap-reactions';
import type { TextPost } from '@/types/feed.types';

const { navigate, cachePost } = vi.hoisted(() => ({ navigate: vi.fn(), cachePost: vi.fn() }));
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => navigate }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/use-surface-draft', () => ({ useSurfaceDraft: (_: string, value: string) => useState(value), draftIdentity: () => '7' }));
vi.mock('@/hooks/use-auto-open-comments', () => ({ useAutoOpenComments: () => {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: null, openLoginModal: vi.fn() }) }));
vi.mock('@/hooks/use-superpowers', () => ({ useSuperpowers: () => ({ data: null }) }));
vi.mock('@/hooks/use-post-tip-count', () => ({ usePostTipCount: () => ({ data: 0 }) }));
vi.mock('@/hooks/use-link-copy-count', () => ({ usePostLinkCopyCount: () => ({ data: 0 }), useTrackPostLinkCopy: () => vi.fn() }));
vi.mock('@/hooks/use-mint-existing-post', () => ({ useMintExistingPost: () => ({ mint: vi.fn(), isMinting: false }) }));
vi.mock('@/hooks/use-block-author', () => ({ useBlockAuthor: () => ({ blockAuthor: vi.fn() }) }));
vi.mock('@/hooks/use-mute-author', () => ({ useMuteAuthor: () => ({ muteAuthor: vi.fn() }) }));
vi.mock('@/hooks/use-follow', () => ({ useFollow: () => ({ isFollowing: false, toggleFollow: vi.fn() }) }));
vi.mock('@/hooks/use-view-tracking', () => ({ useFeedViewTracking: () => ({ current: null }) }));
vi.mock('@/hooks/use-polls', () => ({ useCreatePoll: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/lib/api/dehub', () => ({ updateTokenVisibility: vi.fn(), repostPost: vi.fn(), isFollowing: vi.fn() }));
vi.mock('@/lib/post-cache', () => ({ cacheTextPostForNavigation: cachePost }));
vi.mock('@/lib/preload-post-page', () => ({ warmPostPage: vi.fn() }));
vi.mock('@/components/app/post-stage/post-stage-context', () => ({ usePostStage: () => null }));
vi.mock('@/components/app/cards/KeywordFilterGate', () => ({ KeywordFilterGate: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/app/cards/CardHeader', () => ({ CardHeader: () => <div>Creator</div> }));
vi.mock('@/components/app/cards/PostHeaderOptionsButton', () => ({ PostHeaderBoostButton: () => null, PostHeaderOptionsButton: () => null }));
vi.mock('@/components/app/cards/MatureContentGate', () => ({ MatureContentGate: () => null, useMatureGate: () => ({ isGated: false }) }));
vi.mock('@/components/app/cards/ContentWarningGate', () => ({ ContentWarningGate: () => null, useContentWarning: () => ({ hidden: false }) }));
vi.mock('@/components/app/cards/ActionBar', () => ({ ActionBar: () => null }));
vi.mock('@/components/app/cards/CommentsWrapper', () => ({ CommentsWrapper: () => null }));
vi.mock('@/components/app/cards/PostMetadata', () => ({ PostMetadata: () => null }));
vi.mock('@/components/app/cards/PostUtilityMenuItems', () => ({ PostUtilityMenuItems: () => null }));
vi.mock('@/components/app/cards/PollCard', () => ({ PollCard: () => null }));
vi.mock('@/components/app/cards/TapReactionBurst', () => ({ TapReactionBurst: () => null }));
vi.mock('@/components/app/cards/FeedLinkPreviews', () => ({ FeedLinkPreviews: () => null }));
vi.mock('@/components/app/cards/DehubLinkEmbedsLazy', () => ({ DehubLinkEmbeds: () => null, useDehubLinks: (text: string) => ({ links: [], displayText: text }) }));
vi.mock('@/components/app/cards/AssetRefCards', () => ({ AssetRefCards: () => null, useAssetRefsInText: (text: string) => ({ refs: [], displayText: text }) }));
vi.mock('@/components/app/cards/QuotedPostEmbed', () => ({
  QuotedPostEmbed: () => <div data-glass-embed onClick={event => { event.stopPropagation(); navigate('/app/post/88'); }}>Quoted body</div>,
  RemovedQuoteNotice: () => null,
}));
vi.mock('@/components/app/TranslatableText', () => ({
  useTranslation: () => ({ isTranslated: false, isTooShort: true }),
  renderTextWithLinks: (text: string) => text,
  TranslatableText: ({ text }: { text: string }) => <p>{text}</p>,
}));
vi.mock('@/components/app/live/ShopBoardLazy', () => ({ ShopBoardLazy: () => null }));
vi.mock('@/components/app/article/ArticleFeedCoverLazy', () => ({ ArticleFeedCover: () => null }));
vi.mock('@/components/app/cards/PostAIChatLazy', () => ({ PostAIChatLazy: () => null }));
vi.mock('@/components/app/modals/ReportModal', () => ({ ReportModal: () => null }));
vi.mock('@/components/app/modals/DeletePostModal', () => ({ DeletePostModal: () => null }));
vi.mock('@/components/app/modals/QuotePostModalLazy', () => ({ QuotePostModalLazy: () => null }));
vi.mock('@/components/app/modals/TipModal', () => ({ TipModal: () => null }));
vi.mock('@/components/ui/drawer', () => ({ Drawer: () => null, DrawerContent: () => null, DrawerHeader: () => null, DrawerTitle: () => null, wasDrawerJustDismissed: () => false }));

const post = {
  id: '7', title: 'Open this headline', content: 'Open this post body',
  author: { id: 'creator', name: 'Creator', handle: 'creator' },
  stats: { likes: 0, dislikes: 0, comments: 0, reposts: 0 },
} as TextPost;

beforeEach(() => {
  vi.useFakeTimers();
  navigate.mockClear();
  cachePost.mockClear();
  window.getSelection()?.removeAllRanges();
});
afterEach(() => vi.useRealTimers());

function mount(extra: Partial<TextPost> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><PostCard post={{ ...post, ...extra }} /></QueryClientProvider>);
  const body = screen.getByText(post.content);
  const surface = body.parentElement!;
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 300 } as DOMRect);
  return { ...result, body };
}

function tap(target: Element, x = 200, y = 150) {
  // jsdom's PointerEvent fallback drops these fields; install them on a real
  // bubbling event so React clears currentTarget normally after dispatch.
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { pointerId: 1, clientX: x, clientY: y });
    fireEvent(target, event);
  }
  fireEvent.click(target);
}

it.each(['headline', 'body'])('opens a single %s tap after multi-tap resolution', part => {
  const { body } = mount();
  tap(part === 'headline' ? screen.getByText(post.title!) : body);
  expect(navigate).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(360));
  expect(navigate).toHaveBeenCalledExactlyOnceWith('/app/post/7', { state: { fromFeed: true } });
  expect(cachePost).toHaveBeenCalledTimes(1);
});

it('opens an outer body tap immediately without a duplicate compatibility click', () => {
  const { body } = mount();
  tap(body, 15, 150);
  expect(navigate).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(500));
  expect(navigate).toHaveBeenCalledTimes(1);
});

it('opens the quoted post without opening its parent after the timer', () => {
  mount({ isQuotePost: true, quotedPost: { tokenId: 88 } as TextPost['quotedPost'] });
  tap(screen.getByText('Quoted body'));
  act(() => vi.advanceTimersByTime(500));
  expect(navigate).toHaveBeenCalledExactlyOnceWith('/app/post/88');
});

it.each([2, 3])('preserves the %s-tap reaction without navigating', count => {
  const { body } = mount();
  const casts: string[] = [];
  const listener = (event: Event) => casts.push((event as CustomEvent).detail.reaction);
  window.addEventListener(DOUBLE_TAP_LIKE_EVENT, listener);
  try {
    for (let i = 0; i < count; i++) {
      tap(body);
      act(() => vi.advanceTimersByTime(80));
    }
    act(() => vi.advanceTimersByTime(500));
    expect(navigate).not.toHaveBeenCalled();
    expect(casts).toEqual([count === 2 ? 'like' : 'love']);
  } finally {
    window.removeEventListener(DOUBLE_TAP_LIKE_EVENT, listener);
  }
});

it('leaves selected text and nested no-navigate controls alone', () => {
  const { body } = mount();
  vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'selected' } as Selection);
  tap(body);
  act(() => vi.advanceTimersByTime(500));
  expect(navigate).not.toHaveBeenCalled();
  vi.mocked(window.getSelection).mockRestore();
  const nested = document.createElement('span');
  nested.dataset.noNavigate = '';
  body.appendChild(nested);
  tap(nested);
  act(() => vi.advanceTimersByTime(500));
  expect(navigate).not.toHaveBeenCalled();
});
