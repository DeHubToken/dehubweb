import { describe, expect, it } from 'vitest';
import { isStoreAppRequest } from '../../supabase/functions/_shared/client-surface';

const req = (headers: Record<string, string>) => new Request('https://example.supabase.co/functions/v1/generate-image', { method: 'POST', headers });

describe('Venice models stay off the store apps', () => {
  it('treats native requests (no Origin) and the app header as the store app', () => {
    expect(isStoreAppRequest(req({ 'x-dehub-token': 't' }))).toBe(true);
    expect(isStoreAppRequest(req({ origin: 'null' }))).toBe(true);
    expect(isStoreAppRequest(req({ origin: 'https://riftn.com', 'x-dehub-client': 'app' }))).toBe(true);
    expect(isStoreAppRequest(req({ origin: 'https://riftn.com', 'x-dehub-client': 'Android' }))).toBe(true);
  });
  it('lets browser requests from the website through', () => {
    for (const origin of ['https://riftn.com', 'https://dehub.io', 'https://staging.dehub.io', 'http://localhost:8080']) {
      expect(isStoreAppRequest(req({ origin }))).toBe(false);
    }
  });
});
