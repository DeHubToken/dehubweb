import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { useDraftState, useStoredDraftState, accountDraftKey, type DraftSetter } from '../use-draft-state';
import { __resetDraftCacheForTests, readDraft } from '@/lib/draft-cache';
import { useDraft } from '../use-draft';

let root: Root;
let node: HTMLDivElement;
let change: DraftSetter<string>;
function Field({ account = 'alice', place = 'room:one', initial = '' }) {
  const [text, setText] = useStoredDraftState(accountDraftKey(account, place), initial);
  change = setText;
  return createElement('textarea', { value: text, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value) });
}
function GuestField() {
  const [text, setText] = useDraftState('comment:42:text', '');
  change = setText;
  return createElement('textarea', { value: text, readOnly: true });
}
let changeGuestChat: (text: string) => void;
function GuestChatField() {
  const [text, setText] = useDraft('room:public');
  changeGuestChat = setText;
  return createElement('textarea', { value: text, readOnly: true });
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
  it('restores signed-out public chat through the text draft hook after reload', () => {
    act(() => root.render(createElement(GuestChatField)));
    act(() => changeGuestChat('  public chat\n '));
    act(() => root.unmount());
    __resetDraftCacheForTests();
    root = createRoot(node);
    act(() => root.render(createElement(GuestChatField)));
    expect(shown()).toBe('  public chat\n ');
  });
  it('restores a guest comment immediately after closing and a cold cache reload', () => {
    act(() => root.render(createElement(GuestField)));
    act(() => change('  guest reply\n '));
    act(() => root.unmount());
    __resetDraftCacheForTests();
    root = createRoot(node);
    act(() => root.render(createElement(GuestField)));
    expect(shown()).toBe('  guest reply\n ');
  });
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
  it('successful submission cannot discard newer typing', () => {
    render(); act(() => change('first message'));
    const submitted = shown();
    act(() => change('next message'));
    act(() => change.complete(submitted, ''));
    expect(shown()).toBe('next message');
    expect(JSON.parse(readDraft(accountDraftKey('alice', 'room:one')!)).value).toBe('next message');
    act(() => change.complete('next message', ''));
    expect(shown()).toBe('');
    expect(readDraft(accountDraftKey('alice', 'room:one')!)).toBe('');
  });
  it('does not persist without an account', () => {
    render({ account: '' }); act(() => change('temporary'));
    expect(localStorage.length).toBe(0);
  });
  it('does not clear newer typing from another tab before its storage event arrives', () => {
    render(); act(() => change('submitted'));
    const key = accountDraftKey('alice', 'room:one')!;
    const disk = JSON.parse(localStorage.getItem('dehub-drafts-v1')!);
    disk.d[key] = { t: JSON.stringify({ value: 'written in another tab' }), u: Date.now() + 1 };
    localStorage.setItem('dehub-drafts-v1', JSON.stringify(disk));
    act(() => expect(change.complete('submitted', '')).toBe(false));
    expect(JSON.parse(readDraft(key)).value).toBe('written in another tab');
  });
  it.each(['dm:peer', 'room:sidebar', 'comment:post:reply', 'post:new:article', 'assistant:conversation', 'editor:project:clip', 'community:form', 'work:job:proof', 'store:listing:title'])(
    'restores %s separately from its neighbouring entity and account', (place) => {
      render({ place }); act(() => change('  unfinished\n '));
      const completeOld = change;
      render({ place: `${place}:other` }); act(() => change('neighbour'));
      act(() => completeOld.complete('  unfinished\n ', ''));
      expect(shown()).toBe('neighbour');
      render({ place, account: 'bob' }); expect(shown()).toBe('');
      render({ place }); expect(shown()).toBe('');
      render({ place: `${place}:other` }); expect(shown()).toBe('neighbour');
    },
  );
});
