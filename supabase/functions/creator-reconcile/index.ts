import { checkRateLimit, jsonResponse, serviceClient, handleCorsPreflight } from '../_shared/auth.ts';
import { retryGenerationSave } from '../_shared/generation-jobs.ts';
import { recoverGenerationRefund, transitionGeneration } from '../_shared/generation-terminal.ts';

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
      // An interrupted layer submission may already have spent provider credits.
      // Retain its journal for recovery instead of releasing it for paid replay.
      if (job.model === 'qwen-image-layered' && job.status === 'submitting') return;
      if (job.model !== 'qwen-image-layered' && (job.status === 'starting' || job.status === 'processing') && new Date(job.created_at).getTime() < abandonedBefore) {
        // Only refund if the row was still running: a render that settled since
        // the select above must not be paid back as well.
        const marked = await transitionGeneration(job.id, 'failed', { status: 'failed', error: 'The render did not finish in time.' }, {
          expectedStatuses: ['starting','processing'], createdBefore: new Date(abandonedBefore).toISOString(),
        }, db);
        if (marked.job) Object.assign(job, marked.job);
      }
      if (job.status === 'submitting') {
        const marked = await transitionGeneration(job.id, 'failed', { status: 'failed', error: 'Submission confirmation was interrupted.' }, {
          expectedStatuses: ['submitting'], createdBefore: stale,
        }, db);
        if (marked.job) Object.assign(job, marked.job);
      }
      if (job.status === 'refund_pending') {
        await recoverGenerationRefund(job.id, db);
      } else if (job.status === 'succeeded' && job.result) {
        await retryGenerationSave(job);
      } else if (job.prediction_id && ['generate-video','generate-3d','fal-ai-tools'].includes(job.endpoint)) {
        const polled = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${job.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_ANON_KEY')!, Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
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
    finally {
      // Held ambiguous submissions also rotate; they must not starve active saves.
      await db.from('ai_generation_jobs').update({ updated_at: new Date().toISOString() }).eq('id', job.id);
    }
  }));
  return jsonResponse({ processed });
});
