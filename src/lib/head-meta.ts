/**
 * Imperative <head> writers.
 *
 * react-helmet-async (v3) renders nothing in this app, so anything that must
 * actually reach the DOM — title, canonical, description, og:/twitter: tags,
 * robots and JSON-LD — is written directly. SEOHead and DocsSEO both route
 * their writes through here so the two never fight over tag ownership.
 */

const CANONICAL_HOSTS = ['dehub.io', 'localhost', '127.0.0.1'];

export function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function upsertCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

/** Standard og:/twitter: set shared by every page. */
export function upsertSocialMeta(opts: {
  title: string;
  description: string;
  url: string;
  image: string;
  type: string;
}): void {
  upsertMeta('property', 'og:type', opts.type);
  upsertMeta('property', 'og:title', opts.title);
  upsertMeta('property', 'og:description', opts.description);
  upsertMeta('property', 'og:image', opts.image);
  upsertMeta('property', 'og:url', opts.url);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', opts.title);
  upsertMeta('name', 'twitter:description', opts.description);
  upsertMeta('name', 'twitter:image', opts.image);
}

/**
 * Robots control. `noindex: true` marks the page; `false` restores the
 * host-appropriate default — which must stay `noindex` on preview mirror
 * hosts, matching the inline script in index.html. Restoring is
 * required because cached pages share one <head>: navigating from a noindexed
 * page to an indexable one must not leave the noindex behind.
 *
 * `aiDirectives`, when given, is appended to the same tag — `noai, noimageai`
 * (a creator's page whose owner denied AI training) or nothing extra (they
 * allowed it). These are the de-facto directives some AI crawlers already
 * honour; they say nothing about ordinary search indexing, which is what the
 * rest of this content decides.
 */
export function setRobots(noindex: boolean, aiDirectives?: string): void {
  const isCanonicalHost = CANONICAL_HOSTS.includes(window.location.hostname);
  const base = noindex || !isCanonicalHost ? 'noindex, nofollow' : 'index, follow';
  const content = aiDirectives ? `${base}, ${aiDirectives}` : base;
  upsertMeta('name', 'robots', content);
}

/**
 * TDMRep's `tdm-reservation` signal: '1' when the creator has reserved their
 * content out of text-and-data-mining (i.e. denied AI training), '0' when
 * they opened it up. Omitted entirely — not written as neutral — when the
 * page has no single creator to ask (nothing here means nothing to honour).
 */
export function setTdmReservation(value: '0' | '1' | null): void {
  if (value === null) {
    document.head.querySelector('meta[name="tdm-reservation"]')?.remove();
    return;
  }
  upsertMeta('name', 'tdm-reservation', value);
}

const JSONLD_ID = 'seo-jsonld';

/** One page-owned JSON-LD block, replaced on navigation, removed when null.
 *  index.html's static Organization/WebSite blocks are separate and untouched. */
export function setJsonLd(json: string | null): void {
  let script = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
  if (json) {
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = JSONLD_ID;
      document.head.appendChild(script);
    }
    script.textContent = json;
  } else if (script) {
    script.remove();
  }
}
