import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FeedPillGlow } from '@/components/app/navigation/FeedPillGlow';

let node: HTMLDivElement, root: Root;
const glow = () => node.querySelector<HTMLElement>('[data-feed-pill-glow]');
const renderGlow = (distance = 0, refreshing = false) => act(() => root.render(<FeedPillGlow distance={distance} refreshing={refreshing} />));
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  node = document.createElement('div'); document.body.append(node);
  root = createRoot(node);
  renderGlow();
});
afterEach(() => { act(() => root.unmount()); node.remove(); });

it('stays out of the page until the feed is pulled', () => {
  expect(glow()).toBeNull();
});

it('brightens with the pull and caps at the refresh point', () => {
  renderGlow(46);
  expect(glow()!.style.getPropertyValue('--pull-glow')).toBe('0.500');
  const initialGlow = glow();
  renderGlow(160);
  expect(glow()).toBe(initialGlow);
  expect(glow()!.style.getPropertyValue('--pull-glow')).toBe('1.000');
});

it('keeps breathing while the feed refreshes after the pull has settled', () => {
  renderGlow(0, true);
  expect(glow()!.hasAttribute('data-refreshing')).toBe(true);
  renderGlow();
  expect(glow()).toBeNull();
});
