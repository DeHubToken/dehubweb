import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

describe('client log batches', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    invoke.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('dehub_wallet', '0xABC');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('delivers every row in a burst without exceeding the server cap', async () => {
    const { logToBackend } = await import('../logger');
    for (let i = 0; i < 125; i++) {
      await logToBackend({ level: 'error', component: 'test', message: `error ${i}` });
    }
    await vi.advanceTimersByTimeAsync(30_000);
    const batches = invoke.mock.calls.map(call => call[1].body.logs);
    expect(batches.map(batch => batch.length)).toEqual([50, 50, 25]);
    expect(new Set(batches.flat().map(row => row.message)).size).toBe(125);
    expect(batches.flat().every(row => row.user_address === '0xabc')).toBe(true);
  });
});
