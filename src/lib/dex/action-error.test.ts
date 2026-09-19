import { describe, it, expect } from 'vitest';
import { dexActionError } from './action-error';
describe('DEX action errors', () => {
  it('replaces the reported RPC retry dump and preserves uncertainty about submission', () => {
    const result = dexActionError(new Error('exceeded maximum retry limit (request={}, response={}, info={"requestUrl":"https://mainnet.base.org","responseBody":"over rate limit"}, code=SERVER_ERROR)'));
    expect(result).toContain('network provider is busy');
    expect(result).toContain('check your wallet activity');
    expect(result).not.toContain('requestUrl');
  });
  it('preserves actionable validation errors', () => {
    expect(dexActionError(new Error('Insufficient DHB on the selected chain'))).toBe('Insufficient DHB on the selected chain');
  });
});
