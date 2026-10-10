import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentPanel } from './AgentPanel';
import { useEditorAgentStore } from '@/store/editorAgentStore';
import { useEditorStore } from '@/store/editorStore';
import { useEditorUiStore } from '@/store/editorUiStore';
import { askAgent, applyOps } from '@/lib/editor/agent';
import { saveProject } from '@/lib/editor/projectStore';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => ({ walletAddress: null }) }));
vi.mock('@/lib/editor/agent', () => ({ askAgent: vi.fn(), applyOps: vi.fn(), askSceneAgent: vi.fn() }));
vi.mock('@/lib/editor/projectStore', () => ({ saveProject: vi.fn(async () => {}), setLastProjectId: vi.fn() }));
vi.mock('@/lib/scroll-freeze-watchdog', () => ({ settleAfterOverlayClose: vi.fn() }));
vi.mock('@/lib/editor/useHighlightChat', () => ({
  useHighlightChat: () => [{ clipId: null, busy: false }, {
    state: { busy: false }, reviewing: false, matchesSource: () => true, reset: vi.fn(),
  }],
}));

describe('reviewing generation drafts from editor chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.getState().newProject();
    useEditorStore.setState({ media: [] });
    useEditorAgentStore.setState({ entries: [], busy: false });
    useEditorUiStore.setState({ panel: 'agent', generatePrefill: null });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  });
  afterEach(cleanup);

  const imported = () => [
    { id: 'import-photo', name: 'Imported photo.png', kind: 'image' as const, mimeType: 'image/png', width: 640, height: 360, size: 100, createdAt: 1, url: 'blob:photo' },
    { id: 'import-video', name: 'Imported footage.mp4', kind: 'video' as const, mimeType: 'video/mp4', width: 640, height: 360, duration: 6, size: 200, createdAt: 2, url: 'blob:video' },
    { id: 'import-music', name: 'Imported music.wav', kind: 'audio' as const, mimeType: 'audio/wav', width: 0, height: 0, duration: 3, size: 300, createdAt: 3, url: 'blob:music' },
  ];

  it('chooses real imports on an empty timeline, previews independently and saves a separate exact-length assembly', async () => {
    useEditorStore.setState({ media: imported() });
    const original = useEditorStore.getState().toSnapshot(), history = useEditorStore.getState().past;
    render(<AgentPanel />);
    const field = screen.getByRole('textbox', { name: 'editor.agent.placeholder' });
    fireEvent.change(field, { target: { value: 'Create a 10 second video from my imported photos and clips with fades and music' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    expect(screen.getByRole('checkbox', { name: 'Imported photo.png' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Imported footage.mp4' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Imported photo.png' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Imported footage.mp4' }));
    expect(screen.getByRole('textbox', { name: 'filters.duration 1' })).toHaveValue('5');
    expect(screen.getByRole('textbox', { name: 'filters.duration 2' })).toHaveValue('5');
    const playhead = useEditorStore.getState().currentTime;
    fireEvent.click(screen.getAllByRole('button', { name: /^editor.shots.preview / })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Imported photo.png' })).toHaveAttribute('src', 'blob:photo');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useEditorStore.getState().clips).toBe(original.clips);
    expect(useEditorStore.getState().past).toBe(history); expect(useEditorStore.getState().currentTime).toBe(playhead);
    fireEvent.change(screen.getByRole('combobox', { name: 'editor.video.sound' }), { target: { value: '@assembly-library:import-music' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'nav.create' })));
    const copy = useEditorStore.getState().toSnapshot();
    expect(copy.id).not.toBe(original.id);
    expect(copy.clips.filter(c => c.kind !== 'audio').map(c => [c.kind, c.start, c.duration, 'mediaId' in c && c.mediaId])).toEqual([
      ['image', 0, 5, 'import-photo'], ['video', 5, 5, 'import-video'],
    ]);
    expect(copy.clips.filter(c => c.kind === 'audio').map(c => c.duration)).toEqual([3, 3, 3, 1]);
    expect(vi.mocked(saveProject).mock.calls.map(args => args[0].id)).toEqual([original.id, copy.id]);
    expect(vi.mocked(saveProject).mock.calls[0][0].clips).toBe(original.clips);
    expect(vi.mocked(saveProject).mock.calls[1][0].clips).toEqual(copy.clips);
    expect(askAgent).not.toHaveBeenCalled();
    act(() => useEditorStore.getState().undo()); expect(useEditorStore.getState().projectId).toBe(copy.id);
    expect(useEditorStore.getState().clips).toEqual([]);
  });

  it('assembles a file-only request in named order with its named music and no planner call', async () => {
    useEditorStore.setState({ media: imported() }); const original = useEditorStore.getState().toSnapshot();
    render(<AgentPanel />); const field = screen.getByRole('textbox', { name: 'editor.agent.placeholder' });
    fireEvent.change(field, { target: { value: 'Create a 10 second video from "Imported footage.mp4" then "Imported photo.png" with "Imported music.wav"' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    expect(screen.getByRole('checkbox', { name: 'Imported footage.mp4' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Imported photo.png' })).toBeChecked();
    expect(screen.getByText('1. Imported footage.mp4')).toBeInTheDocument();
    expect(screen.getByText('2. Imported photo.png')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'editor.video.sound' })).toHaveValue('@assembly-library:import-music');
    expect(askAgent).not.toHaveBeenCalled(); expect(useEditorStore.getState().clips).toBe(original.clips);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'nav.create' })));
    const copy = useEditorStore.getState().toSnapshot();
    expect(copy.id).not.toBe(original.id);
    expect(copy.clips.filter(c => c.kind !== 'audio').map(c => [c.kind, c.start, c.duration])).toEqual([['video', 0, 5], ['image', 5, 5]]);
    expect(copy.clips.filter(c => c.kind === 'audio').map(c => c.duration)).toEqual([3, 3, 3, 1]);
    expect(vi.mocked(saveProject).mock.calls.map(args => args[0].id)).toEqual([original.id, copy.id]);
  });

  it('blocks a selected imported file removed before Create without saving or changing the source', async () => {
    useEditorStore.setState({ media: imported() }); const original = useEditorStore.getState().toSnapshot();
    render(<AgentPanel />); const field = screen.getByRole('textbox', { name: 'editor.agent.placeholder' });
    fireEvent.change(field, { target: { value: 'Create a 10 second video from my imported photos' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Imported photo.png' }));
    act(() => useEditorStore.setState({ media: imported().filter(m => m.kind !== 'image') }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'nav.create' })));
    expect(saveProject).not.toHaveBeenCalled(); expect(useEditorStore.getState().projectId).toBe(original.id);
    expect(useEditorStore.getState().clips).toBe(original.clips); expect(useEditorStore.getState().past).toHaveLength(0);
    expect(screen.getByText('editor.agent.failed')).toBeInTheDocument();
  });

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
    expect(screen.getByRole('checkbox', { name: 'editor.video.video' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'editor.app.photo' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'editor.assembly.matchConsent' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'editor.assembly.matchScenes' })).toBeDisabled();
    expect(askAgent).not.toHaveBeenCalled();
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

  it('discards a delayed reply after a same-ID project reset', async () => {
    let finish!: (reply: Awaited<ReturnType<typeof askAgent>>) => void;
    vi.mocked(askAgent).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const original = useEditorStore.getState().toSnapshot();
    render(<AgentPanel />);
    const field = screen.getByRole('textbox', { name: 'editor.agent.placeholder' });
    fireEvent.change(field, { target: { value: 'Change the background to white' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    expect(useEditorStore.getState().editing).toBe(true);
    act(() => useEditorStore.getState().loadSnapshot(original));
    await act(async () => finish({ reply: 'Done', ops: [{ op: 'set_canvas', background: '#ffffff' }] }));
    expect(applyOps).not.toHaveBeenCalled();
    expect(useEditorStore.getState().settings.background).toBe(original.settings.background);
    expect(useEditorAgentStore.getState().busy).toBe(false);
  });

  it('preserves an edit made while a delayed chat reply is pending', async () => {
    let finish!: (reply: Awaited<ReturnType<typeof askAgent>>) => void;
    vi.mocked(askAgent).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<AgentPanel />);
    const field = screen.getByRole('textbox', { name: 'editor.agent.placeholder' });
    fireEvent.change(field, { target: { value: 'Change the background to white' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    act(() => useEditorStore.getState().updateSettings({ background: '#123456' }));
    await act(async () => finish({ reply: 'Done', ops: [{ op: 'set_canvas', background: '#ffffff' }] }));
    expect(applyOps).not.toHaveBeenCalled();
    expect(useEditorStore.getState().settings.background).toBe('#123456');
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(useEditorStore.getState().editing).toBe(false);
  });

});
