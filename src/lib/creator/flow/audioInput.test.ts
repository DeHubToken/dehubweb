import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('@/lib/creator/assetDownload', () => ({ assetToFile: mocks.download }));
import { downloadFlowAudio } from './audioInput';
beforeEach(() => vi.resetAllMocks());
it('preserves WAV bytes and extension and bounds download size and time', async () => {
  mocks.download.mockResolvedValue(new File(['wave'], 'source', { type: 'audio/wav' }));
  const file = await downloadFlowAudio('fresh-private-url');
  expect(file.name).toBe('flow-audio.wav'); expect(file.type).toBe('audio/wav');
  expect(mocks.download).toHaveBeenCalledWith('fresh-private-url', 'flow-audio', 'application/octet-stream', { maxBytes: 50 * 1024 * 1024, signal: expect.any(AbortSignal) });
});
it('refuses expired signed links and invalid media instead of submitting them as MP3', async () => {
  mocks.download.mockRejectedValueOnce(new Error('Could not download the asset (403)'));
  await expect(downloadFlowAudio('expired')).rejects.toThrow('(403)');
  mocks.download.mockResolvedValue(new File(['html'], 'error', { type: 'text/html' }));
  await expect(downloadFlowAudio('not-audio')).rejects.toThrow('unsupported format');
});
