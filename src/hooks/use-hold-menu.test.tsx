import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHoldMenu } from './use-hold-menu';

const target = document.createElement('div');
const pointer = (over: Record<string, unknown> = {}) =>
  ({ pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 20, pointerId: 1, target, ...over }) as never;
const mouse = () => ({ clientX: 5, clientY: 6, target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

describe('useHoldMenu', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('opens after a touch hold and swallows the click that ends it', () => {
    const onHold = vi.fn();
    const { result } = renderHook(() => useHoldMenu(onHold));
    act(() => { result.current.onPointerDown(pointer()); vi.advanceTimersByTime(500); });
    expect(onHold).toHaveBeenCalledWith({ x: 10, y: 20 }, target);
    const click = mouse();
    result.current.onClickCapture(click as never);
    expect(click.stopPropagation).toHaveBeenCalled();
    const next = mouse();
    result.current.onClickCapture(next as never);
    expect(next.stopPropagation).not.toHaveBeenCalled();
  });

  it('does not open when the finger moves or lifts early', () => {
    const onHold = vi.fn();
    const { result } = renderHook(() => useHoldMenu(onHold));
    act(() => { result.current.onPointerDown(pointer()); result.current.onPointerMove(pointer({ clientX: 40 })); vi.advanceTimersByTime(600); });
    act(() => { result.current.onPointerDown(pointer()); vi.advanceTimersByTime(200); result.current.onPointerUp(); vi.advanceTimersByTime(600); });
    expect(onHold).not.toHaveBeenCalled();
  });

  it('opens on right click, and keeps the browser menu when the row declines', () => {
    const onHold = vi.fn().mockReturnValueOnce(undefined).mockReturnValueOnce(false);
    const { result } = renderHook(() => useHoldMenu(onHold));
    const first = mouse();
    result.current.onContextMenu(first as never);
    expect(first.preventDefault).toHaveBeenCalled();
    const second = mouse();
    result.current.onContextMenu(second as never);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores the contextmenu Android sends after a touch hold already opened', () => {
    const onHold = vi.fn();
    const { result } = renderHook(() => useHoldMenu(onHold));
    act(() => { result.current.onPointerDown(pointer()); vi.advanceTimersByTime(500); });
    const ctx = mouse();
    result.current.onContextMenu(ctx as never);
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(ctx.preventDefault).toHaveBeenCalled();
  });
});
