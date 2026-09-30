import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Drawer, DrawerContent, DrawerTitle } from './drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// An exit that never sends animationend must never retain a modal's locks.
function Surface({ kind, open }: { kind: string; open: boolean }) {
  const style = { animationName: open ? 'enter' : 'exit', animationDuration: '10s' };
  if (kind === 'drawer') return <Drawer open={open}>
    <DrawerContent style={style} aria-describedby={undefined}><DrawerTitle>Drawer</DrawerTitle></DrawerContent>
  </Drawer>;
  if (kind === 'menu') return <DropdownMenu open={open}>
    <DropdownMenuTrigger>Options</DropdownMenuTrigger>
    <DropdownMenuContent style={style}><DropdownMenuItem>Details</DropdownMenuItem></DropdownMenuContent>
  </DropdownMenu>;
  if (kind === 'popover') return <Popover open={open} modal>
    <PopoverTrigger>Tools</PopoverTrigger>
    <PopoverContent style={style}>Tools</PopoverContent>
  </Popover>;
  return <Dialog open={open}>
    <DialogContent style={style} aria-describedby={undefined}><DialogTitle>Dialog</DialogTitle></DialogContent>
  </Dialog>;
}

describe.each(['drawer', 'dialog', 'menu', 'popover'])('%s scroll release', (kind) => {
  it('releases scroll and pointer locks in the close commit without an animation event', () => {
    const { rerender } = render(<Surface kind={kind} open />);
    expect(document.body.getAttribute('data-scroll-locked')).not.toBeNull();
    rerender(<Surface kind={kind} open={false} />);
    expect(document.querySelector('[role="dialog"], [role="menu"], [data-vaul-overlay]')).toBeNull();
    expect(document.body.getAttribute('data-scroll-locked')).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe('none');
    rerender(<Surface kind={kind} open />);
    expect(document.body.getAttribute('data-scroll-locked')).not.toBeNull();
    rerender(<Surface kind={kind} open={false} />);
    expect(document.body.getAttribute('data-scroll-locked')).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe('none');
  });

  it('releases portals when the owning cached page is hidden', () => {
    const page = (active: boolean) => <CachedPageActiveContext.Provider value={active}>
      <Surface kind={kind} open />
    </CachedPageActiveContext.Provider>;
    const { rerender } = render(page(true));
    rerender(page(false));
    expect(document.body.getAttribute('data-scroll-locked')).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe('none');
  });
});

it('keeps an underlying dialog locked when the top dialog closes', () => {
  const pair = (topOpen: boolean) => <><Surface kind="dialog" open /><Surface kind="dialog" open={topOpen} /></>;
  const { rerender, unmount } = render(pair(true));
  rerender(pair(false));
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.body.getAttribute('data-scroll-locked')).not.toBeNull();
  expect(document.body.style.pointerEvents).toBe('none');
  unmount();
  expect(document.body.getAttribute('data-scroll-locked')).toBeNull();
  expect(document.body.style.pointerEvents).not.toBe('none');
});
