import { checkRateLimit, jsonResponse, serviceClient, handleCorsPreflight } from '../_shared/auth.ts';
import { retryGenerationSave } from '../_shared/generation-jobs.ts';

// The sweep accepts no caller-selected jobs, wallets, prices or provider URLs.
// Its global budget makes a public scheduler trigger harmless to repeat.
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const db = serviceClient();
  const budget = await checkRateLimit(db, 'creator-reconcile', 'creator-reconcile', { limit: 1, windowMs: 240000 });
  if (!budget.allowed) return jsonResponse({ processed: 0 });
  const { data: jobs, error } = await db.from('ai_generation_jobs').select('*')
    .or('status.in.(starting,processing,refund_pending),result->>savePending.eq.true')
    .order('updated_at').limit(8);
  if (error) return jsonResponse({ error: 'Could not load pending renders' }, 503);
  let processed = 0;
  await Promise.all((jobs ?? []).map(async (job) => {
    try {
      if (job.status === 'refund_pending') {
        const released = await db.rpc('ai_payment_release', { p_tx_hash: job.tx_hash, p_wallet: job.wallet_address, p_dhb: job.price_dhb, p_job_id: job.id });
        if (released.error && !released.error.message.includes('REFUND_ALREADY_APPLIED')) throw released.error;
        await db.from('ai_generation_jobs').update({ status: 'failed', result: { ...job.result, paymentRestored: true } }).eq('id', job.id);
      } else if (job.status === 'succeeded' && job.result) {
        await retryGenerationSave(job);
      } else if (job.prediction_id && ['generate-video','generate-3d','fal-ai-tools'].includes(job.endpoint)) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${job.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
          body: JSON.stringify(job.endpoint === 'fal-ai-tools'
            ? { requestId: job.prediction_id, appId: job.provider_app }
            : { predictionId: job.prediction_id, provider: job.provider, falAppId: job.provider_app }),
          signal: AbortSignal.timeout(15000),
        });
      }
      processed++;
    } catch (error) { console.error('[creator-reconcile]', job.id, String(error)); }
    // Rotate across all pending jobs instead of starving newer submissions.
    await db.from('ai_generation_jobs').update({ updated_at: new Date().toISOString() }).eq('id', job.id);
  }));
  return jsonResponse({ processed });
});
