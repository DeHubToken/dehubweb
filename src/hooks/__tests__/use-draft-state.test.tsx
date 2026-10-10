import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { useStoredDraftState, accountDraftKey, type DraftSetter } from '../use-draft-state';
import { __resetDraftCacheForTests, readDraft } from '@/lib/draft-cache';

let root: Root;
let node: HTMLDivElement;
let change: DraftSetter<string>;
function Field({ account = 'alice', place = 'room:one', initial = '' }) {
  const [text, setText] = useStoredDraftState(accountDraftKey(account, place), initial);
  change = setText;
  return createElement('textarea', { value: text, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value) });
}
function render(props = {}) { act(() => root.render(createElement(Field, props))); }
function shown() { return node.querySelector('textarea')!.value; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); __resetDraftCacheForTests();
  node = document.createElement('div'); root = createRoot(node);
});
afterEach(() => { act(() => root.unmount()); node.remove(); });

describe('durable field lifecycle', () => {
  it('writes synchronously and restores exact text after a fresh storage load', () => {
    render(); act(() => change('  unfinished\n\n'));
    act(() => root.unmount()); __resetDraftCacheForTests(); root = createRoot(node);
    render(); expect(shown()).toBe('  unfinished\n\n');
  });
  it('isolates accounts and places before painting their fields', () => {
    render(); act(() => change('alice one'));
    render({ account: 'bob' }); expect(shown()).toBe('');
    act(() => change('bob one'));
    render({ place: 'room:two' }); expect(shown()).toBe('');
    render(); expect(shown()).toBe('alice one');
  });
  it('does not let delayed server initialization overwrite saved typing', () => {
    render(); act(() => change('unfinished edit'));
    act(() => change.initialize('server version'));
    expect(shown()).toBe('unfinished edit');
  });
  it('keeps empty edits as deliberate values', () => {
    render({ initial: 'server version' }); act(() => change(''));
    act(() => change.initialize('server version'));
    expect(shown()).toBe('');
  });
  it('retains a failed submission and clears only after successful completion', async () => {
    render(); act(() => change('send me'));
    try { await Promise.reject(new Error('offline')); change.clear(); } catch { /* keep draft */ }
    expect(JSON.parse(readDraft(accountDraftKey('alice', 'room:one')!)).value).toBe('send me');
    await Promise.resolve(); act(() => change.clear());
    expect(readDraft(accountDraftKey('alice', 'room:one')!)).toBe('');
    render(); expect(readDraft(accountDraftKey('alice', 'room:one')!)).toBe('');
  });
  it('an old request cannot overwrite the next conversation', () => {
    render(); act(() => change('old')); const finishOld = change;
    render({ place: 'room:two' }); act(() => change('new'));
    act(() => finishOld(''));
    expect(shown()).toBe('new');
    expect(JSON.parse(readDraft(accountDraftKey('alice', 'room:two')!)).value).toBe('new');
  });
  it('does not persist without an account', () => {
    render({ account: '' }); act(() => change('temporary'));
    expect(localStorage.length).toBe(0);
  });
});
