import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Autosave } from './Autosave';
import { useEditorStore } from '@/store/editorStore';
import { __resetDraftCacheForTests, flushDrafts, writeDraft } from '@/lib/draft-cache';
import { readEditorRecovery } from '@/lib/editor/draftRecovery';
import type { ProjectSnapshot } from '@/lib/editor/types';

const projectStorage = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn() }));
vi.mock('@/hooks/use-draft-state', () => ({ useAccountDraftKey: () => 'account:alice|editor:recovery' }));
vi.mock('@/lib/editor/projectStore', () => ({
  saveProject: projectStorage.save,
  loadProject: projectStorage.load,
  setLastProjectId: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  __resetDraftCacheForTests();
  useEditorStore.getState().newProject();
  projectStorage.save.mockReset().mockResolvedValue(undefined);
  projectStorage.load.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('saves the final keystrokes synchronously and flushes on navigation before the debounce', async () => {
  const view = render(<Autosave />);
  act(() => useEditorStore.getState().setProjectTitle('  final keystrokes\n'));
  const id = useEditorStore.getState().projectId;
  expect(readEditorRecovery('account:alice|editor:recovery', id)?.title).toBe('  final keystrokes\n');
  expect(projectStorage.save).not.toHaveBeenCalled();
  await act(async () => view.unmount());
  expect(projectStorage.save).toHaveBeenCalledWith(expect.objectContaining({ id, title: '  final keystrokes\n' }));
});

it('restores after a cold storage load even when the database save never finishes', async () => {
  projectStorage.save.mockImplementation(() => new Promise(() => {}));
  const first = render(<Autosave />);
  act(() => useEditorStore.getState().setProjectTitle('Recovered before the timer'));
  await act(async () => first.unmount());
  __resetDraftCacheForTests();
  useEditorStore.getState().newProject();
  render(<Autosave />);
  expect(useEditorStore.getState().projectTitle).toBe('Recovered before the timer');
});

it('ignores late database hydration once the current project has changed', async () => {
  let finish!: (snapshot: ProjectSnapshot) => void;
  projectStorage.load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const old = { ...useEditorStore.getState().toSnapshot(), id: 'old', title: 'Old database title' };
  writeDraft('account:alice|editor:recovery:last', old.id);
  flushDrafts();
  render(<Autosave />);
  act(() => useEditorStore.getState().setProjectTitle('Typing while loading'));
  await act(async () => finish(old));
  expect(useEditorStore.getState().projectTitle).toBe('Typing while loading');
});
