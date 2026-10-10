import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FeedPillGlow } from '@/components/app/navigation/FeedPillGlow';
import { setFeedRefresh } from '@/lib/feed-refresh';

let node: HTMLDivElement, root: Root;
const glow = () => node.querySelector<HTMLElement>('[data-feed-pill-glow]');
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  node = document.createElement('div'); document.body.append(node);
  root = createRoot(node);
  act(() => root.render(<FeedPillGlow />));
});
afterEach(() => { act(() => { setFeedRefresh({ refreshing: false, progress: 0 }); root.unmount(); }); node.remove(); });

it('stays out of the page until the feed is pulled', () => {
  expect(glow()).toBeNull();
});

it('brightens with the pull and caps at the refresh point', () => {
  act(() => setFeedRefresh({ refreshing: false, progress: .5, distance: 46, pulling: true }));
  expect(glow()!.style.getPropertyValue('--pull-glow')).toBe('0.500');
  act(() => setFeedRefresh({ refreshing: false, progress: 1, distance: 160, pulling: true }));
  expect(glow()!.style.getPropertyValue('--pull-glow')).toBe('1.000');
});

it('keeps breathing while the feed refreshes after the pull has settled', () => {
  act(() => setFeedRefresh({ refreshing: true, progress: 0, distance: 0, pulling: false }));
  expect(glow()!.hasAttribute('data-refreshing')).toBe(true);
  act(() => setFeedRefresh({ refreshing: false, progress: 0, distance: 0, pulling: false }));
  expect(glow()).toBeNull();
});
