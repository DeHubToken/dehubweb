import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({
  requireDeHubAuth: vi.fn(async () => ({ ok: true, wallet: 'owner' })),
  checkRateLimit: vi.fn(async () => ({ allowed: true })), serviceClient: vi.fn(() => ({})),
}));
vi.mock('../../supabase/functions/_shared/voice-ownership.ts', () => ({ refuseForeignVoice: vi.fn(async () => null) }));
vi.mock('../../supabase/functions/_shared/chirp-tts.ts', () => ({ isChirpVoice: vi.fn(() => false), synthesizeChirp: vi.fn() }));
let handler: (request: Request) => Promise<Response>;
const upstream = vi.fn();
beforeAll(async () => {
  vi.stubGlobal('Deno', { serve: (value: typeof handler) => { handler = value; }, env: { get: () => 'test-provider-key' } });
  const endpointPath = '../../supabase/functions/elevenlabs-tts/index.ts';
  await import(/* @vite-ignore */ endpointPath);
});
beforeEach(() => { upstream.mockReset(); vi.stubGlobal('fetch', upstream); });
afterAll(() => vi.unstubAllGlobals());
const request = (outputFormat?: string) => new Request('https://backend.test/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hello', voiceId: 'stock', outputFormat }) });

it('maps requested WAV to verified PCM and returns a playable framed WAV', async () => {
  upstream.mockResolvedValue(new Response(new Uint8Array([0, 0, 255, 127]), { headers: { 'Content-Type': 'audio/pcm' } }));
  const result = await handler(request('wav_24000'));
  expect(upstream.mock.calls[0][0]).toContain('output_format=pcm_24000');
  expect(result.headers.get('Content-Type')).toBe('audio/wav');
  const bytes = await result.arrayBuffer();
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
  expect(new DataView(bytes).getUint32(24, true)).toBe(24000);
});
it('preserves legacy MP3 requests and refuses mislabeled bytes without another provider request', async () => {
  const mp3 = new Uint8Array([255, 251, 144, 0]);
  upstream.mockResolvedValueOnce(new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } }));
  const legacy = await handler(request());
  expect(legacy.headers.get('Content-Type')).toBe('audio/mpeg');
  expect([...new Uint8Array(await legacy.arrayBuffer())]).toEqual([...mp3]);
  upstream.mockResolvedValueOnce(new Response('{"error":"bad"}', { headers: { 'Content-Type': 'audio/wav' } }));
  expect((await handler(request('wav_24000'))).status).toBe(502);
  expect(upstream).toHaveBeenCalledTimes(2);
});
