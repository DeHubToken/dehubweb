import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Drawer } from 'vaul';

afterEach(cleanup);

it('does not track document scroll when drawer body restoration is disabled', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'scrollY')!;
  const read = vi.fn(() => 0);
  Object.defineProperty(window, 'scrollY', { configurable: true, get: read });
  try {
    render(<Drawer.Root noBodyStyles><div>Closed sheet</div></Drawer.Root>);
    window.dispatchEvent(new Event('scroll'));
    expect(read).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(window, 'scrollY', original);
  }
});
