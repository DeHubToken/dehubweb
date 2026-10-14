import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInlineBadgeFont } from '../use-inline-badge-font';

let frames: Map<number, FrameRequestCallback>;
let resize: (() => void)[];
let observers: { disconnect: ReturnType<typeof vi.fn> }[];
function Badge({ size = 16, visible = true }: { size?: number; visible?: boolean }) {
  const ref = useInlineBadgeFont();
  return <span><span style={{ fontSize: size, fontFamily: 'serif', fontWeight: 700 }}>Name</span>{visible && <span data-testid="badge" ref={ref} />}</span>;
}
function flush() {
  act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(0)); });
}
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined);
  frames = new Map(); resize = []; observers = [];
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((fn: FrameRequestCallback) => { frames.set(++id, fn); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((key: number) => frames.delete(key)));
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn();
    constructor(callback: () => void) { resize.push(callback); observers.push(this); }
    observe() {}
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('inline badge font batching', () => {
  it('leaves offscreen badges asleep and only measures them when they approach the viewport', () => {
    let intersect!: (entries: Partial<IntersectionObserverEntry>[]) => void;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: typeof intersect) { intersect = callback; }
      observe() {} unobserve() {} disconnect() {}
    });
    const { getByTestId, rerender } = render(<Badge />);
    const badge = getByTestId('badge');
    expect(frames.size).toBe(0);
    resize[0]();
    expect(frames.size).toBe(0);
    intersect([{ target: badge, isIntersecting: true }]);
    expect(frames.size).toBe(1);
    flush();
    expect(badge.style.fontSize).toBe('16px');
    rerender(<Badge />);
    expect(frames.size).toBe(0);
    intersect([{ target: badge, isIntersecting: false }]);
    rerender(<Badge size={24} />);
    expect(frames.size).toBe(0);
    intersect([{ target: badge, isIntersecting: true }]);
    flush();
    expect(badge.style.fontSize).toBe('24px');
  });

  it('reads a page of names before writing any badge font', () => {
    const { getAllByTestId } = render(<><Badge size={20} /><Badge size={24} /></>);
    const badges = getAllByTestId('badge');
    const original = window.getComputedStyle.bind(window);
    const reads = vi.spyOn(window, 'getComputedStyle').mockImplementation(el => {
      expect(badges.every(b => b.style.fontSize === '')).toBe(true);
      return original(el);
    });
    expect(frames.size).toBe(1);
    expect(reads).not.toHaveBeenCalled();
    flush();
    expect(reads).toHaveBeenCalledTimes(2);
    expect(badges.map(b => b.style.fontSize)).toEqual(['20px', '24px']);
    expect(badges[0].style.fontFamily).toBe('serif');
    expect(badges[0].style.fontWeight).toBe('700');
  });

  it('keeps observers through rerenders and updates changed font metrics', () => {
    const { rerender, getByTestId } = render(<Badge size={20} />);
    flush();
    rerender(<Badge size={28} />);
    resize[0](); resize[0]();
    expect(observers).toHaveLength(1);
    expect(frames.size).toBe(1);
    flush();
    expect(getByTestId('badge').style.fontSize).toBe('28px');
  });

  it('handles a badge arriving after its data and cancels removed badges', () => {
    const { rerender, unmount } = render(<Badge visible={false} />);
    expect(frames.size).toBe(0);
    rerender(<Badge />);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });
});
