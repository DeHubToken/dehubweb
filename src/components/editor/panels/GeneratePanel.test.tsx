import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneratePanel } from './GeneratePanel';
import { useEditorUiStore } from '@/store/editorUiStore';
import { generateAudio } from '@/lib/creator/generationEngine';
import { importOneFile } from '@/lib/editor/importFiles';

const state = vi.hoisted(() => ({
  auth: { isAuthenticated: true },
  quota: { overQuota: false, walletAddress: 'wallet', refetchUsage: vi.fn().mockResolvedValue(undefined) },
  generations: { startImage: vi.fn(), startVideo: vi.fn() },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/contexts/AuthContext')>(), useAuth: () => state.auth }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => state.quota }));
vi.mock('@/store/generationStore', () => ({ useGenerationStore: (select: (s: typeof state.generations) => unknown) => select(state.generations) }));
vi.mock('@/lib/creator/generationEngine', () => ({ DEFAULT_VOICE_ID: 'voice', generateAudio: vi.fn() }));
vi.mock('@/lib/editor/importFiles', () => ({ importOneFile: vi.fn() }));
vi.mock('@/components/app/image/ImagePaywallModal', () => ({ ImagePaywallModal: () => null }));
vi.mock('@/components/app/video/VideoPaywallModal', () => ({ VideoPaywallModal: () => null }));
vi.mock('@/components/app/creator/studio/StudioChip', () => ({ SelectChip: () => null }));
vi.mock('@/hooks/use-surface-switch', () => ({ useCloseOnSurfaceSwitch: () => {}, useSurfaceEpoch: () => 0 }));
vi.mock('./DesignPanel', () => ({ PanelHeading: () => null }));

describe('reviewing voice generation in the editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
