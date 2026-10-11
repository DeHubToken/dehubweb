import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreeAssetsPanel } from './FreeAssetsPanel';
import { useEditorStore } from '@/store/editorStore';
import { downloadFreeAsset, searchFreeAssets, type FreeAsset } from '@/lib/editor/freeAssets';
import { importOneFile } from '@/lib/editor/importFiles';

const quota = vi.hoisted(() => ({ walletAddress: 'creator', badgeBalance: 12000000, username: 'maldoteth', refetchUsage: vi.fn(async () => {}) }));
vi.mock('@/hooks/use-editor-quota', () => ({ useEditorQuota: () => quota }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string; value1?: string }) => (options?.defaultValue ?? key).replace('{{value1}}', options?.value1 ?? '') }) }));
vi.mock('@/i18n/copy', () => ({ translateCopy: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }));
vi.mock('@/hooks/use-surface-draft', () => ({ useSurfaceDraft: () => ['', Object.assign(vi.fn(), { complete: vi.fn() })] }));
vi.mock('@/lib/editor/freeAssets', () => ({ searchFreeAssets: vi.fn(), downloadFreeAsset: vi.fn(), provenanceForAsset: () => ({ source: 'Openverse', attributionRequired: true, attributionText: 'Track by Creator' }) }));
vi.mock('@/lib/editor/importFiles', () => ({ importOneFile: vi.fn() }));
vi.mock('@/components/editor/FreeAssetPreview', () => ({ FreeAssetPreview: () => null }));
vi.mock('@/components/app/AppState', () => ({ AppState: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const asset: FreeAsset = { id: 'stock', source: 'Openverse', kind: 'audio', title: 'Track', creator: 'Creator', thumbnailUrl: '', downloadUrl: 'https://media.example/track', landingUrl: 'https://media.example/credits', mimeType: 'audio/mpeg', license: 'CC BY', attributionRequired: true, attributionText: 'Track by Creator' };
const file = () => new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); quota.walletAddress = 'creator'; quota.badgeBalance = 12000000;
  useEditorStore.getState().newProject(); useEditorStore.setState({ media: [], currentTime: 3 });
  vi.mocked(searchFreeAssets).mockImplementation(async options => ({ items: options.kind === 'audio' ? [asset] : [], page: 1, providers: ['Openverse'], hasMore: false }));
  vi.mocked(downloadFreeAsset).mockResolvedValue(file());
  vi.mocked(importOneFile).mockImplementation(async imported => {
    useEditorStore.getState().addMedia({ id: 'track', name: imported.name, kind: 'audio', mimeType: imported.type, size: imported.size, duration: 28.5, createdAt: 1, url: 'blob:track' }); return 'track';
  });
});
afterEach(cleanup);
async function openAudio() { const view = render(<FreeAssetsPanel />); await act(async () => fireEvent.click(view.getByRole('tab', { name: 'Audio' }))); await view.findByRole('button', { name: 'Add Track to the timeline' }); return view; }

describe('stock import ownership', () => {
  it('uses the latest tier and keeps the full sound at the captured playhead with its credits', async () => {
    quota.badgeBalance = 0; const transfer = deferred<File>(); vi.mocked(downloadFreeAsset).mockReturnValue(transfer.promise);
    const view = await openAudio(); fireEvent.click(view.getByRole('button', { name: 'Add Track to the timeline' }));
    quota.badgeBalance = 12000000; view.rerender(<FreeAssetsPanel />); act(() => useEditorStore.getState().setCurrentTime(9));
    await act(async () => transfer.resolve(file()));
    expect(importOneFile).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ wallet: 'creator', badgeBalance: 12000000, username: 'maldoteth', signal: expect.any(AbortSignal), provenance: expect.objectContaining({ attributionText: 'Track by Creator' }) }));
    expect(useEditorStore.getState().clips).toHaveLength(1); expect(useEditorStore.getState().clips[0]).toMatchObject({ start: 3, duration: 28.5 });
  });
  it('lets the creator cancel a download and ignores a result that arrives afterwards', async () => {
    const transfer = deferred<File>(); vi.mocked(downloadFreeAsset).mockReturnValue(transfer.promise); const view = await openAudio();
    fireEvent.click(view.getByRole('button', { name: 'Add Track to the timeline' })); const signal = vi.mocked(downloadFreeAsset).mock.calls[0][1]!;
    fireEvent.click(view.getByRole('button', { name: 'common.cancel' })); expect(signal.aborted).toBe(true); expect(useEditorStore.getState().editing).toBe(false);
    await act(async () => transfer.resolve(file())); expect(importOneFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().clips).toHaveLength(0);
  });
  it('cancels metadata import without inserting its late completion into a reset project', async () => {
    const imported = deferred<string | null>(); vi.mocked(importOneFile).mockReturnValue(imported.promise); const view = await openAudio();
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Add Track to the timeline' })));
    const signal = vi.mocked(importOneFile).mock.calls[0][1]!.signal!;
    act(() => useEditorStore.getState().loadSnapshot(useEditorStore.getState().toSnapshot())); expect(signal.aborted).toBe(true);
    await act(async () => imported.resolve('track')); expect(useEditorStore.getState().clips).toHaveLength(0); expect(useEditorStore.getState().editing).toBe(false);
  });
});
