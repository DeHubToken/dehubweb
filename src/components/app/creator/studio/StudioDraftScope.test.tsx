import React, { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { readStudioSnapshot, StudioDraftScope, writeStudioSnapshot } from './StudioDraftScope';

function Draft({ storageKey, initial = '' }: { storageKey: string; initial?: string }) {
  const [text, setText] = useState(() => {
    const saved = readStudioSnapshot(storageKey);
    return saved ? JSON.parse(saved).prompt : initial;
  });
  useEffect(() => { writeStudioSnapshot(storageKey, { prompt: text }); }, [storageKey, text]);
  return <input aria-label="Draft" value={text} onChange={event => setText(event.target.value)} />;
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('isolates cached account and campaign drafts across mounted transitions and remounts', () => {
  const workspace = (owner: string | null, scope = 'main', initial = '') => <StudioDraftScope owner={owner} scope={scope}>{storageKey => <Draft storageKey={storageKey} initial={initial} />}</StudioDraftScope>;
  const ui = render(workspace('alice'));
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Unfinished original' } });
  ui.rerender(workspace('alice', 'campaign:first', 'Square campaign'));
  expect(screen.getByLabelText('Draft')).toHaveValue('Square campaign');
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Edited campaign' } });
  ui.rerender(workspace('alice', 'campaign:second', 'Vertical campaign'));
  expect(screen.getByLabelText('Draft')).toHaveValue('Vertical campaign');
  ui.rerender(workspace('bob'));
  expect(screen.getByLabelText('Draft')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Bobs draft' } });
  ui.rerender(workspace(null));
  expect(screen.getByLabelText('Draft')).toHaveValue('');
  ui.rerender(workspace('alice'));
  expect(screen.getByLabelText('Draft')).toHaveValue('Unfinished original');
  ui.rerender(workspace('alice', 'campaign:first', 'Square campaign'));
  expect(screen.getByLabelText('Draft')).toHaveValue('Edited campaign');
  ui.unmount();
  render(workspace('alice', 'campaign:first', 'Square campaign'));
  expect(screen.getByLabelText('Draft')).toHaveValue('Edited campaign');
});

it('does not restore legacy unowned snapshot contents into another account', () => {
  localStorage.setItem('dehub:creator-studio:v1', JSON.stringify({ prompt: 'Unowned private brief' }));
  render(<StudioDraftScope owner="bob">{storageKey => <Draft storageKey={storageKey} />}</StudioDraftScope>);
  expect(screen.getByLabelText('Draft')).toHaveValue('');
});
