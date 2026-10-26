import { serviceClient } from './auth.ts';
import { refundCreditsOutcome } from './credits.ts';

type Db = ReturnType<typeof serviceClient>;
export interface GenerationJournal extends Record<string, any> { id: string; status: string; result?: Record<string, any> }
export interface GenerationDecision { claimed: boolean; job: GenerationJournal | null }

export async function transitionGeneration(id: string, status: string, result: Record<string, any>, options: {
  predictionId?: string; provider?: string; providerApp?: string; expectedStatuses?: string[]; createdBefore?: string;
} = {}, db: Db = serviceClient()): Promise<GenerationDecision> {
  const { data, error } = await db.rpc('ai_generation_transition', {
    p_job_id: id, p_status: status, p_result: result, p_prediction_id: options.predictionId || null,
    p_provider: options.provider || null, p_provider_app: options.providerApp || null,
    p_expected_statuses: options.expectedStatuses || null, p_created_before: options.createdBefore || null,
  });
  if (error) throw new Error('Could not record the render decision. Reconnect without paying again.');
  return data as GenerationDecision;
}

/** The durable refund decision precedes every financial side effect. */
export async function recoverGenerationRefund(id: string, db: Db = serviceClient(), refund = refundCreditsOutcome): Promise<GenerationJournal | null> {
  const token = crypto.randomUUID();
  const claimed = await db.rpc('ai_generation_refund_claim', { p_job_id: id, p_token: token });
  if (claimed.error) throw new Error('Payment recovery is pending. Reconnect without paying again.');
  const decision = claimed.data as GenerationDecision;
  if (!decision.claimed || !decision.job) return decision.job;
  const job = decision.job;
  let creditRestored = false;
  if (job.payment_source === 'credits') {
    creditRestored = (await refund(job.credit_debit_key)) === 'restored';
    if (!creditRestored) throw new Error('Payment recovery is pending. Reconnect without paying again.');
  }
  // For wallet receipts, release and finalization share this SQL transaction.
  const finished = await db.rpc('ai_generation_refund_finish', { p_job_id: id, p_token: token, p_credit_restored: creditRestored });
  if (finished.error) throw new Error('Payment recovery is pending. Reconnect without paying again.');
  return finished.data as GenerationJournal | null;
}

export async function refundJournalledGeneration(id: string, db: Db = serviceClient()): Promise<boolean> {
  const decision = await transitionGeneration(id, 'failed', { status: 'failed', error: 'Generation could not be completed' }, {}, db);
  if (!decision.job) return false;
  if (decision.job.status !== 'refund_pending') return decision.job.result?.paymentRestored === true;
  const finished = await recoverGenerationRefund(id, db);
  return finished?.result?.paymentRestored === true;
}
