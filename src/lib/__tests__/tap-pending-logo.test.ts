import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTapPendingLogo, installTapPendingLogo } from '../tap-pending-logo';

const logo = () => document.getElementById('dehub-tap-pending') as HTMLElement;
const press = (target: Element, x = 10, y = 10) =>
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y }));

describe('tap pending logo', () => {
  let uninstall: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <a id="link" href="/app/profile">p</a>
      <a id="ext" href="https://x.com">x</a>
      <button id="back" data-swipe-back>back</button>
      <button id="like">like</button>
      <div data-feed-item><p id="body">text</p><button id="inner">share</button></div>`;
    uninstall = installTapPendingLogo();
  });
  afterEach(() => { uninstall(); vi.useRealTimers(); });

  it('is up on press of an in-app link and down after a click that opened nothing', () => {
    press(document.getElementById('link')!);
    expect(logo().style.display).toBe('flex');
    document.getElementById('link')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(logo().style.display).toBe('none');
  });

  it('ignores plain buttons, external links and buttons inside a feed card', () => {
    for (const id of ['like', 'ext', 'inner']) {
      press(document.getElementById(id)!);
      expect(logo().style.display).toBe('none');
    }
  });

  it('arms for a feed card body and Back, and waits for Back to land', () => {
    press(document.getElementById('body')!);
    expect(logo().style.display).toBe('flex');
    clearTapPendingLogo();
    press(document.getElementById('back')!);
    document.getElementById('back')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(100);
    expect(logo().style.display).toBe('flex');
    vi.advanceTimersByTime(400);
    expect(logo().style.display).toBe('none');
  });

  it('drops when the press turns into a scroll', () => {
    press(document.getElementById('body')!, 10, 10);
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 40 }));
    expect(logo().style.display).toBe('none');
  });
});
