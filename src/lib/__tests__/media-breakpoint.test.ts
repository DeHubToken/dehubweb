import { afterEach, expect, it, vi } from 'vitest';

const originalViewport = Object.getOwnPropertyDescriptor(window, 'innerWidth')!;
afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(window, 'innerWidth', originalViewport); });
it('caches the media breakpoint and follows changes without reading layout per card', async () => {
  vi.resetModules();
  const viewport = vi.fn(() => { throw new Error('layout read'); });
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: viewport });
  let changed = (_event: { matches: boolean }) => {};
  const query = { matches: false, addEventListener: vi.fn((_name, fn) => { changed = fn; }) };
  const match = vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
  const { isMdUp } = await import('../media-url');
  for (let row = 0; row < 100; row++) expect(isMdUp()).toBe(false);
  changed({ matches: true });
  expect(isMdUp()).toBe(true);
  expect(match).toHaveBeenCalledTimes(1);
  expect(viewport).not.toHaveBeenCalled();
});
