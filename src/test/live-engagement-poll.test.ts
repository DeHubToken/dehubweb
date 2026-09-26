import { describe, expect, it } from 'vitest';

import { LIVE_ENGAGEMENT_POLL_MS } from '@/hooks/use-unified-feed';

describe('live engagement polling', () => {
  it('refreshes visible post views and reactions every forty-five seconds', () => {
    expect(LIVE_ENGAGEMENT_POLL_MS).toBe(45_000);
  });
});
