import { beforeEach, expect, it, vi } from 'vitest';
const { invoke, read } = vi.hoisted(() => ({ invoke: vi.fn(), read: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke },
  from: () => { const q = { select: () => q, eq: () => q, maybeSingle: read }; return q; },
} }));
import { playableStageRecording } from '@/lib/stage-recording-source';
beforeEach(() => { vi.clearAllMocks(); read.mockResolvedValue({ data: null }); });
it('reuses one conversion and returns the actual AAC URL', async () => {
  invoke.mockResolvedValue({ data: { ok: true, recordingUrl: 'https://media/recording.m4a' } });
  const requests = await Promise.all([playableStageRecording('one', 'https://media/recording.webm'), playableStageRecording('one', 'https://media/recording.webm')]);
  expect(requests).toEqual(['https://media/recording.m4a', 'https://media/recording.m4a']);
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('uses an already converted URL from another client', async () => {
  read.mockResolvedValue({ data: { recording_url: 'https://media/recording.m4a' } });
  expect(await playableStageRecording('two', 'https://media/recording.webm')).toBe('https://media/recording.m4a');
  expect(invoke).not.toHaveBeenCalled();
});
it('retries a failed conversion on a later play', async () => {
  invoke.mockResolvedValueOnce({ data: { ok: false, error: 'worker busy' } })
    .mockResolvedValueOnce({ data: { ok: true, recordingUrl: 'https://media/recording.m4a' } });
  await expect(playableStageRecording('three', 'https://media/recording.webm')).rejects.toThrow('worker busy');
  expect(await playableStageRecording('three', 'https://media/recording.webm')).toBe('https://media/recording.m4a');
  expect(invoke).toHaveBeenCalledTimes(2);
});
