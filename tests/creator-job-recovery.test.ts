import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ job: null as any, update: vi.fn(), rpc: vi.fn(), archive: vi.fn() }));
vi.mock('../supabase/functions/_shared/auth.ts', () => ({ serviceClient: () => ({
  rpc: mocks.rpc,
  from: () => ({ select: () => { const query: any = { eq: () => query, maybeSingle: async () => ({ data: mocks.job, error: null }) }; return query; },
    update: (value: unknown) => { mocks.update(value); return { eq: async () => ({ error: null }) }; } }),
}) }));
vi.mock('../supabase/functions/_shared/archive-generation.ts', () => ({ archiveGeneration: mocks.archive }));
import { recordGeneration, settleGeneration, retryGenerationSave } from '../supabase/functions/_shared/generation-jobs';
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.job = { id: 'job-1', status: 'processing', payment_source: 'dhb', wallet_address: 'wallet', tx_hash: 'receipt', price_dhb: 25, kind: 'video', model: 'model', created_at: new Date().toISOString() };
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === 'ai_generation_transition') {
      if (['succeeded', 'failed', 'cancelled', 'refund_pending'].includes(mocks.job.status)) return { data: { claimed: false, job: mocks.job }, error: null };
      mocks.job = { ...mocks.job, status: args.p_status === 'succeeded' ? 'succeeded' : 'refund_pending',
        result: { ...args.p_result, ...(args.p_status === 'succeeded' ? { savePending: true } : { paymentRestored: false }) } };
      return { data: { claimed: true, job: mocks.job }, error: null };
    }
    if (name === 'ai_generation_refund_claim') return { data: { claimed: true, job: mocks.job }, error: null };
    if (name === 'ai_generation_refund_finish') {
      mocks.job = { ...mocks.job, status: 'failed', result: { ...mocks.job.result, paymentRestored: true } };
      return { data: mocks.job, error: null };
    }
    if (name === 'ai_generation_save_result') {
      mocks.job = { ...mocks.job, result: args.p_result };
      return { data: true, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  mocks.archive.mockResolvedValue(undefined);
});
describe('Creator render recovery', () => {
  it('restores only the recorded job debit on a confirmed provider failure', async () => {
    const result = await settleGeneration('generate-video', 'ticket', response({ status: 'failed', error: 'Provider failed' }));
    expect(mocks.rpc).toHaveBeenCalledWith('ai_generation_refund_finish', { p_job_id: 'job-1', p_token: expect.any(String), p_credit_restored: false });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['ai_generation_transition', 'ai_generation_refund_claim', 'ai_generation_refund_finish']);
    expect(await result.json()).toMatchObject({ paymentRestored: true });
  });
  it('accepts an already-restored debit without charging or refunding again', async () => {
    mocks.job.status = 'failed';
    mocks.job.result = { status: 'failed', paymentRestored: true };
    expect(await (await settleGeneration('generate-video', 'ticket', response({ status: 'failed' }))).json()).toMatchObject({ paymentRestored: true });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['ai_generation_transition']);
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
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['ai_generation_transition', 'ai_generation_save_result']);
  });
  it('clears the pending save once the output is stored', async () => {
    mocks.job.status = 'succeeded';
    mocks.job.result = { status: 'succeeded', videoUrl: 'https://fal.media/output.mp4', savePending: true };
    await retryGenerationSave(mocks.job);
    expect(mocks.job.result.savePending).toBeUndefined();
    expect(mocks.job.result.libraryId).toBe('job-1');
    expect(mocks.rpc).toHaveBeenCalledWith('ai_generation_save_result', expect.objectContaining({ p_job_id: 'job-1', p_expected_result: expect.objectContaining({ savePending: true }) }));
  });
  it('does not turn a successful provider response into a refundable failure if journalling throws', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('Database down'));
    const accepted = response({ predictionId: 'ticket', status: 'starting' });
    const refund = vi.fn();
    expect(await recordGeneration({ ok: true, jobId: 'job-1', wallet: 'wallet', priceDhb: 25, refund }, accepted)).toBe(accepted);
    expect(refund).not.toHaveBeenCalled();
  });
});
