import { describe, expect, it } from 'vitest';
import { apRelayHeaders, apRelayTarget, wantsActivityJson } from '../../server/activitypub-relay.js';

const AP = 'application/activity+json';
const isProfile = (segment: string) => !['explore', 'settings'].includes(segment);

describe('ActivityPub relay routes', () => {
  it('passes the well-known and /ap paths through to the API', () => {
    expect(apRelayTarget('/.well-known/webfinger', 'application/jrd+json', isProfile)).toBe('/api/ap/webfinger');
    expect(apRelayTarget('/.well-known/nodeinfo', '', isProfile)).toBe('/api/ap/nodeinfo-links');
    expect(apRelayTarget('/ap/users/alice/inbox', '', isProfile)).toBe('/api/ap/users/alice/inbox');
  });

  it('answers a profile or post page with its ActivityPub object only when asked for one', () => {
    expect(apRelayTarget('/alice', AP, isProfile)).toBe('/api/ap/users/alice');
    expect(apRelayTarget('/@alice', 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"', isProfile)).toBe(
      '/api/ap/users/alice',
    );
    expect(apRelayTarget('/post/42', AP, isProfile)).toBe('/api/ap/posts/42');
    expect(apRelayTarget('/alice', 'text/html', isProfile)).toBeNull();
    expect(apRelayTarget('/explore', AP, isProfile)).toBeNull();
    expect(apRelayTarget('/a/b/c', AP, isProfile)).toBeNull();
  });

  it('recognises the ActivityPub media types', () => {
    expect(wantsActivityJson('application/activity+json')).toBe(true);
    expect(wantsActivityJson('text/html,application/xhtml+xml')).toBe(false);
  });

  it('forwards the signature headers and the host and path that were signed', () => {
    const request = new Request('https://dehub.io/ap/users/alice/inbox?x=1', {
      method: 'POST',
      headers: { signature: 'keyId="k"', digest: 'SHA-256=abc', date: 'Fri, 23 Oct 2026 12:00:00 GMT', cookie: 'secret' },
    });
    const headers = apRelayHeaders(request, new URL(request.url));
    expect(headers.get('signature')).toBe('keyId="k"');
    expect(headers.get('x-ap-host')).toBe('dehub.io');
    expect(headers.get('x-ap-path')).toBe('/ap/users/alice/inbox?x=1');
    expect(headers.get('cookie')).toBeNull();
  });
});
