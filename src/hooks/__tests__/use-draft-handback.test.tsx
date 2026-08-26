import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDraft } from '@/hooks/use-draft';
import { writeDraft, readDraft, __resetDraftCacheForTests } from '@/lib/draft-cache';

/**
 * When a send fails, DirectMessageChat writes the message back into the draft
 * store. That is only a recovery if the composer the user is looking at picks
 * it up — a store holding the text while the box stays empty is the original
 * bug wearing a different hat.
 *
 * Rendered with react-dom directly rather than @testing-library/react: nothing
 * here needs a DOM query, and this runs in environments where testing-library's
 * peer is not installed.
 */

interface Harness<P> {
  current: [string, (next: string | ((prev: string) => string)) => void];
  rerender: (props: P) => void;
}

let container: HTMLDivElement;
let root: Root;

function render<P>(useHook: (props: P) => [string, (n: string | ((p: string) => string)) => void], initial: P): Harness<P> {
  const harness = { current: undefined as never, rerender: undefined as never } as Harness<P>;

  function Probe({ props }: { props: P }): ReactNode {
    harness.current = useHook(props);
    return null;
  }

  harness.rerender = (props: P) => {
    act(() => { root.render(createElement(Probe, { props })); });
  };
  harness.rerender(initial);
  return harness;
}

beforeEach(() => {
  // Tells React this is an act() environment; without it every render logs a
  // warning and act does not flush effects the way the assertions expect.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  __resetDraftCacheForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('useDraft — external hand-back', () => {
  it('adopts a value written to its scope by something else', () => {
    const h = render((k: string) => useDraft(k), 'dm:0xabc');
    expect(h.current[0]).toBe('');

    // The composer cleared on send, then the send failed.
    act(() => { writeDraft('dm:0xabc', 'the message that did not go'); });

    expect(h.current[0]).toBe('the message that did not go');
  });

  it('ignores writes to a different scope', () => {
    const h = render((k: string) => useDraft(k), 'dm:0xabc');
    act(() => { writeDraft('dm:0xother', 'not for this thread'); });
    expect(h.current[0]).toBe('');
  });

  it('does not blank a composer someone is typing into when the scope is cleared', () => {
    const h = render((k: string) => useDraft(k), 'dm:0xabc');
    act(() => { h.current[1]('mid sentence'); });
    expect(h.current[0]).toBe('mid sentence');

    // A second tab sending its own draft clears the shared scope.
    act(() => { writeDraft('dm:0xabc', ''); });

    expect(h.current[0]).toBe('mid sentence');
  });

  it('still clears itself on its own send', () => {
    const h = render((k: string) => useDraft(k), 'dm:0xabc');
    act(() => { h.current[1]('outgoing'); });
    act(() => { h.current[1](''); });
    expect(h.current[0]).toBe('');
    expect(readDraft('dm:0xabc')).toBe('');
  });

  it('does not loop: its own write is not re-adopted as external', () => {
    const h = render((k: string) => useDraft(k), 'dm:0xabc');
    act(() => { h.current[1]('typed here'); });
    expect(h.current[0]).toBe('typed here');
    expect(readDraft('dm:0xabc')).toBe('typed here');
  });

  it('loads the incoming thread when the scope changes', () => {
    writeDraft('dm:0xbbb', 'parked for B');
    const h = render((k: string) => useDraft(k), 'dm:0xaaa');
    act(() => { h.current[1]('parked for A'); });

    h.rerender('dm:0xbbb');
    expect(h.current[0]).toBe('parked for B');

    h.rerender('dm:0xaaa');
    expect(h.current[0]).toBe('parked for A');
  });
});
