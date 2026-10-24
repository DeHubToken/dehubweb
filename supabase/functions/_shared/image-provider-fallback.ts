import { createUsageMeter } from './ai-usage.ts';

export const IMAGE_UNAVAILABLE = 'Image generation is temporarily unavailable. Please try again shortly.';
export const IMAGE_BLOCKED = "That prompt was blocked by the model's safety filter. Try describing it differently.";

export class ImageProviderError extends Error {
  readonly retryable: boolean;
  readonly safetyBlocked: boolean;
  constructor(readonly status: number, detail: string, unavailable = false) {
    const safetyBlocked = /safety|content.policy|content.filter|prohibited.content|moderation|nsfw/i.test(detail);
    super(safetyBlocked ? IMAGE_BLOCKED : IMAGE_UNAVAILABLE);
    this.name = 'ImageProviderError';
    this.safetyBlocked = safetyBlocked;
    // Only switch after a definite rejection. A timeout or transport failure
    // may have accepted billable work, and a safety refusal must not be retried.
    this.retryable = !safetyBlocked && (unavailable || [401, 402, 404, 429].includes(status)
      || (status === 403 && /top_up|credits?|billing|quota|account.{0,30}lock|user is locked/i.test(detail)));
  }
}

export interface ImageRequest {
  requestedModel: string;
  prompt: string;
  sourceImage?: string;
  referenceImageUrls?: string[];
  aspectRatio?: string;
  vector?: boolean;
}

export interface ImageOutput {
  imageUrl: string;
  text?: string;
  provider: string;
  model: string;
  usage?: unknown;
}

const blockedUntil = new Map<string, number>();
const gatewayModel = 'google/gemini-3.1-flash-image';
const references = (request: ImageRequest): string[] =>
  [...new Set([request.sourceImage, ...(request.referenceImageUrls ?? [])].filter((url): url is string => !!url))];

export async function gatewayImage(request: ImageRequest, signal: AbortSignal, model = gatewayModel): Promise<ImageOutput> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new ImageProviderError(503, 'Gateway not configured', true);
  const images = references(request);
  const content = images.length ? [
    ...images.map(url => ({ type: 'image_url', image_url: { url } })),
    { type: 'text', text: request.prompt },
  ] : request.prompt;
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], modalities: ['image', 'text'] }),
  });
  if (!response.ok) throw new ImageProviderError(response.status, await response.text());
  const payload = await response.json();
  const choice = payload.choices?.[0];
  if (choice?.error || /safety|content_filter/i.test(`${choice?.finish_reason ?? ''} ${choice?.native_finish_reason ?? ''}`)) {
    throw new ImageProviderError(400, 'content policy');
  }
  const imageUrl = choice?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) throw new ImageProviderError(502, 'No image returned');
  return { imageUrl, text: typeof choice.message.content === 'string' ? choice.message.content : '',
    provider: 'lovable', model, usage: payload.usage };
}

async function replicateImage(request: ImageRequest, signal: AbortSignal): Promise<ImageOutput> {
  const key = Deno.env.get('REPLICATE_API_KEY');
  if (!key) throw new ImageProviderError(503, 'Replicate not configured', true);
  const images = references(request);
  const model = images.length ? 'black-forest-labs/flux-kontext-pro' : 'black-forest-labs/flux-schnell';
  const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'wait=60', 'Cancel-After': '45s' },
    body: JSON.stringify({ input: { prompt: request.prompt, output_format: 'png',
      ...(images.length ? { input_image: images[0], aspect_ratio: request.aspectRatio ?? 'match_input_image', safety_tolerance: 2 }
        : { aspect_ratio: request.aspectRatio ?? '1:1', num_outputs: 1 }) } }),
  });
  if (!response.ok) throw new ImageProviderError(response.status, await response.text());
  const prediction = await response.json();
  const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  // Sync file predictions can return complete output before metrics settle.
  if (['succeeded', 'processing'].includes(prediction.status) && typeof imageUrl === 'string') {
    return { imageUrl, provider: 'replicate', model };
  }
  // Never submit another generation after Replicate accepted this one. Its
  // server-side deadline also bounds work if the connection is interrupted.
  if (['starting', 'processing'].includes(prediction.status) && /^[a-z0-9]+$/i.test(prediction.id ?? '')) {
    await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, signal,
    }).then(response => response.body?.cancel()).catch(() => {});
  }
  throw new ImageProviderError(502, String(prediction.error ?? 'Image did not finish'));
}

/** One payment covers the complete ladder; callers refund only its final failure. */
export async function resilientImage(
  request: ImageRequest,
  primary: { provider: string; model: string; generate: (signal: AbortSignal) => Promise<ImageOutput> },
) {
  const meter = createUsageMeter('generate-image', request.requestedModel);
  const signal = AbortSignal.timeout(110_000);
  const attempts = [primary];
  // Preserve vector output and every image reference rather than silently
  // producing a raster or dropping the rest of an editing request.
  if (!request.vector && primary.provider !== 'lovable') {
    attempts.push({ provider: 'lovable', model: gatewayModel, generate: signal => gatewayImage(request, signal) });
  }
  if (!request.vector && references(request).length <= 1 && primary.provider !== 'replicate') {
    attempts.push({ provider: 'replicate', model: references(request).length
      ? 'black-forest-labs/flux-kontext-pro' : 'black-forest-labs/flux-schnell', generate: signal => replicateImage(request, signal) });
  }
  let fallbackReason = 'none';
  try {
    for (const attempt of attempts) {
      if (Date.now() < (blockedUntil.get(attempt.provider) ?? 0)) {
        fallbackReason = `${attempt.provider}_backoff`;
        continue;
      }
      const started = Date.now();
      const accounting = (status: number, outcome: string) => ({ provider: attempt.provider,
        route: attempt.provider === 'lovable' ? 'gateway' as const : 'direct' as const,
        model: attempt.model, status, outcome, fallback: fallbackReason, elapsedMs: Date.now() - started });
      try {
        const result = await attempt.generate(signal);
        meter.record(accounting(200, 'accepted'), { usage: result.usage });
        const { usage: _usage, ...output } = result;
        return { ...output, requestedModel: request.requestedModel, fallbackUsed: fallbackReason !== 'none', fallbackReason };
      } catch (error) {
        meter.record(accounting(error instanceof ImageProviderError ? error.status : 0,
          error instanceof ImageProviderError ? 'http_error' : 'transport_error'));
        if (!(error instanceof ImageProviderError)) throw new ImageProviderError(502, 'Provider transport failed');
        if (!error.retryable || signal.aborted) throw error;
        fallbackReason = `${attempt.provider}_http_${error.status}`;
        if ([401, 402, 403, 429].includes(error.status)) {
          blockedUntil.set(attempt.provider, Date.now() + (error.status === 429 ? 30_000 : 5 * 60_000));
        }
      }
    }
    throw new ImageProviderError(503, 'All compatible image providers unavailable');
  } finally {
    meter.flush();
  }
}
