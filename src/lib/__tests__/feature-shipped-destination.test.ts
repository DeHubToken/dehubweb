import { describe, expect, it } from 'vitest';
import { getShippedFeatureDestination } from '@/lib/feature-shipped-destination';

describe('getShippedFeatureDestination', () => {
  it('prefers a configured internal destination', () => {
    expect(getShippedFeatureDestination({
      id: 'request-1',
      title: 'Notification improvements',
      shipped_url: '/app/notifications?tab=features',
    })).toBe('/app/notifications?tab=features');
  });

  it('rejects protocol-relative destinations', () => {
    expect(getShippedFeatureDestination({
      id: 'request-2',
      title: 'Notification improvements',
      shipped_url: '//example.com/unsafe',
    })).toBe('/app/notifications');
  });

  it('routes notification requests to notifications', () => {
    expect(getShippedFeatureDestination({
      id: 'request-3',
      title: 'Clarity in notification panel',
    })).toBe('/app/notifications');
  });

  it('routes earnings requests to the command centre', () => {
    expect(getShippedFeatureDestination({
      id: 'request-4',
      title: 'Earnings comparison dashboard - DeHub vs competitors',
    })).toBe('/app/command-centre');
  });

  it('routes endpoint requests to the API documentation before tip matching', () => {
    expect(getShippedFeatureDestination({
      id: 'request-5',
      title: 'Endpoint for tipping comments and replies',
    })).toBe('/docs/endpoints');
  });

  it('falls back to the exact shipped request', () => {
    expect(getShippedFeatureDestination({
      id: 'request with spaces',
      title: 'Something entirely new',
    })).toBe('/app/features?tab=shipped&feature=request%20with%20spaces');
  });
});
