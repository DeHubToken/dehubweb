import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), ticket: vi.fn() }));
vi.mock('../supabase/functions/_shared/auth.ts', () => ({ corsHeaders: {}, requireDeHubAuth: mocks.auth }));
vi.mock('../supabase/functions/_shared/generation-jobs.ts', () => ({ generationTicket: mocks.ticket }));
import { authorizeGenerationPoll } from '../supabase/functions/_shared/generation-poll-auth';
const authorizeVideoPoll = (req: Request, id: unknown) => authorizeGenerationPoll(req, 'generate-video', id);
const OWNER = '0x1111111111111111111111111111111111111111';
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Deno', { env: { get: () => 'service-fixture' } });
  mocks.auth.mockResolvedValue({ ok: true, wallet: OWNER });
});
describe('private Creator video polling', () => {
  for (const provider of ['replicate', 'fal', 'kie', 'kie-veo', 'venice']) {
    it(`requires the verified owner for ${provider}`, async () => {
      mocks.ticket.mockResolvedValue({ provider, wallet_address: OWNER, provider_app: 'owned-model' });
      const result = await authorizeVideoPoll(new Request('https://edge.test'), 'ticket');
      expect(result.ok).toBe(true);
      expect(mocks.auth).toHaveBeenCalledTimes(1);
      expect(mocks.ticket).toHaveBeenCalledWith('generate-video', 'ticket');
      mocks.auth.mockResolvedValue({ ok: true, wallet: 'other-wallet' });
      const denied = await authorizeVideoPoll(new Request('https://edge.test'), 'ticket');
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.response.status).toBe(404);
    });
  }
  it('does not look up private ticket existence for an unauthenticated caller', async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response('{}', { status: 401 }) });
    const denied = await authorizeVideoPoll(new Request('https://edge.test'), 'ticket');
    expect(denied.ok).toBe(false);
    expect(mocks.ticket).not.toHaveBeenCalled();
  });
  it('allows the authenticated scheduler while still requiring a journalled provider', async () => {
    mocks.ticket.mockResolvedValue({ provider: 'fal', provider_app: 'owned-model', wallet_address: OWNER });
    expect((await authorizeVideoPoll(new Request('https://edge.test', { headers: { Authorization: 'Bearer service-fixture' } }), 'ticket')).ok).toBe(true);
    expect(mocks.auth).not.toHaveBeenCalled();
    mocks.ticket.mockResolvedValue(null);
    const missing = await authorizeVideoPoll(new Request('https://edge.test', { headers: { Authorization: 'Bearer service-fixture' } }), 'unknown');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.response.status).toBe(404);
  });
  it('refuses malformed ids and cannot route an unjournalled caller-selected provider', async () => {
    expect((await authorizeVideoPoll(new Request('https://edge.test'), { predictionId: 'ticket' })).ok).toBe(false);
    expect(mocks.ticket).not.toHaveBeenCalled();
    mocks.ticket.mockResolvedValue({ provider: null, wallet_address: OWNER });
    const unknown = await authorizeVideoPoll(new Request('https://edge.test'), 'ticket');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.response.status).toBe(503);
  });
  it('does not accept an empty configured service key or a caller bearer token as scheduler authority', async () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } });
    mocks.auth.mockResolvedValue({ ok: false, response: new Response('{}', { status: 401 }) });
    expect((await authorizeVideoPoll(new Request('https://edge.test', { headers: { Authorization: 'Bearer undefined' } }), 'ticket')).ok).toBe(false);
    expect(mocks.ticket).not.toHaveBeenCalled();
  });
  for (const endpoint of ['generate-3d', 'fal-ai-tools'] as const) {
    it(`scopes ${endpoint} lookup and provider routing to its verified owner`, async () => {
      mocks.ticket.mockResolvedValue({ provider: 'fal', provider_app: 'owned-model', wallet_address: OWNER, result: { statusUrl: 'https://queue.fal.run/owned/status' } });
      expect((await authorizeGenerationPoll(new Request('https://edge.test'), endpoint, 'ticket')).ok).toBe(true);
      expect(mocks.ticket).toHaveBeenCalledWith(endpoint, 'ticket');
      mocks.auth.mockResolvedValue({ ok: true, wallet: 'another-account' });
      const other = await authorizeGenerationPoll(new Request('https://edge.test'), endpoint, 'ticket');
      if (!other.ok) expect(other.response.status).toBe(404);
      else throw new Error('Another account accessed a private ticket');
      mocks.auth.mockResolvedValue({ ok: true, wallet: OWNER });
      mocks.ticket.mockResolvedValue({ provider: 'replicate', wallet_address: OWNER });
      const wrongRoute = await authorizeGenerationPoll(new Request('https://edge.test'), endpoint, 'ticket');
      if (!wrongRoute.ok) expect(wrongRoute.response.status).toBe(503);
      else throw new Error('Endpoint accepted an unsupported provider');
    });
  }
});
