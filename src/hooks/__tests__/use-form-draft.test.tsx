import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFormDraft, type FormDraftControls } from '@/hooks/use-form-draft';
import { readDraft, writeDraft, __resetDraftCacheForTests } from '@/lib/draft-cache';

/**
 * The forms this covers are plain lazy routes, so they unmount the moment the
 * user goes to look up the link they are being asked for. What matters: an
 * untouched form leaves nothing behind, a filled one comes back, and a
 * submitted one does not.
 */

const SCOPE = 'form:probe';

let container: HTMLDivElement;
let root: Root;
/** Set the probe's fields from outside the tree. */
let setFields: (title: string, body: string) => void;
/** The controls the probe was handed on its last render. */
let controls: FormDraftControls;

function Probe() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  setFields = (t, b) => { setTitle(t); setBody(b); };
  controls = useFormDraft('probe', { title, body }, (saved) => {
    if (saved.title) setTitle(saved.title);
    if (saved.body) setBody(saved.body);
  });
  return createElement('div', null, `${title}|${body}`);
}

/** Mount fresh and let the restore microtask land. */
async function mount() {
  await act(async () => {
    root.render(createElement(Probe));
    await Promise.resolve();
  });
}

const shown = () => container.textContent;

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

describe('useFormDraft', () => {
  it('writes nothing for a form that was opened and not touched', async () => {
    await mount();
    expect(readDraft(SCOPE)).toBe('');
  });

  it('saves what was typed', async () => {
    await mount();
    act(() => setFields('a title', 'a body'));
    expect(JSON.parse(readDraft(SCOPE))).toEqual({ title: 'a title', body: 'a body' });
  });

  it('restores a saved draft on the next mount', async () => {
    writeDraft(SCOPE, JSON.stringify({ title: 'kept', body: 'also kept' }));
    await mount();
    expect(shown()).toBe('kept|also kept');
  });

  it('tolerates a draft from an older build that is missing a field', async () => {
    writeDraft(SCOPE, JSON.stringify({ title: 'only the title' }));
    await mount();
    expect(shown()).toBe('only the title|');
  });

  it('drops an unparseable draft rather than wedging the form', async () => {
    writeDraft(SCOPE, 'not json at all');
    await mount();
    expect(shown()).toBe('|');
    expect(readDraft(SCOPE)).toBe('');
  });

  it('clear() removes it, so a submitted form does not come back pre-filled', async () => {
    await mount();
    act(() => setFields('sent', 'sent'));
    expect(readDraft(SCOPE)).not.toBe('');

    act(() => controls.clear());
    expect(readDraft(SCOPE)).toBe('');
  });

  it('emptying every field clears the draft instead of resurrecting it later', async () => {
    await mount();
    act(() => setFields('typed', 'typed'));
    expect(readDraft(SCOPE)).not.toBe('');

    act(() => setFields('', ''));
    expect(readDraft(SCOPE)).toBe('');
  });

  it('namespaces under form: so it cannot collide with a chat scope', async () => {
    await mount();
    act(() => setFields('x', 'y'));
    expect(readDraft('probe')).toBe('');
    expect(readDraft(SCOPE)).not.toBe('');
  });
});
