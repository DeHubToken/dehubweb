import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentPanel } from './AgentPanel';
import { useEditorAgentStore } from '@/store/editorAgentStore';
import { useEditorStore } from '@/store/editorStore';
import { useEditorUiStore } from '@/store/editorUiStore';
import { askAgent } from '@/lib/editor/agent';
import { saveProject } from '@/lib/editor/projectStore';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => ({ walletAddress: null }) }));
vi.mock('@/lib/editor/agent', () => ({ askAgent: vi.fn(), applyOps: vi.fn(), askSceneAgent: vi.fn() }));
vi.mock('@/lib/editor/projectStore', () => ({ saveProject: vi.fn(async () => {}), setLastProjectId: vi.fn() }));
vi.mock('@/lib/editor/useHighlightChat', () => ({
  useHighlightChat: () => [{ clipId: null, busy: false }, {
    state: { busy: false }, reviewing: false, matchesSource: () => true, reset: vi.fn(),
  }],
}));

describe('reviewing generation drafts from editor chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.getState().newProject();
    useEditorAgentStore.setState({ entries: [], busy: false });
    useEditorUiStore.setState({ panel: 'agent', generatePrefill: null });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  });
  afterEach(cleanup);

  it('opens the chosen entry, including reopening an older voice request after a video request', () => {
    const voice = { kind: 'voice' as const, prompt: 'First sentence. Keep the last sentence.' };
    const video = { kind: 'video' as const, prompt: 'Second request: waves.', aspect: '9:16' };
    useEditorAgentStore.setState({ entries: [
      { id: 'voice', role: 'assistant', content: 'Voice draft', report: { applied: 0, failed: 0, missingStock: [], generate: voice } },
      { id: 'video', role: 'assistant', content: 'Video draft', report: { applied: 0, failed: 0, missingStock: [], generate: video } },
    ] });
    const clips = useEditorStore.getState().clips;
    const past = useEditorStore.getState().past;
    render(<AgentPanel />);
    const review = screen.getAllByRole('button', { name: 'editor.agent.openGenerator' });
    fireEvent.click(review[1]);
    expect(useEditorUiStore.getState()).toMatchObject({ panel: 'generate', generatePrefill: video });
    act(() => useEditorUiStore.getState().setGeneratePrefill(null));
    fireEvent.click(review[0]);
    expect(useEditorUiStore.getState().generatePrefill).toEqual(voice);
    expect(screen.queryByRole('button', { name: 'editor.agent.undo' })).not.toBeInTheDocument();
    expect(useEditorStore.getState().clips).toBe(clips);
    expect(useEditorStore.getState().past).toBe(past);
  });
  it('reviews and assembles actual clips without a planner call, preserves the saved source and Undo stays in the copy', async () => {
    useEditorStore.setState({ clips: [
      { id: 'one', kind: 'video', mediaId: 'source', trackId: 'v', start: 5, duration: 4, trimIn: 2 },
      { id: 'two', kind: 'image', mediaId: 'photo', trackId: 'p', start: 10, duration: 4, trimIn: 0 },
    ], tracks: [{ id: 'v', kind: 'video', name: 'Video', hidden: false, muted: false }, { id: 'p', kind: 'video', name: 'Photo', hidden: false, muted: false }] });
    const original = useEditorStore.getState().toSnapshot();
    render(<AgentPanel />);
    const field = screen.getByRole('textbox', { name: 'editor.agent.placeholder' });
    fireEvent.change(field, { target: { value: 'Create a 6 second video from my clips with fades' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    expect(screen.getByText('easyTrade.reviewTitle · editor.video.video')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2); expect(askAgent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'editor.menu.bringForward 2' }));
    const length = screen.getByRole('textbox', { name: 'filters.duration 1' });
    fireEvent.change(length, { target: { value: '1.' } }); expect(length).toHaveValue('1.');
    fireEvent.change(length, { target: { value: '1.25' } });
    const offset = screen.getByRole('textbox', { name: 'editor.shots.preview 1' });
    fireEvent.change(offset, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'editor.shots.preview —' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'nav.create' })).toBeDisabled();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    fireEvent.change(offset, { target: { value: '1.5' } });
    expect(useEditorStore.getState().clips).toBe(original.clips); expect(useEditorStore.getState().past).toHaveLength(0);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'nav.create' })));
    const copy = useEditorStore.getState().toSnapshot();
    expect(copy.id).not.toBe(original.id); expect(copy.clips.map(c => [c.kind, c.start, c.duration])).toEqual([['image', 0, 1.25], ['video', 1.25, 3]]);
    expect(vi.mocked(saveProject).mock.calls.map(args => args[0].id)).toEqual([original.id, copy.id]);
    act(() => useEditorStore.getState().undo()); expect(useEditorStore.getState().projectId).toBe(copy.id); expect(useEditorStore.getState().clips).toEqual(original.clips);
  });
});
