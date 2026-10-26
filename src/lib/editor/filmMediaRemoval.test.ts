import { expect, it } from 'vitest';
import { useEditorStore } from '@/store/editorStore';
import { DEFAULT_SETTINGS } from './types';
import type { FilmProject } from './filmProject';
import { makeCloudProjectDocument } from './cloudProjectFormat';

it('removing media keeps the current project and its undo/redo film metadata saveable', () => {
  const filmProject: FilmProject = { version: 1, title: 'Film', brief: 'A journey', referenceMediaIds: ['ref'], shots: [{ id: 'shot', title: 'Arrival', prompt: 'Arrive', seconds: 5, referenceMediaIds: ['ref'], resultMediaId: 'result' }] };
  const settings = { ...DEFAULT_SETTINGS, filmProject };
  useEditorStore.setState({ settings, tracks: [], clips: [], media: [], past: [{ settings, tracks: [], clips: [] }], future: [{ settings, tracks: [], clips: [] }] });
  useEditorStore.getState().removeMedia('ref');
  useEditorStore.getState().removeMedia('result');
  const state = useEditorStore.getState();
  for (const value of [state.settings, state.past[0].settings, state.future[0].settings]) {
    expect(value.filmProject?.referenceMediaIds).toEqual([]);
    expect(value.filmProject?.shots[0].referenceMediaIds).toEqual([]);
    expect(value.filmProject?.shots[0].resultMediaId).toBeUndefined();
    expect(value.filmProject?.brief).toBe('A journey');
  }
  expect(makeCloudProjectDocument(state.toSnapshot(), '11111111-1111-4111-8111-111111111111', '0x' + '1'.repeat(40), new Map()).media).toEqual([]);
});
