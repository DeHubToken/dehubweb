import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), headers: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke }, supabaseUrl: 'https://edge.test', supabaseKey: 'public-fixture' } }));
vi.mock('@/lib/ai-invoke', () => ({ invokeAi: vi.fn(), dehubAuthHeaders: mocks.headers }));
vi.mock('@/lib/ai-payment', () => ({ forgetPayment: vi.fn() }));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: vi.fn() }));
vi.mock('@/i18n/copy', () => ({ translateCopy: (key: string) => key }));
import { poll3d, pollVideo } from '../src/lib/creator/generationEngine';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockReturnValue({ 'x-dehub-token': 'verified-session', 'x-wallet-address': 'owner' });
  mocks.invoke.mockResolvedValue({ data: { status: 'succeeded', videoUrl: 'https://media.test/owned.mp4' }, error: null });
});
afterEach(() => vi.restoreAllMocks());
for (const provider of ['replicate', 'fal', 'kie', 'kie-veo', 'venice']) {
  it(`authenticates a resumed ${provider} video poll without submitting a generation`, async () => {
    await expect(pollVideo({ predictionId: 'owned-ticket', provider, startedAt: Date.now() })).resolves.toBe('https://media.test/owned.mp4');
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('generate-video', {
      headers: { 'x-dehub-token': 'verified-session', 'x-wallet-address': 'owner' },
      body: { predictionId: 'owned-ticket', provider, falAppId: undefined },
    });
  });
}
it('authenticates a resumed private 3D poll', async () => {
  mocks.invoke.mockResolvedValue({ data: { status: 'succeeded', modelUrl: 'https://media.test/owned.glb' }, error: null });
  await expect(poll3d({ predictionId: 'owned-3d', provider: 'fal', startedAt: Date.now() })).resolves.toBe('https://media.test/owned.glb');
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('generate-3d', expect.objectContaining({ headers: { 'x-dehub-token': 'verified-session', 'x-wallet-address': 'owner' } }));
});
