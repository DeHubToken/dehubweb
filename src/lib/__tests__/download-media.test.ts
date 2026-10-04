import { afterEach, expect, it, vi } from 'vitest';
import { downloadMedia, imageDownloadName } from '../download-media';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('downloads cross-origin media with the correct filename and retains the blob until consumed', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['photo'], { type: 'image/png' }) }));
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    expect(this.href).toBe('blob:photo');
    expect(this.download).toBe('dehub-123-2.png');
    expect(this.isConnected).toBe(true);
  });
  await downloadMedia('https://cdn.example/photo.png', 'dehub-123-2.png');
  expect(click).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
});

it('reports a failed HTTP response instead of saving an error page as a photo', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  await expect(downloadMedia('https://cdn.example/photo.png', 'photo.png')).rejects.toThrow('403');
});

it('uses the original image extension even with signed URL parameters', () => {
  expect(imageDownloadName('https://cdn.example/photo.webp?token=1', '123', 1)).toBe('dehub-123-2.webp');
});
