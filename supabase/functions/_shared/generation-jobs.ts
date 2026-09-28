import { serviceClient } from './auth.ts';
import type { ChargeResult } from './ai-payment-guard.ts';
import { archiveGeneration } from './archive-generation.ts';

async function saveOutput(job: any, result: Record<string, any>): Promise<void> {
  const url = result.videoUrl || result.modelUrl || result.imageUrl || result.audioUrl || result.image;
  if (!url && !result.text) return;
  try {
    await archiveGeneration(job.wallet_address, job.id, {
      id: job.id, kind: job.kind === 'tool' ? (result.audioUrl ? 'audio' : 'image') : job.kind === '3d' ? 'model3d' : job.kind,
      model: job.model, modelName: job.model, prompt: job.metadata?.prompt || job.model,
      resolvedPrompt: job.metadata?.prompt || '', aspect: job.metadata?.aspectRatio || '',
      createdAt: new Date(job.created_at).getTime(), finishedAt: Date.now(),
      ...(result.text ? { transcript: result.text } : {}),
    }, url);
    result.libraryId = job.id;
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
    if (!predictionId) result.savePending = true;
    const db = serviceClient();
    const update = {
      prediction_id: predictionId || null,
      provider: result.provider || (result.appId ? 'fal' : 'replicate'),
      provider_app: result.falAppId || result.appId || null,
      status: predictionId ? 'starting' : 'succeeded', result,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('ai_generation_jobs').update(update).eq('id', charge.jobId);
    if (error) throw error;
    if (!predictionId) {
      const { data: job } = await db.from('ai_generation_jobs').select('*').eq('id', charge.jobId).maybeSingle();
      if (job) {
        const saving = retryGenerationSave(job).catch((error) => console.error('[generation] deferred save', String(error)));
        const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (promise: Promise<void>) => void } }).EdgeRuntime;
        if (runtime) runtime.waitUntil(saving); else await saving;
      }
    }
  } catch (error) { console.error('[generation] ticket journal failed', charge.jobId, String(error)); }
  return response;
}

export async function retryGenerationSave(job: any): Promise<void> {
  const result = { ...job.result };
  await saveOutput(job, result);
  const { error } = await serviceClient().from('ai_generation_jobs').update({ result, updated_at: new Date().toISOString() }).eq('id', job.id);
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
  if (result.status !== 'succeeded') {
    const { error: releaseError } = await db.rpc('ai_payment_release', {
      p_tx_hash: job.tx_hash, p_wallet: job.wallet_address, p_dhb: job.price_dhb, p_job_id: job.id,
    });
    if (releaseError && !releaseError.message.includes('REFUND_ALREADY_APPLIED')) {
      throw new Error('The render failed. Payment recovery is pending; reconnect without paying again.');
    }
    result.paymentRestored = true;
  } else {
    await saveOutput(job, result);
  }
  const { error: updateError } = await db.from('ai_generation_jobs').update({
    status: result.status, result, updated_at: new Date().toISOString(),
  }).eq('id', job.id);
  if (updateError) throw new Error('Could not save the render status. Reconnect without paying again.');
  return new Response(JSON.stringify(result), { status: response.status, headers: response.headers });
}

/** Registered tickets choose their own provider; polling callers cannot redirect refund decisions. */
export async function generationTicket(endpoint: string, predictionId: string) {
  const { data, error } = await serviceClient().from('ai_generation_jobs').select('provider,provider_app,result')
    .eq('endpoint', endpoint).eq('prediction_id', predictionId).maybeSingle();
  if (error) throw new Error('Could not load the render ticket. Please retry.');
  return data;
}
