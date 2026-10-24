/**
 * /dehub-app and /stream render their copy twice: the crawler HTML in
 * CLOUDFLARE_WORKER_SEO.js reads the English straight from the page modules,
 * and the SPA reads it from en.json so every locale can translate it. Both
 * describe one page, so the English has to stay word for word the same.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEHUB_APP_PAGE } from '@/lib/dehub-app-page.js';
import { STREAM_PAGE } from '@/lib/streamer-page.js';

const EN = JSON.parse(readFileSync(resolve(__dirname, '../i18n/locales/en.json'), 'utf8'));

describe('landing page copy in en.json matches the crawler copy', () => {
  it('/dehub-app', () => {
    const c = EN.dehubAppPage;
    expect(c.seoTitle).toBe(DEHUB_APP_PAGE.title);
    expect(c.seoDescription).toBe(DEHUB_APP_PAGE.description);
    expect(c.heading).toBe(DEHUB_APP_PAGE.heading);
    expect([c.intro1, c.intro2]).toEqual(DEHUB_APP_PAGE.intro);
    DEHUB_APP_PAGE.faq.forEach(({ q, a }, i) => {
      expect(c.faq[`q${i + 1}`]).toBe(q);
      expect(c.faq[`a${i + 1}`]).toBe(a);
    });
    expect(c.faq[`q${DEHUB_APP_PAGE.faq.length + 1}`]).toBeUndefined();
  });

  it('/stream', () => {
    const c = EN.streamPage;
    expect(c.seoTitle).toBe(STREAM_PAGE.title);
    expect(c.seoDescription).toBe(STREAM_PAGE.description);
    expect(c.heading).toBe(STREAM_PAGE.heading);
    expect(c.intro).toBe(STREAM_PAGE.intro);
    expect(STREAM_PAGE.proof).toHaveLength(3);
    STREAM_PAGE.proof.forEach(({ label }, i) => expect(c.proof[`label${i + 1}`]).toBe(label));
    expect(c.proof.value3).toBe(STREAM_PAGE.proof[2].value);
    STREAM_PAGE.reasons.forEach(({ title, body }, i) => {
      expect(c.reasons[`title${i + 1}`]).toBe(title);
      expect(c.reasons[`body${i + 1}`]).toBe(body);
    });
    expect(c.reasons[`title${STREAM_PAGE.reasons.length + 1}`]).toBeUndefined();
    STREAM_PAGE.faq.forEach(({ q, a }, i) => {
      expect(c.faq[`q${i + 1}`]).toBe(q);
      expect(c.faq[`a${i + 1}`]).toBe(a);
    });
    expect(c.faq[`q${STREAM_PAGE.faq.length + 1}`]).toBeUndefined();
  });
});
