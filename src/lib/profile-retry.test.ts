import { describe, expect, it } from 'vitest';
import { shouldRetryProfile } from './profile-retry';

describe('profile retry policy', () => {
  it.each([400, 401, 403, 404, 429])('does not replay HTTP %i', (httpStatus) => {
    expect(shouldRetryProfile(0, Object.assign(new Error('Request failed'), { httpStatus }))).toBe(false);
  });
  it('does not restart exhausted session recovery', () => {
    expect(shouldRetryProfile(0, Object.assign(new Error('Sign in again'), { name: 'AuthenticationError' }))).toBe(false);
  });
  it.each([new TypeError('Failed to fetch'), Object.assign(new Error('Unavailable'), { httpStatus: 503 })])('bounds transient retries', (error) => {
    expect(shouldRetryProfile(2, error)).toBe(true);
    expect(shouldRetryProfile(3, error)).toBe(false);
  });
  it('preserves bounded recovery from empty successful profile responses', () => {
    expect(shouldRetryProfile(3, new Error('Profile not found'))).toBe(true);
    expect(shouldRetryProfile(4, new Error('Profile not found'))).toBe(false);
  });
});
