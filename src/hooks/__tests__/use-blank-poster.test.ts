import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useBlankPoster } from '../use-blank-poster';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('never carries a blank classification onto a new URL or accepts stale callbacks', () => {
  const images: any[] = [];
  vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror = null; constructor() { images.push(this); } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(32 * 18 * 4) }),
  } as any);
  const { result, rerender } = renderHook(({ url }) => useBlankPoster(url), { initialProps: { url: 'blank-a' } });
  act(() => images[0].onload());
  expect(result.current).toBe(true);
  rerender({ url: 'new-b' });
  expect(result.current).toBe(false);
  rerender({ url: 'new-c' });
  act(() => images[1].onload());
  expect(result.current).toBe(false);
  rerender({ url: 'blank-a' });
  expect(result.current).toBe(true);
});
