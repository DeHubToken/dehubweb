import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useDraftReferences, type DraftReferenceAdoption } from '@/lib/editor/useDraftReferences';

let saved: DraftReferenceAdoption | null = null;
function Controls({ restored = null }: { restored?: DraftReferenceAdoption | null }) {
  const [adoption, setAdoption] = useState(restored);
  const [references, setReferences] = useState<string[]>([]);
  const draft = useDraftReferences(adoption, setAdoption, 'alice:shot');
  saved = adoption;
  return <>
    <button onClick={() => { if (draft.adopt('shot-v1', true)) setReferences(['Original reference']); }}>Reopen</button>
    <button onClick={() => { setReferences(['Chosen reference']); draft.modified(); }}>Choose</button>
    <button onClick={() => { setReferences([]); draft.modified(); }}>Remove</button>
    <button onClick={() => { if (draft.adopt('shot-v2', false)) setReferences(['New draft reference']); }}>New draft</button>
    <output aria-label="References">{references.join(', ')}</output>
  </>;
}
afterEach(cleanup);
it('preserves visible changed and removed references through reopen/reload and accepts a new draft explicitly', () => {
  const ui = render(<Controls restored={{ id: 'shot-v1', modified: false }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  expect(screen.getByLabelText('References')).toHaveTextContent('Original reference');
  fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  expect(screen.getByLabelText('References')).toHaveTextContent('Chosen reference');
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  const restored = saved; ui.unmount();
  render(<Controls restored={restored} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  expect(screen.getByLabelText('References')).toBeEmptyDOMElement();
  fireEvent.click(screen.getByRole('button', { name: 'New draft' }));
  expect(screen.getByLabelText('References')).toHaveTextContent('New draft reference');
});
