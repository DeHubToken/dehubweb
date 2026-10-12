import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from './LibraryPanel';

const mocks = vi.hoisted(() => ({ download: vi.fn(), import: vi.fn(), add: vi.fn(), providerCancel: vi.fn(),
  quota: { walletAddress: 'creator', badgeBalance: 12000000, username: 'maldoteth', refetchUsage: vi.fn().mockResolvedValue(undefined) },
  jobs: [{ id: 'voice-result', kind: 'audio', prompt: 'A saved voice', url: 'https://media.example/voice.wav', status: 'done' }],
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => key === 'common.cancel' ? 'Cancel' : options?.defaultValue ?? key }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined, isPending: false, isFetching: false, error: null, refetch: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => mocks.quota }));
vi.mock('@/store/generationStore', () => ({ useGenerationStore: (select: (s: unknown) => unknown) => select({ jobs: mocks.jobs, cancel: mocks.providerCancel, retry: vi.fn() }) }));
vi.mock('@/lib/creator/assetDownload', async original => ({ ...await original<typeof import('@/lib/creator/assetDownload')>(), assetToFile: mocks.download }));
vi.mock('@/lib/editor/importFiles', () => ({ importOneFile: mocks.import }));
vi.mock('@/store/editorStore', () => ({ useEditorStore: { getState: () => ({ projectId: 'original', currentTime: 0, addClipFromMedia: mocks.add }) } }));
vi.mock('@/store/editorUiStore', () => ({ useEditorUiStore: (select: (s: unknown) => unknown) => select({ setPanel: vi.fn() }) }));
vi.mock('./DesignPanel', () => ({ PanelHeading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2> }));
vi.mock('@/components/app/AppState', () => ({ AppState: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('generated import controls', () => {
  it('keeps Cancel available after the panel remounts without cancelling the paid render', async () => {
    let finish!: (file: File) => void;
    mocks.download.mockImplementation(() => new Promise<File>(resolve => { finish = resolve; }));
    const first = render(<LibraryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to timeline' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());
    first.unmount(); render(<LibraryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.download.mock.calls[0][3].signal.aborted).toBe(true);
    await act(async () => { finish(new File(['voice'], 'voice.wav', { type: 'audio/wav' })); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to timeline' })).toBeEnabled());
    expect(mocks.import).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.providerCancel).not.toHaveBeenCalled();
  });
});
