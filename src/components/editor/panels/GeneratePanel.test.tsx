import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneratePanel } from './GeneratePanel';
import { useEditorUiStore } from '@/store/editorUiStore';
import { generateAudio } from '@/lib/creator/generationEngine';
import { importOneFile } from '@/lib/editor/importFiles';
import { __resetDraftCacheForTests } from '@/lib/draft-cache';

const state = vi.hoisted(() => ({
  auth: { isAuthenticated: true },
  quota: { overQuota: false, walletAddress: 'wallet', badgeBalance: 12000000, username: 'maldoteth', refetchUsage: vi.fn().mockResolvedValue(undefined) },
  generations: { startImage: vi.fn(), startVideo: vi.fn(), startAudio: vi.fn() },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
vi.mock('@/contexts/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/contexts/AuthContext')>(), useAuth: () => state.auth }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => state.quota }));
vi.mock('@/store/generationStore', () => ({ useGenerationStore: (select: (s: typeof state.generations) => unknown) => select(state.generations) }));
vi.mock('@/lib/creator/generationEngine', () => ({ DEFAULT_VOICE_ID: 'voice', generateAudio: vi.fn() }));
vi.mock('@/lib/editor/importFiles', () => ({ importOneFile: vi.fn() }));
vi.mock('@/components/app/image/ImagePaywallModal', () => ({ ImagePaywallModal: () => null }));
vi.mock('@/components/app/video/VideoPaywallModal', () => ({ VideoPaywallModal: () => null }));
vi.mock('@/components/app/model3d/Model3dPaywallModal', () => ({ Model3dPaywallModal: () => null }));
vi.mock('@/components/app/creator/studio/StudioVoicePicker', () => ({ StudioVoicePicker: () => null }));
vi.mock('@/components/app/audio/AudioPaywallModal', () => ({ AudioPaywallModal: ({ open, units, quantityLabel, onConfirm, onOpenChange }: { open: boolean; units: number; quantityLabel: string; onConfirm: (hash: string) => void; onOpenChange: (open: boolean) => void }) => open ? <div><output aria-label="Music quote">{units}:{quantityLabel}</output><button onClick={() => onConfirm('paid-music')}>Pay for music</button><button onClick={() => onOpenChange(false)}>Cancel music</button></div> : null }));
vi.mock('@/components/app/creator/studio/StudioChip', () => ({ SelectChip: ({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) => <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
  CounterChip: ({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) => <input aria-label={label} type="number" value={value} onChange={event => onChange(Number(event.target.value))} />,
  ToggleChip: ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => <button aria-pressed={active} onClick={onClick}>{label}</button>,
}));
vi.mock('@/hooks/use-surface-switch', () => ({ useCloseOnSurfaceSwitch: () => {}, useSurfaceEpoch: () => 0 }));
vi.mock('./DesignPanel', () => ({ PanelHeading: () => null }));

describe('reviewing voice generation in the editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('dehub-drafts-v1');
    __resetDraftCacheForTests();
    state.auth.isAuthenticated = true;
    state.quota.overQuota = false;
    useEditorUiStore.setState({ panel: 'generate', generatePrefill: { kind: 'voice', prompt: 'Keep every word, including the last sentence.' } });
    vi.mocked(importOneFile).mockResolvedValue('imported');
    vi.mocked(generateAudio).mockResolvedValue({ blob: new Blob(['voice'], { type: 'audio/x-wav' }) });
  });
  afterEach(cleanup);

  it('shows the exact voice draft without a provider call, then imports the returned format on Generate', async () => {
    render(<GeneratePanel />);
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Prompt')).toHaveValue('Keep every word, including the last sentence.');
    expect(generateAudio).not.toHaveBeenCalled();
    expect(state.generations.startImage).not.toHaveBeenCalled();
    expect(state.generations.startVideo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(importOneFile).toHaveBeenCalledOnce());
    const file = vi.mocked(importOneFile).mock.calls[0][0];
    expect(file.type).toBe('audio/wav');
    expect(file.name).toMatch(/\.wav$/);
    expect(vi.mocked(importOneFile).mock.calls[0][1]).toEqual({ wallet: 'wallet', badgeBalance: 12000000, username: 'maldoteth' });
    expect(generateAudio).toHaveBeenCalledWith({ text: 'Keep every word, including the last sentence.', voiceId: 'voice' });
    await waitFor(() => expect(screen.getByLabelText('Prompt')).toHaveValue(''));
  });

  it.each(['signed out', 'quota', 'too long'])('preserves the %s guard when reviewing a voice draft', reason => {
    if (reason === 'signed out') state.auth.isAuthenticated = false;
    if (reason === 'quota') state.quota.overQuota = true;
    if (reason === 'too long') useEditorUiStore.getState().setGeneratePrefill({ kind: 'voice', prompt: 'x'.repeat(501) });
    render(<GeneratePanel />);
    const generate = screen.getByRole('button', { name: 'Generate' });
    expect(generate).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(generate);
    expect(generateAudio).not.toHaveBeenCalled();
    expect(importOneFile).not.toHaveBeenCalled();
  });

  it('prepares music without a provider call and submits the exact track that was quoted', () => {
    useEditorUiStore.getState().setGeneratePrefill({ kind: 'music', prompt: 'Quiet piano and warm bass' });
    render(<GeneratePanel />);
    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Prompt')).toHaveValue('Quiet piano and warm bass');
    expect(state.generations.startAudio).not.toHaveBeenCalled(); expect(generateAudio).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('creator.length'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'creator.instrumental' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(screen.getByLabelText('Music quote')).toHaveTextContent('3:21s'); expect(state.generations.startAudio).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A different prompt' } });
    fireEvent.change(screen.getByLabelText('creator.length'), { target: { value: '100' } });
    expect(screen.getByLabelText('Music quote')).toHaveTextContent('3:21s');
    fireEvent.click(screen.getByRole('button', { name: 'Pay for music' }));
    expect(state.generations.startAudio).toHaveBeenCalledOnce();
    expect(state.generations.startAudio).toHaveBeenCalledWith({ task: 'music', prompt: 'Quiet piano and warm bass', lengthSeconds: 21, instrumental: false, txHash: 'paid-music' }, expect.objectContaining({ prompt: 'Quiet piano and warm bass', resolvedPrompt: 'Quiet piano and warm bass', aspect: '1:1' }));
    expect(useEditorUiStore.getState().panel).toBe('library');
  });

  it('closes an unpaid music draft without starting or discarding its prompt', () => {
    useEditorUiStore.getState().setGeneratePrefill({ kind: 'music', prompt: 'Quiet piano' }); render(<GeneratePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate' })); fireEvent.click(screen.getByRole('button', { name: 'Cancel music' }));
    expect(state.generations.startAudio).not.toHaveBeenCalled(); expect(screen.getByLabelText('Prompt')).toHaveValue('Quiet piano');
    expect(screen.queryByRole('button', { name: 'Pay for music' })).toBeNull();
  });

  it.each(['signed out', 'quota', 'too long'])('blocks invalid music before payment: %s', reason => {
    state.auth.isAuthenticated = reason !== 'signed out'; state.quota.overQuota = reason === 'quota';
    useEditorUiStore.getState().setGeneratePrefill({ kind: 'music', prompt: reason === 'too long' ? 'x'.repeat(2001) : 'Quiet piano' }); render(<GeneratePanel />);
    expect(screen.getByRole('button', { name: 'Generate' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Generate' })); expect(screen.queryByRole('button', { name: 'Pay for music' })).toBeNull(); expect(state.generations.startAudio).not.toHaveBeenCalled();
  });

  it('prepares sound without a call and queues the chosen half-second loop only on Generate', () => {
    useEditorUiStore.getState().setGeneratePrefill({ kind: 'sfx', prompt: 'A clean interface blip' });
    render(<GeneratePanel />);
    expect(screen.getByRole('button', { name: 'Sound effect' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Prompt')).toHaveValue('A clean interface blip');
    expect(state.generations.startAudio).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('creator.length'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'creator.loop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(state.generations.startAudio).toHaveBeenCalledWith({ task: 'sfx', text: 'A clean interface blip', durationSeconds: 0.5, loop: true, promptInfluence: 0.3, outputFormat: 'mp3_44100_128' }, expect.objectContaining({ prompt: 'A clean interface blip', aspect: '1:1' }));
    expect(useEditorUiStore.getState().panel).toBe('library');
    expect(screen.queryByRole('button', { name: 'Pay for music' })).toBeNull();
  });

  it('omits the duration when automatic sound length is selected', () => {
    useEditorUiStore.getState().setGeneratePrefill({ kind: 'sfx', prompt: 'Gentle rain' }); render(<GeneratePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(state.generations.startAudio.mock.calls[0][0]).not.toHaveProperty('durationSeconds');
  });

  it.each(['signed out', 'quota', 'too long'])('blocks invalid sound before calling the provider: %s', reason => {
    state.auth.isAuthenticated = reason !== 'signed out'; state.quota.overQuota = reason === 'quota';
    useEditorUiStore.getState().setGeneratePrefill({ kind: 'sfx', prompt: reason === 'too long' ? 'x'.repeat(1001) : 'Gentle rain' }); render(<GeneratePanel />);
    expect(screen.getByRole('button', { name: 'Generate' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Generate' })); expect(state.generations.startAudio).not.toHaveBeenCalled();
  });
});
