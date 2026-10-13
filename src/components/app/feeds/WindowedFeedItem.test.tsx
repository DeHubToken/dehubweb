import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowedFeedItem } from './WindowedFeedItem';

let intersect: IntersectionObserverCallback;
let resize: ResizeObserverCallback;
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {} unobserve() {} disconnect() {}
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {} unobserve() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function visibility(element: Element, visible: boolean, height = 520) {
  act(() => intersect([{ target: element, isIntersecting: visible, boundingClientRect: { height } } as IntersectionObserverEntry], {} as IntersectionObserver));
}

describe('windowed feed cards', () => {
  it('mounts near the viewport and preserves the measured scroll runway when released', () => {
    const view = render(<WindowedFeedItem estimatedHeight={520} data-testid="slot"><span>Heavy media</span></WindowedFeedItem>);
    const slot = screen.getByTestId('slot');
    expect(screen.queryByText('Heavy media')).toBeNull();
    expect(slot.style.height).toBe('520px');
    visibility(slot, true);
    expect(screen.getByText('Heavy media')).toBeTruthy();
    act(() => resize([{ target: slot, borderBoxSize: [{ blockSize: 731 }] } as unknown as ResizeObserverEntry], {} as ResizeObserver));
    visibility(slot, false, 731);
    expect(screen.queryByText('Heavy media')).toBeNull();
    expect(slot.style.height).toBe('731px');
    view.rerender(<WindowedFeedItem estimatedHeight={520} data-testid="slot"><span>Updated media</span></WindowedFeedItem>);
    expect(slot.style.height).toBe('731px');
    visibility(slot, true, 731);
    expect(screen.getByText('Updated media')).toBeTruthy();
    expect(slot.style.height).toBe('');
  });

  it('paints eager cards immediately and retains focused or hidden cached cards', () => {
    render(<WindowedFeedItem eager estimatedHeight={520} data-testid="slot"><input aria-label="Reply" /></WindowedFeedItem>);
    const slot = screen.getByTestId('slot'), input = screen.getByRole('textbox');
    input.focus();
    visibility(slot, false);
    expect(screen.getByRole('textbox')).toBeTruthy();
    (input as HTMLElement).blur();
    visibility(slot, false, 0);
    expect(screen.getByRole('textbox')).toBeTruthy();
    visibility(slot, false);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('does not dismiss a card-owned open dialog when its card leaves the window', () => {
    render(<WindowedFeedItem eager estimatedHeight={520} data-testid="slot"><div role="dialog" aria-modal="true">Reply</div></WindowedFeedItem>);
    visibility(screen.getByTestId('slot'), false);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
