import { describe, expect, it } from 'vitest';
import { localizePublicChrome, localizePageJsonLd } from '../../server/public-page-locales.js';

describe('public page language consistency', () => {
  const page = { title: 'Guía de DeHub', h1: 'Una guía', description: 'Descripción traducida', body: '<h2>¿Cómo funciona?</h2><p>Así funciona.</p>' };
  it('updates nested article identifiers without changing publisher identity', () => {
    const localized = localizePageJsonLd({ '@graph': [{ '@type': 'Article', headline: 'A guide', description: 'English', mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://dehub.io/guides/example' }, publisher: { '@type': 'Organization', name: 'DeHub', url: 'https://dehub.io' } }] }, '/guides/example', 'es', page);
    expect(localized['@graph'][0]).toMatchObject({ headline: 'Una guía', description: 'Descripción traducida', inLanguage: 'es', mainEntityOfPage: { '@id': 'https://dehub.io/guides/example?hl=es' }, publisher: { name: 'DeHub', url: 'https://dehub.io' } });
  });
  it('takes FAQ answers from the translated visible content', () => {
    const localized = localizePageJsonLd({ '@type': 'FAQPage', mainEntity: [{ name: 'English question' }] }, '/docs/faq', 'es', page);
    expect(localized.mainEntity[0]).toMatchObject({ name: '¿Cómo funciona?', acceptedAnswer: { text: 'Así funciona.' } });
  });
  it('preserves app escape parameters and localizes only site-owned link labels', () => {
    const table = { '/docs': { en: { title: 'Docs', h1: 'Docs' }, es: { title: 'Documentación', h1: 'Documentación' } } };
    const html = '<a href="https://dehub.io/docs?app=1">Docs</a><p>A creator post remains unchanged.</p>';
    const localized = localizePublicChrome(html, '/', 'es', table);
    expect(localized).toContain('https://dehub.io/docs?app=1&amp;hl=es');
    expect(localized).toContain('Documentación');
    expect(localized).toContain('A creator post remains unchanged.');
  });
});
