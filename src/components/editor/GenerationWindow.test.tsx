import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GenerationWindow } from './GenerationWindow';
import { useEditorUiStore } from '@/store/editorUiStore';
import { sendJobToEditor } from '@/lib/creator/sendToEditor';
import type { GenerationJob } from '@/store/generationStore';

const state = vi.hoisted(() => ({ jobs: [] as GenerationJob[], wallet: 'wallet' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => ({ walletAddress: state.wallet, badgeBalance: 100, username: 'owner' }) }));
vi.mock('@/store/generationStore', () => ({ useGenerationStore: (select: (s: typeof state) => unknown) => select(state) }));
vi.mock('@/lib/creator/sendToEditor', () => ({ sendJobToEditor: vi.fn().mockResolvedValue('media') }));
vi.mock('@/components/app/creator/studio/CreatorStudio', async () => {
  const { useState } = await import('react');
  return { CreatorStudio: ({ onJobStarted }: { onJobStarted: (id: string) => void }) => {
    const [prompt, setPrompt] = useState('');
    return <><input aria-label="Studio prompt" value={prompt} onChange={e => setPrompt(e.target.value)} />
      <button onClick={() => onJobStarted('new-job')}>Create</button></>;
  } };
});
const job = (id = 'new-job'): GenerationJob => ({ id, kind: 'image', status: 'done', url: 'https://media/image.png',
  prompt: 'Ocean', resolvedPrompt: 'Ocean', model: 'model', modelName: 'Model', aspect: '1:1', stage: '', createdAt: 1 });
beforeEach(() => {
  vi.clearAllMocks(); state.jobs = []; state.wallet = 'wallet';
  useEditorUiStore.setState({ generatorWindow: 'open', generatePrefill: null });
});
afterEach(cleanup);

it('keeps the composer draft while minimized and closed', async () => {
  render(<GenerationWindow />);
  fireEvent.change(await screen.findByLabelText('Studio prompt'), { target: { value: 'Keep this idea' } });
  fireEvent.click(screen.getByLabelText('calls.minimize'));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Generate content' }));
  expect(screen.getByLabelText('Studio prompt')).toHaveValue('Keep this idea');
  fireEvent.click(screen.getByLabelText('common.close'));
  act(() => useEditorUiStore.getState().setGeneratorWindow('open'));
  expect(screen.getByLabelText('Studio prompt')).toHaveValue('Keep this idea');
});

it('imports only window-owned results once, even while minimized, without changing the timeline', async () => {
  const view = render(<GenerationWindow />);
  fireEvent.click(await screen.findByRole('button', { name: 'Create' }));
  fireEvent.click(screen.getByLabelText('calls.minimize'));
  state.jobs = [job(), job('creator-page-job')]; view.rerender(<GenerationWindow />);
  await waitFor(() => expect(sendJobToEditor).toHaveBeenCalledOnce());
  expect(sendJobToEditor).toHaveBeenCalledWith(job(), expect.objectContaining({ wallet: 'wallet', addToTimeline: false }));
  state.jobs = [...state.jobs]; view.rerender(<GenerationWindow />);
  expect(sendJobToEditor).toHaveBeenCalledOnce();
});

it('does not import another wallet’s result after an account switch', async () => {
  const view = render(<GenerationWindow />);
  fireEvent.click(await screen.findByRole('button', { name: 'Create' }));
  state.wallet = 'other-wallet'; state.jobs = [job()]; view.rerender(<GenerationWindow />);
  expect(sendJobToEditor).not.toHaveBeenCalled();
});
