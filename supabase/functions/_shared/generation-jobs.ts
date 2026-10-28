import { serviceClient } from './auth.ts';
import type { ChargeResult } from './ai-payment-guard.ts';
import { archiveGeneration } from './archive-generation.ts';
import { compactGenerationResult, hydrateGenerationResult } from './generation-result.ts';
import { recoverGenerationRefund, transitionGeneration } from './generation-terminal.ts';
import { archiveLayerSet, LAYER_MODEL } from './creator-image-layers.ts';
import { LayerValidationError } from './creator-layer-png.ts';

async function saveOutput(job: any, result: Record<string, any>): Promise<void> {
  if (job.model === LAYER_MODEL) {
    try { await archiveLayerSet(job, result); } catch (error) { result.savePending = true; console.error('[generation] layer archive pending', job.id, String(error)); }
    return;
  }
  const url = result.videoUrl || result.modelUrl || result.imageUrl || result.audioUrl || result.image;
  if (!url && !result.text) return;
  try {
    const storagePath = await archiveGeneration(job.wallet_address, job.id, {
      id: job.id, kind: job.kind === 'tool' ? (result.audioUrl ? 'audio' : 'image') : job.kind === '3d' ? 'model3d' : job.kind,
      model: result.model || job.model, modelName: result.model || job.model, prompt: job.metadata?.prompt || job.model,
      resolvedPrompt: job.metadata?.prompt || '', aspect: job.metadata?.aspectRatio || '',
      createdAt: new Date(job.created_at).getTime(), finishedAt: Date.now(),
      ...(result.text ? { transcript: result.text } : {}),
    }, url);
    result.libraryId = job.id;
    compactGenerationResult(result, storagePath);
    delete result.savePending;
  } catch (error) {
    result.savePending = true;
    console.error('[generation] cloud save pending', job.id, String(error));
  }
}

/** Journal a submitted ticket without ever refunding accepted provider work on a database outage. */
export async function recordGeneration(charge: Extract<ChargeResult, { ok: true }>, response: Response): Promise<Response> {
  if (!response.ok || !charge.priceDhb) return response;
  try {
    const result = await response.clone().json();
    const predictionId = result.predictionId || result.requestId;
    const completed = !predictionId || result.status === 'succeeded';
    if (completed) result.savePending = true;
    const db = serviceClient();
    const decision = await transitionGeneration(charge.jobId, completed ? 'succeeded' : 'starting', result, {
      predictionId, provider: result.provider || (result.appId ? 'fal' : 'replicate'), providerApp: result.falAppId || result.appId,
    }, db);
    if (!decision.claimed && decision.job && ['succeeded','failed','canceled','cancelled','refund_pending'].includes(decision.job.status)) {
      return new Response(JSON.stringify(await hydrateGenerationResult(decision.job, db) || { status: decision.job.status === 'refund_pending' ? 'failed' : decision.job.status,
        error: 'Check your saved generation before paying again.', paymentRestored: false }), { status: response.status, headers: response.headers });
    }
    if (completed && decision.job?.status === 'succeeded') {
      const job = decision.job;
      const saving = retryGenerationSave(job).catch((error) => console.error('[generation] deferred save', String(error)));
      const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (promise: Promise<void>) => void } }).EdgeRuntime;
      if (runtime) runtime.waitUntil(saving); else await saving;
    }
  } catch (error) { console.error('[generation] ticket journal failed', charge.jobId, String(error)); }
  return response;
}

export async function retryGenerationSave(job: any): Promise<void> {
  const db = serviceClient();
  const loaded = await db.from('ai_generation_jobs').select('*').eq('id', job.id).eq('status', 'succeeded').maybeSingle();
  if (loaded.error) throw loaded.error;
  if (!loaded.data?.result) return;
  const current = loaded.data, expected = current.result;
  if ((expected.libraryId || expected.layerSet) && !expected.savePending) return;
  const result = { ...expected };
  await saveOutput(current, result);
  const { error } = await db.rpc('ai_generation_save_result', { p_job_id: current.id, p_expected_result: expected, p_result: result });
  if (error) throw error;
}

