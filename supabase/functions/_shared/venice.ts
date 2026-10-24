import { atCostDhb, isVeniceImage, VENICE_IMAGE_MODELS, veniceVideoOptions } from './venice-catalog.ts';

const BASE = 'https://api.venice.ai/api/v1';
export class VeniceError extends Error {
  status: number;
  uncertain: boolean;
  constructor(message: string, status = 503, uncertain = false) { super(message); this.status = status; this.uncertain = uncertain; }
}

export async function veniceFetch(path: string, body?: Record<string, unknown>, generation = false): Promise<Response> {
  const runtime = (globalThis as unknown as { Deno?: { env: { get(name: string): string | undefined } } }).Deno;
  const key = runtime?.env.get('VENICE_API_KEY');
  if (!key) throw new VeniceError('Venice is temporarily unavailable');
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(generation ? 110_000 : 20_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new VeniceError(response.status === 422 ? 'Venice declined this request under its content policy.'
        : response.status === 402 ? 'Venice generation is temporarily unavailable.'
        : 'Venice could not complete this request. Please try again later.', response.status === 422 ? 400 : 503);
    }
    return response;
  } catch (error) {
    if (error instanceof VeniceError) throw error;
    throw new VeniceError(generation ? 'Venice submission could not be confirmed. Check your library before retrying.' : 'Venice pricing is unavailable. Nothing has been charged.', 503, generation);
  }
}

export async function quoteVenice(modelId: string, opts: { durationSeconds?: number; resolution?: string; aspectRatio?: string; quantity?: number } = {}) {
  let cost: number;
  if (isVeniceImage(modelId)) {
    const response = await veniceFetch('/models?type=image');
    const models = await response.json();
    const model = models.data?.find((entry: any) => entry.id === VENICE_IMAGE_MODELS[modelId].apiModel);
    if (!model || model.model_spec?.offline) throw new VeniceError('This Venice model is unavailable');
    cost = model.model_spec?.pricing?.generation?.usd;
  } else {
    const response = await veniceFetch('/video/quote', veniceVideoOptions(modelId, opts));
    cost = (await response.json()).quote;
  }
  if (typeof cost !== 'number') throw new VeniceError('Venice did not return a valid price');
  const quantity = opts.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) throw new Error('Invalid generation quantity');
  const priceDhb = atCostDhb(cost) * quantity;
  return { priceDhb, priceUsd: priceDhb / 1000, provider: 'venice', markup: 0 };
}

export async function generateVeniceImage(modelId: string, prompt: string, aspect = '1:1') {
  if (!isVeniceImage(modelId)) throw new Error('Unknown Venice image model');
  const sizes: Record<string, [number, number]> = {
    '1:1': [1024, 1024], '16:9': [1280, 720], '9:16': [720, 1280],
    '4:3': [1152, 864], '3:4': [864, 1152], '3:2': [1152, 768],
    '2:3': [768, 1152], '4:5': [832, 1040], '21:9': [1344, 576],
  };
  if (!sizes[aspect]) throw new Error('Unsupported image aspect ratio');
  const [width, height] = sizes[aspect];
  const response = await veniceFetch('/image/generate', {
    model: VENICE_IMAGE_MODELS[modelId].apiModel, prompt,
    width, height, format: 'webp', safe_mode: true,
    // Use the model's own step count; enhancement would add an unquoted charge.
  }, true);
  const result = await response.json();
  const image = result.images?.[0];
  if (typeof image !== 'string' || !image) throw new VeniceError('Venice returned no image');
  return { imageUrl: `data:image/webp;base64,${image}`, provider: 'venice', model: modelId };
}
