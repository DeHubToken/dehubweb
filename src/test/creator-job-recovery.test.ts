import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ job: null as any, update: vi.fn(), rpc: vi.fn(), archive: vi.fn() }));
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({ serviceClient: () => ({
  rpc: mocks.rpc,
  from: () => ({ select: () => { const query: any = { eq: () => query, maybeSingle: async () => ({ data: mocks.job, error: null }) }; return query; },
    update: (value: unknown) => { mocks.update(value); return { eq: async () => ({ error: null }) }; } }),
}) }));
vi.mock('../../supabase/functions/_shared/archive-generation.ts', () => ({ archiveGeneration: mocks.archive }));
import { recordGeneration, settleGeneration, retryGenerationSave } from '../../supabase/functions/_shared/generation-jobs';
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.job = { id: 'job-1', wallet_address: 'wallet', tx_hash: 'receipt', price_dhb: 25, kind: 'video', model: 'model', created_at: new Date().toISOString() };
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.archive.mockResolvedValue(undefined);
});
describe('Creator render recovery', () => {
  it('restores only the recorded job debit on a confirmed provider failure', async () => {
    const result = await settleGeneration('generate-video', 'ticket', response({ status: 'failed', error: 'Provider failed' }));
    expect(mocks.rpc).toHaveBeenCalledWith('ai_payment_release', { p_tx_hash: 'receipt', p_wallet: 'wallet', p_dhb: 25, p_job_id: 'job-1' });
    expect(await result.json()).toMatchObject({ paymentRestored: true });
  });
  it('accepts an already-restored debit without charging or refunding again', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'REFUND_ALREADY_APPLIED' } });
    expect(await (await settleGeneration('generate-video', 'ticket', response({ status: 'failed' }))).json()).toMatchObject({ paymentRestored: true });
  });
  it('never invents a refund for an unrecorded ticket', async () => {
    mocks.job = null;
    await settleGeneration('generate-video', 'legacy', response({ status: 'failed' }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('keeps successful results collectable when cloud storage is down', async () => {
    mocks.archive.mockRejectedValue(new Error('Storage down'));
    const result = await settleGeneration('generate-video', 'ticket', response({ status: 'succeeded', videoUrl: 'https://fal.media/output.mp4' }));
    expect(await result.json()).toMatchObject({ status: 'succeeded', savePending: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('clears the pending save once the output is stored', async () => {
    mocks.job.result = { status: 'succeeded', videoUrl: 'https://fal.media/output.mp4', savePending: true };
    await retryGenerationSave(mocks.job);
    expect(mocks.update.mock.calls[0][0].result.savePending).toBeUndefined();
    expect(mocks.update.mock.calls[0][0].result.libraryId).toBe('job-1');
  });
  it('does not turn a successful provider response into a refundable failure if journalling throws', async () => {
    mocks.update.mockImplementationOnce(() => { throw new Error('Database down'); });
    const accepted = response({ predictionId: 'ticket', status: 'starting' });
    const refund = vi.fn();
    expect(await recordGeneration({ ok: true, jobId: 'job-1', wallet: 'wallet', priceDhb: 25, refund }, accepted)).toBe(accepted);
    expect(refund).not.toHaveBeenCalled();
  });
});
