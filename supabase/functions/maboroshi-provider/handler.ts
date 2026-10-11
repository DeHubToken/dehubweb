// Only the private Maboroshi worker may use the existing provider accounts.
const FAL = 'https://queue.fal.run/bytedance/seedance-2.5';
const REPLICATE = 'https://api.replicate.com/v1';
const AUDIO_VERSION = '25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953';
const MASK_VERSION = '408f82fc20c300aac5d61d2e34ddb34cd0181e810e9f609d250aed14d5f81269';
type Env = (name: string) => string | undefined;
type Json = Record<string, any>;

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.length || value.length > limit) throw new Error('Invalid input');
  return value;
}

export function media(value: unknown): string {
  const raw = text(value, 2048);
  const url = new URL(raw);
  if (url.origin !== 'https://live.dehub.io' || url.username || url.password || url.hash
      || !/^\/maboroshi\/media\/[a-f0-9]{32}\/[a-zA-Z0-9_.-]+$/.test(url.pathname)
      || !/^\d{10}$/.test(url.searchParams.get('expires') || '')
      || !/^[a-f0-9]{64}$/.test(url.searchParams.get('signature') || '')) throw new Error('Invalid media');
  return raw;
}

export function queueUrl(value: unknown, id: string, kind: 'status' | 'result'): string {
  const url = new URL(text(value, 1024));
  const path = url.pathname.split('/requests/');
  const allowed = ['/bytedance/seedance-2.5', '/bytedance/seedance-2.5/reference-to-video', '/bytedance/seedance-2.5/draft/complete'];
  if (url.origin !== 'https://queue.fal.run' || url.username || url.password || url.search || url.hash
      || path.length !== 2 || !allowed.includes(path[0])
      || !(kind === 'status' ? path[1] === `${id}/status` : [id, `${id}/response`].includes(path[1]))) throw new Error('Invalid queue handle');
  return url.href;
}

function identifier(value: unknown): string {
  const id = text(value, 100);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid request ID');
  return id;
}

export async function authorized(supplied: string, expected: string): Promise<boolean> {
  if (expected.length < 20 || !supplied || supplied.length > 4096) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}

export function createHandler(env: Env, fetcher: typeof fetch = fetch, payment?: (body: Json) => Promise<Response>) {
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
  });
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return reply({error: 'Method not allowed'}, 405);
    if (!await authorized(req.headers.get('x-internal-secret') || '', env('INTERNAL_SERVICE_SECRET') || '')) return reply({error: 'Unauthorized'}, 401);
    if (Number(req.headers.get('content-length')) > 24000) return reply({error: 'Request too large'}, 413);
    let body: Json;
    try {
      const raw = await req.text();
      if (raw.length > 24000) return reply({error: 'Request too large'}, 413);
      body = JSON.parse(raw);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    } catch { return reply({error: 'Invalid request'}, 400); }
    if (body.operation === 'payment_charge' || body.operation === 'payment_refund') {
      return payment ? payment(body) : reply({error: 'Payment service unavailable'}, 503);
    }
    const replicateKey = env('REPLICATE_API_KEY');
    const falKey = env('FAL_KEY');
    if (body.operation === 'health') return reply({ready: Boolean(replicateKey && falKey)});
    if (!replicateKey || !falKey) return reply({error: 'Processing unavailable'}, 503);
    const request = async (url: string, provider: 'replicate' | 'fal', payload?: Json): Promise<Json> => {
      const response = await fetcher(url, {
        method: payload ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: {'Authorization': provider === 'fal' ? `Key ${falKey}` : `Bearer ${replicateKey}`, 'Content-Type': 'application/json'},
        ...(payload ? {body: JSON.stringify(payload)} : {}),
      });
      if (!response.ok) throw new Error('Provider unavailable');
      return await response.json();
    };
    try {
      if (body.operation === 'prepare') {
        const url = media(body.media);
        let version: string;
        let input: Json;
        if (body.kind === 'audio') {
          version = AUDIO_VERSION; input = {audio: url, model_name: 'htdemucs', output_format: 'wav'};
        } else if (body.kind === 'mask') {
          version = MASK_VERSION; input = {video: url, prompt: text(body.prompt, 200), mask_only: true, return_zip: true};
        } else if (body.kind === 'depth') {
          const model = await request(`${REPLICATE}/models/lucataco/depth-anything-video`, 'replicate');
          const v = model.latest_version;
          const properties = v.openapi_schema.components.schemas.Input.properties;
          const key = Object.keys(properties).find(k => k.includes('video') && properties[k].format === 'uri');
          if (!key) throw new Error('Provider schema unavailable');
          version = v.id; input = {[key]: url};
        } else return reply({error: 'Invalid preparation'}, 400);
        const result = await request(`${REPLICATE}/predictions`, 'replicate', {version, input});
        return reply({id: result.id, status: result.status, output: result.output});
      }
      if (body.operation === 'prediction') {
        const result = await request(`${REPLICATE}/predictions/${identifier(body.request_id)}`, 'replicate');
        return reply({id: result.id, status: result.status, output: result.output});
      }
      if (body.operation === 'draft' || body.operation === 'hd') {
        let payload: Json;
        if (body.operation === 'draft') {
          const p = body.input;
          if (!p || !Array.isArray(p.video_urls) || p.video_urls.length < 1 || p.video_urls.length > 2
              || !Array.isArray(p.image_urls) || p.image_urls.length > 2
              || !['editing', 'reference'].includes(p.task)
              || !/^(auto|[4-9]|[12][0-9]|30)$/.test(p.duration)) return reply({error: 'Invalid draft'}, 400);
          payload = {prompt: text(p.prompt, 8000), task: p.task, video_urls: p.video_urls.map(media), image_urls: p.image_urls.map(media),
            draft: true, resolution: '480p', duration: p.duration, aspect_ratio: 'auto', generate_audio: true};
        } else payload = {draft_id: identifier(body.draft_id), resolution: '1080p'};
        const result = await request(`${FAL}/${body.operation === 'hd' ? 'draft/complete' : 'reference-to-video'}`, 'fal', payload);
        const id = identifier(result.request_id);
        return reply({requestId: id, provider: 'fal', status_url: queueUrl(result.status_url, id, 'status'), response_url: queueUrl(result.response_url, id, 'result')});
      }
      if (body.operation === 'status') {
        const id = identifier(body.request_id);
        const status = await request(queueUrl(body.status_url, id, 'status'), 'fal');
        if (status.status !== 'COMPLETED') return reply({status: status.status});
        if (status.error) return reply({status: 'FAILED'});
        const result = await request(queueUrl(body.response_url, id, 'result'), 'fal');
        return reply({status: 'COMPLETED', result: result.video?.url, draft_id: result.draft_id});
      }
      return reply({error: 'Unknown operation'}, 400);
    } catch {
      // Signed input URLs and provider response bodies must not enter logs.
      return reply({error: 'Processing request failed'}, 502);
    }
  };
}
