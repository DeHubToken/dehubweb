import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardSafeSheet } from './use-keyboard-open';

describe('keyboard-safe sheet', () => {
  let viewport: EventTarget & { height: number; offsetTop: number };
  let input: HTMLInputElement;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    vi.stubGlobal('innerHeight', 800);
    viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    input = document.createElement('input');
    document.body.append(input);
  });

  afterEach(() => {
    input.remove();
    vi.unstubAllGlobals();
  });

  it('keeps both sheet edges inside Safari after keyboard resize and pan', () => {
    const { result } = renderHook(() => useKeyboardSafeSheet(true));
    act(() => input.focus());
    act(() => {
      viewport.height = 320;
      viewport.offsetTop = 60;
      viewport.dispatchEvent(new Event('resize'));
    });
    const style = result.current.style!;
    expect(style.marginTop).toBe(0);
    expect(Number(style.top)).toBeGreaterThanOrEqual(viewport.offsetTop);
    expect(Number(style.top) + Number(style.height)).toBeLessThan(viewport.offsetTop + viewport.height);
    act(() => {
      viewport.offsetTop = 110;
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.style?.top).toBe(118);
  });

  it('detects a field already focused when the sheet mounts and fits short landscape viewports', () => {
    input.focus();
    viewport.height = 150;
    const { result } = renderHook(() => useKeyboardSafeSheet(true));
    expect(result.current.keyboardOpen).toBe(true);
    const style = result.current.style!;
    expect(Number(style.top) + Number(style.height)).toBeLessThan(150);
    expect(style.minHeight).toBe(0);
  });

  it('restores normal sizing after keyboard dismissal and leaves resized Android layouts alone', () => {
    input.focus();
    viewport.height = 350;
    const { result, rerender } = renderHook(({ enabled }) => useKeyboardSafeSheet(enabled), { initialProps: { enabled: true } });
    expect(result.current.style).not.toBeNull();
    act(() => {
      viewport.height = 800;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(result.current.style).toBeNull();
    vi.stubGlobal('innerHeight', 350);
    act(() => {
      viewport.height = 350;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(result.current.style).toBeNull();
    rerender({ enabled: false });
    expect(result.current.keyboardOpen).toBe(false);
  });
});