/** A confirmed provider failure releases exactly that job's draw once. */
export async function settleGeneration(endpoint: string, predictionId: string, response: Response): Promise<Response> {
  if (!response.ok) return response;
  const result = await response.clone().json();
  if (!['failed', 'canceled', 'cancelled', 'succeeded'].includes(result.status)) return response;
  const db = serviceClient();
  const { data: job, error } = await db.from('ai_generation_jobs').select('*')
    .eq('endpoint', endpoint).eq('prediction_id', predictionId).maybeSingle();
  if (error) throw new Error('Could not reconcile the render. Reconnect to collect it.');
  if (!job) return response;
  if (job.model === LAYER_MODEL && (result.status === 'succeeded' || job.result?.providerCompleted)) {
    // Preserve accepted provider bytes before any download, without claiming delivery.
    const raw = job.result?.providerCompleted ? job.result : { ...result, status: 'processing', providerCompleted: true, savePending: true };
    const journal = await transitionGeneration(job.id, 'processing', raw, { expectedStatuses: ['starting','processing'] }, db);
    if (journal.job?.status === 'succeeded' || journal.job?.status === 'refund_pending' || journal.job?.status === 'failed') {
      return new Response(JSON.stringify(await hydrateGenerationResult(journal.job, db)), { headers: response.headers });
    }
    if (!journal.job?.result?.providerCompleted) throw new Error('Could not preserve the layer result. Reconnect without paying again.');
    const output = { ...journal.job.result };
    try {
      await archiveLayerSet(journal.job, output, db);
      output.status = 'succeeded';
      const saved = await transitionGeneration(job.id, 'succeeded', output, { expectedStatuses: ['processing'] }, db);
      if (saved.job?.status === 'succeeded') {
        const delivered = { ...saved.job.result }; delete delivered.savePending;
        const recorded = await db.rpc('ai_generation_save_result', { p_job_id: job.id, p_expected_result: saved.job.result, p_result: delivered });
        if (recorded.error) throw recorded.error;
        const current = await db.from('ai_generation_jobs').select('*').eq('id', job.id).single();
        if (current.error) throw current.error;
        return new Response(JSON.stringify(await hydrateGenerationResult(current.data, db)), { headers: response.headers });
      }
      return new Response(JSON.stringify(saved.job?.result), { headers: response.headers });
    } catch (error) {
      if (error instanceof LayerValidationError) {
        const failed = await transitionGeneration(job.id, 'failed', { ...raw, status: 'failed', error: error.message, savePending: false }, { expectedStatuses: ['processing'] }, db);
        const final = failed.job?.status === 'refund_pending' ? await recoverGenerationRefund(job.id, db) : failed.job;
        return new Response(JSON.stringify(final?.result), { headers: response.headers });
      }
      console.error('[generation] layer archive pending', job.id, String(error));
      return new Response(JSON.stringify({ status: 'saving', savePending: true, jobId: job.id }), { headers: response.headers });
    }
  }
  const decision = await transitionGeneration(job.id, result.status, result, {}, db);
  let current = decision.job;
  if (current?.status === 'refund_pending') current = await recoverGenerationRefund(job.id, db);
  else if (decision.claimed && current?.status === 'succeeded') {
    await retryGenerationSave(current);
    const saved = await db.from('ai_generation_jobs').select('*').eq('id', job.id).maybeSingle();
    if (saved.error) throw saved.error;
    current = saved.data;
  }
  return new Response(JSON.stringify(await hydrateGenerationResult(current, db) || result), { status: response.status, headers: response.headers });
}

/** Registered tickets choose their own provider; polling callers cannot redirect refund decisions. */
export async function generationTicket(endpoint: string, predictionId: string) {
  const { data, error } = await serviceClient().from('ai_generation_jobs').select('provider,provider_app,result,wallet_address')
    .eq('endpoint', endpoint).eq('prediction_id', predictionId).maybeSingle();
  if (error) throw new Error('Could not load the render ticket. Please retry.');
  return data;
}
