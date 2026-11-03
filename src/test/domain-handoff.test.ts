import { describe, expect, it } from 'vitest';
import { handleDomainHandoff } from '../../server/domain-handoff.js';

describe('riftn.com hand-off pages', () => {
  it('serves the outbound page only on dehub.io', () => {
    expect(handleDomainHandoff(new URL('https://dehub.io/_handoff-out?next=/mal'))?.status).toBe(200);
    expect(handleDomainHandoff(new URL('https://riftn.com/_handoff-out'))).toBeNull();
  });

  it('serves the inbound page only on riftn.com', () => {
    expect(handleDomainHandoff(new URL('https://riftn.com/_handoff'))?.status).toBe(200);
    expect(handleDomainHandoff(new URL('https://www.riftn.com/_handoff'))?.status).toBe(200);
    expect(handleDomainHandoff(new URL('https://dehub.io/_handoff'))).toBeNull();
  });

  it('leaves every other path alone', () => {
    expect(handleDomainHandoff(new URL('https://dehub.io/'))).toBeNull();
    expect(handleDomainHandoff(new URL('https://riftn.com/app'))).toBeNull();
  });

  it('is never cached or indexed and runs no outside scripts', () => {
    const res = handleDomainHandoff(new URL('https://riftn.com/_handoff'))!;
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it('shows the uplink readout and waits for it before moving on', async () => {
    for (const url of ['https://dehub.io/_handoff-out?next=/', 'https://riftn.com/_handoff']) {
      const html = await handleDomainHandoff(new URL(url))!.text();
      expect(html).toContain('RIFTN.COM');
      expect(html).toContain('prefers-reduced-motion');
      expect(html).toContain('await (window.__shown || 0)');
    }
  });
});
