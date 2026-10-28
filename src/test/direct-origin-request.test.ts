// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { canonicalOriginRequest } from '../../CLOUDFLARE_WORKER_SEO.js';
import { handleAccountMcp } from '../../server/account-mcp.js';

describe('direct origin URL semantics', () => {
  it('preserves the canonical path, query and request headers', () => {
    const req = new Request('https://origin.dehub.io/app/post/42?q=1', { headers: { 'X-DeHub-Public-Host': 'dehub.io', Accept: 'text/html' } });
    const mapped = canonicalOriginRequest(req);
    expect(mapped.url).toBe('https://dehub.io/app/post/42?q=1');
    expect(mapped.headers.get('Accept')).toBe('text/html');
  });
  it('preserves mutation bodies without replaying a network request', async () => {
    const req = new Request('https://origin.dehub.io/_api/api/example', { method: 'POST', headers: { 'X-DeHub-Public-Host': 'dehub.io' }, body: 'payload' });
    const mapped = canonicalOriginRequest(req);
    expect(mapped.method).toBe('POST');
    expect(await mapped.text()).toBe('payload');
  });
  it('does not canonicalize ordinary mirrors or unmarked origin requests', () => {
    for (const host of ['staging.dehub.io', 'dehub.io', 'example.com']) {
      const req = new Request(`https://${host}/app`, { headers: { 'X-DeHub-Public-Host': 'dehub.io' } });
      expect(canonicalOriginRequest(req)).toBe(req);
    }
    const req = new Request('https://origin.dehub.io/app');
    expect(canonicalOriginRequest(req)).toBe(req);
  });
  it('serves the account MCP for public dehub.io requests forwarded through the gateway', async () => {
    const req = new Request('https://origin.dehub.io/.well-known/oauth-protected-resource/mcp', { headers: { 'X-DeHub-Public-Host': 'dehub.io' } });
    const res = await handleAccountMcp(canonicalOriginRequest(req), {});
    expect(res.status).toBe(200);
    expect((await res.json()).resource).toBe('https://dehub.io/mcp');
  });
});
