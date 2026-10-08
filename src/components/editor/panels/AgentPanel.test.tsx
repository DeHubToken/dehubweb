import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentPanel } from './AgentPanel';
import { useEditorAgentStore } from '@/store/editorAgentStore';
import { useEditorStore } from '@/store/editorStore';
import { useEditorUiStore } from '@/store/editorUiStore';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => ({ walletAddress: null }) }));
vi.mock('@/lib/editor/agent', () => ({ askAgent: vi.fn(), applyOps: vi.fn(), askSceneAgent: vi.fn() }));
vi.mock('@/lib/editor/useHighlightChat', () => ({
  useHighlightChat: () => [{ clipId: null, busy: false }, {
    state: { busy: false }, reviewing: false, matchesSource: () => true, reset: vi.fn(),
  }],
}));

describe('reviewing generation drafts from editor chat', () => {
  beforeEach(() => {
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
});
