import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FilmProjectPanel } from './FilmProjectPanel';
import { useEditorStore, type MediaItem } from '@/store/editorStore';
import { useEditorUiStore } from '@/store/editorUiStore';
import { DEFAULT_SETTINGS } from '@/lib/editor/types';
import { makeCloudProjectDocument } from '@/lib/editor/cloudProjectFormat';

const mock = vi.hoisted(() => ({ save: vi.fn(async () => {}) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: 'alice' }) }));
vi.mock('@/lib/editor/projectStore', () => ({ saveProject: mock.save }));
vi.mock('@/lib/editor/importFiles', () => ({ importOneFile: vi.fn() }));
vi.mock('../app/creator/studio/CinemaDirectionControls', () => ({ CinemaDirectionControls: () => null }));

beforeEach(() => {
  const reference: MediaItem = { id: 'ref', name: 'Character reference', kind: 'image', mimeType: 'image/png', width: 64, height: 64, size: 1, createdAt: 1, url: 'blob:reference' };
  useEditorStore.setState({ projectId: 'film-project', projectTitle: 'Film', settings: { ...DEFAULT_SETTINGS, filmProject: { version: 1, title: 'Film', brief: 'A journey', referenceMediaIds: ['ref'], shots: [{ id: 'shot', title: 'Arrival', prompt: 'Arrive at the coast', seconds: 5, referenceMediaIds: ['ref'], resultMediaId: 'result' }] } }, tracks: [], clips: [], media: [reference, { ...reference, id: 'result', name: 'Accepted result', url: 'blob:result' }], past: [], future: [] });
  useEditorUiStore.setState({ generatePrefill: null, generatorWindow: 'closed' });
  mock.save.mockClear();
});
afterEach(cleanup);

it('updates rendered reference/result controls after media removal and keeps the remaining film saveable', () => {
  render(<FilmProjectPanel />);
  expect(screen.getByLabelText('editor.film.sharedReferences')).toHaveValue(['ref']);
  expect(screen.getByLabelText('editor.film.result')).toHaveValue('result');
  act(() => useEditorStore.getState().removeMedia('ref'));
  expect(screen.getByLabelText('editor.film.sharedReferences')).toHaveValue([]);
  expect(screen.getByLabelText('editor.film.shotReferences')).toHaveValue([]);
  act(() => useEditorStore.getState().removeMedia('result'));
  expect(screen.getByLabelText('editor.film.result')).toHaveValue('');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  const current = useEditorStore.getState().toSnapshot();
  expect(current.settings.filmProject?.shots[0].prompt).toBe('Arrive at the coast');
  expect(makeCloudProjectDocument(current, '11111111-1111-4111-8111-111111111111', '0x' + '1'.repeat(40), new Map()).media).toEqual([]);
});

it('saves the film before opening an owned draft with its actual media references', async () => {
  render(<FilmProjectPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'editor.film.frame' }));
  await waitFor(() => expect(useEditorUiStore.getState().generatorWindow).toBe('open'));
  expect(mock.save).toHaveBeenCalledTimes(1);
  expect(useEditorUiStore.getState().generatePrefill).toMatchObject({ kind: 'image', owner: 'alice', references: [{ url: 'blob:reference', label: 'Character reference' }] });
});
