import { checkRateLimit, jsonResponse, serviceClient, handleCorsPreflight } from '../_shared/auth.ts';
import { retryGenerationSave } from '../_shared/generation-jobs.ts';
import { refundCredits } from '../_shared/credits.ts';

// The sweep accepts no caller-selected jobs, wallets, prices or provider URLs.
// Its global budget makes a public scheduler trigger harmless to repeat.
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const db = serviceClient();
  const budget = await checkRateLimit(db, 'creator-reconcile', 'creator-reconcile', { limit: 1, windowMs: 240000 });
  if (!budget.allowed) return jsonResponse({ processed: 0 });
  // A job still "submitting" after half an hour died with its edge function
  // (an image can wait on kie and then fal past the runtime limit) after the
  // draw was taken. Nothing was delivered, so it is refunded like a failure.
  const stale = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: jobs, error } = await db.from('ai_generation_jobs').select('*')
    .or(`status.in.(starting,processing,refund_pending),result->>savePending.eq.true,and(status.eq.submitting,created_at.lt.${stale})`)
    .order('updated_at').limit(8);
  if (error) return jsonResponse({ error: 'Could not load pending renders' }, 503);
  // Renders finish in minutes. One still starting or processing after six hours
  // is not coming back, so it is refunded rather than re-polled forever.
  const abandonedBefore = Date.now() - 6 * 3600_000;
  let processed = 0;
  await Promise.all((jobs ?? []).map(async (job) => {
    try {
      if ((job.status === 'starting' || job.status === 'processing') && new Date(job.created_at).getTime() < abandonedBefore) {
        // Only refund if the row was still running: a render that settled since
        // the select above must not be paid back as well.
        const { data: marked, error: markError } = await db.from('ai_generation_jobs').update({ status: 'refund_pending' })
          .eq('id', job.id).in('status', ['starting', 'processing']).select('id');
        if (markError) throw markError;
        if (marked?.length) job.status = 'refund_pending';
      }
      if (job.status === 'refund_pending' || job.status === 'submitting') {
        if (job.payment_source === 'credits') {
          if (!(await refundCredits(job.credit_debit_key))) throw new Error('credits refund failed');
        } else {
          const released = await db.rpc('ai_payment_release', { p_tx_hash: job.tx_hash, p_wallet: job.wallet_address, p_dhb: job.price_dhb, p_job_id: job.id });
          if (released.error && !released.error.message.includes('REFUND_ALREADY_APPLIED')) throw released.error;
        }
        await db.from('ai_generation_jobs').update({ status: 'failed', result: { ...job.result, paymentRestored: true } }).eq('id', job.id);
      } else if (job.status === 'succeeded' && job.result) {
        await retryGenerationSave(job);
      } else if (job.prediction_id && ['generate-video','generate-3d','fal-ai-tools'].includes(job.endpoint)) {
        const polled = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${job.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
          body: JSON.stringify(job.endpoint === 'fal-ai-tools'
            ? { requestId: job.prediction_id, appId: job.provider_app }
            : { predictionId: job.prediction_id, provider: job.provider, falAppId: job.provider_app }),
          signal: AbortSignal.timeout(15000),
        });
        // A poll that errored settled nothing, so it is not counted as handled.
        const text = await polled.text();
        if (!polled.ok) throw new Error(`re-poll ${polled.status}: ${text.slice(0, 300)}`);
      }
      processed++;
    } catch (error) { console.error('[creator-reconcile]', job.id, String(error)); }
    // Rotate across all pending jobs instead of starving newer submissions.
    await db.from('ai_generation_jobs').update({ updated_at: new Date().toISOString() }).eq('id', job.id);
  }));
  return jsonResponse({ processed });
});
