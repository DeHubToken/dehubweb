import { beforeEach, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

beforeEach(() => { vi.resetModules(); invoke.mockReset(); });

it('recovers from a failed background probe when Telegram is selected later', async () => {
  invoke.mockResolvedValueOnce({ error: new Error('Network unavailable'), data: null });
  invoke.mockResolvedValueOnce({ error: null, data: { enabled: true, botId: '123456', botUsername: 'dehub' } });
  const { fetchTelegramLoginConfig } = await import('./telegram-login');
  expect(await fetchTelegramLoginConfig()).toMatchObject({ enabled: false });
  expect(await fetchTelegramLoginConfig()).toMatchObject({ enabled: true, botId: '123456' });
  expect(await fetchTelegramLoginConfig()).toMatchObject({ enabled: true, botId: '123456' });
  expect(invoke).toHaveBeenCalledTimes(2);
});
