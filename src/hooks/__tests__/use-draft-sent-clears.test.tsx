import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useStoredTextDraft } from '@/hooks/use-draft';
import { useStoredDraftState } from '@/hooks/use-draft-state';
import { __resetDraftCacheForTests, readDraft } from '@/lib/draft-cache';

/** A message that went out must leave every box showing it empty. */

type TextHook = ReturnType<typeof useStoredTextDraft>;
type StateHook = ReturnType<typeof useStoredDraftState<string>>;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

function renderTwo<H>(useHook: () => H): [{ current: H }, { current: H }] {
  const a = { current: undefined as H };
  const b = { current: undefined as H };
  function A(): ReactNode { a.current = useHook(); return null; }
  function B(): ReactNode { b.current = useHook(); return null; }
  act(() => { root.render(createElement(Fragment, null, createElement(A), createElement(B))); });
  return [a, b];
}

describe('text drafts after a confirmed send', () => {
  it('clears when the keyboard added a trailing space while sending', () => {
    const [a] = renderTwo<TextHook>(() => useStoredTextDraft('dm:peer'));
    act(() => a.current[1]('hello there'));
    act(() => a.current[1]('hello there '));
    let done = false;
    act(() => { done = a.current[1].complete('hello there', ''); });
    expect(done).toBe(true);
    expect(a.current[0]).toBe('');
    expect(readDraft('dm:peer')).toBe('');
  });

  it('keeps words typed after pressing send', () => {
    const [a] = renderTwo<TextHook>(() => useStoredTextDraft('dm:peer'));
    act(() => a.current[1]('first'));
    act(() => a.current[1]('first and more'));
    act(() => { a.current[1].complete('first', ''); });
    expect(a.current[0]).toBe('first and more');
  });

  it('empties a second copy of the same box', () => {
    const [a, b] = renderTwo<TextHook>(() => useStoredTextDraft('dm:peer'));
    act(() => a.current[1]('sent text'));
    expect(b.current[0]).toBe('sent text');
    act(() => { a.current[1].complete('sent text', ''); });
    expect(a.current[0]).toBe('');
    expect(b.current[0]).toBe('');
  });

  it('keeps a fallback when unrelated drafts change', () => {
    const fallback = { current: undefined as unknown as TextHook };
    const other = { current: undefined as unknown as TextHook };
    function F(): ReactNode { fallback.current = useStoredTextDraft('dm:a', 'hi from link'); return null; }
    function O(): ReactNode { other.current = useStoredTextDraft('dm:b'); return null; }
    act(() => { root.render(createElement(Fragment, null, createElement(F), createElement(O))); });
    act(() => other.current[1]('typing elsewhere'));
    expect(fallback.current[0]).toBe('hi from link');
  });
});

describe('state drafts after a confirmed send', () => {
  it('clears a comment with a trailing newline and empties its twin', () => {
    const [a, b] = renderTwo<StateHook>(() => useStoredDraftState<string>('comment:1', ''));
    act(() => a.current[1]('nice post'));
    expect(b.current[0]).toBe('nice post');
    act(() => a.current[1]('nice post\n'));
    act(() => { a.current[1].complete('nice post', ''); });
    expect(a.current[0]).toBe('');
    expect(b.current[0]).toBe('');
  });
});
