/**
 * Free starter images.
 *
 * Every wallet gets a handful of images on the cheapest models without a DHB
 * transfer, so trying the studio does not start with a wallet signature. The
 * allowance is small and the models are the ones that cost us $0.02 or less,
 * so a farmed wallet is worth pennies; a per-IP cap sits on top.
 */
import { serviceClient } from './auth.ts';
import { IMAGE_COST_USD, type JobKind } from './ai-pricing.ts';

export const FREE_IMAGE_LIMIT = 5;
const FREE_MAX_COST_USD = 0.02;

export const FREE_IMAGE_MODELS = Object.entries(IMAGE_COST_USD)
  .filter(([, cost]) => cost <= FREE_MAX_COST_USD)
  .map(([id]) => id);

export function freeEligible(kind: JobKind, modelId: string, quantity = 1): boolean {
  return kind === 'image' && quantity <= 1 && FREE_IMAGE_MODELS.includes(modelId);
}

export async function freeRemaining(wallet: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from('ai_free_generations')
    .select('job_id', { count: 'exact', head: true })
    .eq('wallet_address', wallet.toLowerCase());
  if (error) throw error;
  return Math.max(0, FREE_IMAGE_LIMIT - (count ?? 0));
}

/** Take one free generation for this job. False when the allowance is spent. */
export async function claimFree(wallet: string, jobId: string, modelId: string): Promise<boolean> {
  const { data, error } = await serviceClient().rpc('ai_free_claim', {
    p_wallet: wallet, p_job_id: jobId, p_model: modelId, p_limit: FREE_IMAGE_LIMIT,
  });
  if (error) throw error;
  return data === true;
}

/** Give a free generation back when the provider failed to deliver it. */
export async function releaseFree(jobId: string): Promise<void> {
  const { error } = await serviceClient().from('ai_free_generations').delete().eq('job_id', jobId);
  if (error) console.error('[ai-free] release failed', jobId, error.message);
}
