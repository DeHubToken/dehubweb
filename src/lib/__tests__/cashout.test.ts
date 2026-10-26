import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/ai-invoke', () => ({ dehubAuthHeaders: () => ({}), readFunctionError: async () => '' }));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: async () => '' }));

import { cashoutTone, validCashoutAmount } from '../cashout';

describe('cashout helpers', () => {
  it('groups partner statuses for display', () => {
    expect(cashoutTone('completed')).toBe('done');
    expect(cashoutTone('refunded')).toBe('failed');
    expect(cashoutTone('awaiting_crypto')).toBe('pending');
    expect(cashoutTone('processing')).toBe('pending');
  });

  it('bounds the amount', () => {
    const cfg = { min: 1, max: 100000 };
    expect(validCashoutAmount('25', cfg)).toBe(true);
    expect(validCashoutAmount('25.123456', cfg)).toBe(true);
    expect(validCashoutAmount('25.1234567', cfg)).toBe(false);
    expect(validCashoutAmount('0.5', cfg)).toBe(false);
    expect(validCashoutAmount('100001', cfg)).toBe(false);
    expect(validCashoutAmount('-3', cfg)).toBe(false);
    expect(validCashoutAmount('', cfg)).toBe(false);
  });
});
