import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

it('keeps the attempt and identity across an OAuth document reload', async () => {
  let trace = await import('../auth-trace');
  trace.beginAuthTrace('google');
  trace.advanceAuthTrace('identity-established', 'incoming-user');
  const id = trace.readAuthTrace().auth_attempt_id;
  vi.resetModules();
  trace = await import('../auth-trace');
  expect(trace.readAuthTrace()).toMatchObject({ auth_attempt_id: id, auth_method: 'google', supabase_user_id: 'incoming-user' });
});

it('expires abandoned attempts and isolates the next login', async () => {
  const trace = await import('../auth-trace');
  trace.beginAuthTrace('email');
  trace.advanceAuthTrace('identity-established', 'old-user');
  const old = trace.readAuthTrace().auth_attempt_id;
  vi.advanceTimersByTime(30 * 60 * 1000 + 1);
  expect(trace.readAuthTrace()).toEqual({});
  trace.beginAuthTrace('apple');
  expect(trace.readAuthTrace().auth_attempt_id).not.toBe(old);
  expect(trace.readAuthTrace().supabase_user_id).toBeUndefined();
  trace.clearAuthTrace();
  expect(trace.readAuthTrace()).toEqual({});
});
