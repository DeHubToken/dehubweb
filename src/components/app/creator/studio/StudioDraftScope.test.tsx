import React, { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { readStudioSnapshot, StudioDraftScope, writeStudioSnapshot } from './StudioDraftScope';
import { useMarketingHandoff } from '@/hooks/use-marketing-handoff';
import { __resetDraftCacheForTests } from '@/lib/draft-cache';

function Draft({ storageKey, initial = '' }: { storageKey: string; initial?: string }) {
  const [text, setText] = useState(() => {
    const saved = readStudioSnapshot(storageKey);
    return saved ? JSON.parse(saved).prompt : initial;
  });
  useEffect(() => { writeStudioSnapshot(storageKey, { prompt: text }); }, [storageKey, text]);
  return <input aria-label="Draft" value={text} onChange={event => setText(event.target.value)} />;
}
beforeEach(() => { localStorage.clear(); __resetDraftCacheForTests(); });
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

function CampaignPage({ owner }: { owner: string | null }) {
  const { active, prepare, leave } = useMarketingHandoff(owner);
  return <>
    <button onClick={() => prepare({ kind: 'image', prompt: 'Prepared campaign', aspect: '1:1' })}>Prepare</button>
    <button onClick={leave}>Return</button>
    <StudioDraftScope owner={owner} scope={active ? `campaign:${active.id}` : 'main'}>{storageKey => <Draft storageKey={storageKey} initial={active?.draft.prompt} />}</StudioDraftScope>
  </>;
}

it('restores the active campaign and its edits after a page reload, then returns to the original studio draft', () => {
  const ui = render(<CampaignPage owner="alice" />);
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Original studio draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare' }));
  expect(screen.getByLabelText('Draft')).toHaveValue('Prepared campaign');
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Edited campaign after review' } });
  ui.unmount();
  __resetDraftCacheForTests();
  const reloaded = render(<CampaignPage owner="alice" />);
  expect(screen.getByLabelText('Draft')).toHaveValue('Edited campaign after review');
  reloaded.rerender(<CampaignPage owner="bob" />);
  expect(screen.getByLabelText('Draft')).toHaveValue('');
  reloaded.rerender(<CampaignPage owner="alice" />);
  expect(screen.getByLabelText('Draft')).toHaveValue('Edited campaign after review');
  fireEvent.click(screen.getByRole('button', { name: 'Return' }));
  expect(screen.getByLabelText('Draft')).toHaveValue('Original studio draft');
  reloaded.unmount();
  __resetDraftCacheForTests();
  render(<CampaignPage owner="alice" />);
  expect(screen.getByLabelText('Draft')).toHaveValue('Original studio draft');
});
