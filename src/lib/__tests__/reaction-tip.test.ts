import { beforeEach, expect, it, vi } from 'vitest';

const { rpc, show } = vi.hoisted(() => ({ rpc: vi.fn(), show: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/lib/supabase-wallet-client', () => ({ withWalletHeader: (query: unknown) => query }));
vi.mock('sonner', () => ({ toast: { info: show } }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));

const wallet = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const legacy = 'dehub:reaction-tip-seen';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  rpc.mockResolvedValue({ data: true, error: null });
});

it('claims once for rapid taps across cards and after a reload', async () => {
  const hint = await import('@/lib/reaction-tip');
  await Promise.all([hint.maybeShowReactionTip(wallet), hint.maybeShowReactionTip(wallet)]);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledTimes(1);
  vi.resetModules();
  const reloaded = await import('@/lib/reaction-tip');
  await reloaded.maybeShowReactionTip(wallet);
  expect(show).toHaveBeenCalledTimes(1);
});

it('does not remind an account already taught on another client', async () => {
  rpc.mockResolvedValue({ data: false, error: null });
  const hint = await import('@/lib/reaction-tip');
  await hint.maybeShowReactionTip(wallet);
  expect(show).not.toHaveBeenCalled();
});

it('adopts the old device flag without showing the hint again', async () => {
  localStorage.setItem(legacy, '1');
  const hint = await import('@/lib/reaction-tip');
  await hint.maybeShowReactionTip(wallet);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(show).not.toHaveBeenCalled();
  expect(localStorage.getItem(`${legacy}:${wallet}`)).toBe('1');
});

it('cancels a pending hint when the reaction picker opens', async () => {
  let finish!: (result: { data: boolean; error: null }) => void;
  rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hint = await import('@/lib/reaction-tip');
  const pending = hint.maybeShowReactionTip(wallet);
  hint.markReactionTipSeen(wallet);
  finish({ data: true, error: null });
  await pending;
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(show).not.toHaveBeenCalled();
});

it('scopes the record to the account and normalises its address', async () => {
  const hint = await import('@/lib/reaction-tip');
  await hint.maybeShowReactionTip(wallet.toUpperCase());
  await hint.maybeShowReactionTip(wallet);
  await hint.maybeShowReactionTip(other);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(show).toHaveBeenCalledTimes(2);
});

it('stays quiet on a failed account check and never blocks the like', async () => {
  rpc.mockRejectedValue(new Error('offline'));
  const hint = await import('@/lib/reaction-tip');
  await expect(hint.maybeShowReactionTip(wallet)).resolves.toBeUndefined();
  await hint.maybeShowReactionTip(wallet);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(show).not.toHaveBeenCalled();
});

it('keeps the once-only guard when durable storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const hint = await import('@/lib/reaction-tip');
  await hint.maybeShowReactionTip(wallet);
  await hint.maybeShowReactionTip(wallet);
  expect(show).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
});

it('does not claim or show a hint for a signed-out like', async () => {
  const hint = await import('@/lib/reaction-tip');
  await hint.maybeShowReactionTip(null);
  expect(rpc).not.toHaveBeenCalled();
  expect(show).not.toHaveBeenCalled();
});
