import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importOneFile } from './importFiles';

const mocks = vi.hoisted(() => ({
  usage: vi.fn(), upload: vi.fn(), probe: vi.fn(), put: vi.fn(), remove: vi.fn(), add: vi.fn(), error: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('./cloudMedia', () => ({ getEditorStorageUsage: mocks.usage, uploadEditorAsset: mocks.upload }));
vi.mock('./mediaStore', () => ({ detectKind: () => 'audio', probeDuration: mocks.probe,
  putMedia: mocks.put, deleteMedia: mocks.remove, captureImageThumbnail: vi.fn(), captureVideoThumbnail: vi.fn() }));
vi.mock('@/store/editorStore', () => ({ toMediaItem: (row: unknown) => row, useEditorStore: { getState: () => ({ addMedia: mocks.add }) } }));

const file = new File(['voice'], 'voice.wav', { type: 'audio/wav' });
beforeEach(() => {
  vi.clearAllMocks(); mocks.usage.mockResolvedValue({ used_bytes: 600 * 1024 * 1024 });
  mocks.upload.mockResolvedValue(undefined); mocks.probe.mockResolvedValue(3.18);
  mocks.put.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined);
});
describe('generated media through the shared importer', () => {
  it('uses the account tier rather than rejecting a higher tier account at the Starter limit', async () => {
    expect(await importOneFile(file, { wallet: 'creator' })).toBeNull();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(await importOneFile(file, { wallet: 'creator', badgeBalance: 12000000, username: 'maldoteth' })).toEqual(expect.any(String));
    expect(mocks.put).toHaveBeenCalledOnce(); expect(mocks.add).toHaveBeenCalledOnce(); expect(mocks.upload).toHaveBeenCalledOnce();
  });
  it('does not write media or upload when cancellation arrives during metadata', async () => {
    const controller = new AbortController();
    mocks.probe.mockImplementation(async () => { controller.abort(); return 3.18; });
    expect(await importOneFile(file, { signal: controller.signal })).toBeNull();
    expect(mocks.put).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
  });
  it('removes its own incomplete cached row when cancelled during persistence', async () => {
    const controller = new AbortController();
    mocks.put.mockImplementation(async () => { controller.abort(); });
    expect(await importOneFile(file, { signal: controller.signal })).toBeNull();
    expect(mocks.remove).toHaveBeenCalledWith(mocks.put.mock.calls[0][0].id);
    expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
  });
});
