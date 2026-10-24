import { describe, expect, it } from 'vitest';
import { mastodonRelayHeaders, mastodonRelayTarget } from '../../server/mastodon-relay.js';

describe('Mastodon relay routes', () => {
  it('passes the client API and token endpoints through to the API', () => {
    expect(mastodonRelayTarget('/api/v1/timelines/home')).toBe('/api/mastodon/v1/timelines/home');
    expect(mastodonRelayTarget('/api/v2/search')).toBe('/api/mastodon/v2/search');
    expect(mastodonRelayTarget('/oauth/token')).toBe('/api/mastodon/oauth/token');
    expect(mastodonRelayTarget('/oauth/revoke')).toBe('/api/mastodon/oauth/revoke');
    expect(mastodonRelayTarget('/.well-known/oauth-authorization-server')).toBe('/api/mastodon/oauth/metadata');
  });

  it('leaves the approval page and the site’s own API routes alone', () => {
    expect(mastodonRelayTarget('/oauth/authorize')).toBeNull();
    expect(mastodonRelayTarget('/api/stats')).toBeNull();
    expect(mastodonRelayTarget('/api/oembed')).toBeNull();
    expect(mastodonRelayTarget('/api/v1')).toBeNull();
  });

  it('forwards the app’s token and the public path it called, and nothing else', () => {
    const request = new Request('https://dehub.io/api/v1/timelines/home?limit=20', {
      headers: { authorization: 'Bearer t', 'idempotency-key': 'k', cookie: 'secret' },
    });
    const headers = mastodonRelayHeaders(request, new URL(request.url));
    expect(headers.get('authorization')).toBe('Bearer t');
    expect(headers.get('idempotency-key')).toBe('k');
    expect(headers.get('x-mastodon-path')).toBe('/api/v1/timelines/home?limit=20');
    expect(headers.get('cookie')).toBeNull();
  });

  it('passes an upload’s length and a preview’s byte range through', () => {
    const request = new Request('https://dehub.io/api/v2/media', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '1234', range: 'bytes=0-99' },
      body: 'x'.repeat(1234),
    });
    const headers = mastodonRelayHeaders(request, new URL(request.url));
    expect(headers.get('content-type')).toBe('multipart/form-data; boundary=x');
    expect(headers.get('content-length')).toBe('1234');
    expect(headers.get('range')).toBe('bytes=0-99');
  });
});
