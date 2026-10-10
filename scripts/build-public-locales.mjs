import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { mdToHtml } from './markdown-html.mjs';

export const PRIORITY_LOCALES = ['ar', 'es', 'fr', 'nl', 'tr'];
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** Read the versioned crawler copy without starting the worker or making requests. */
export function collectPublicSources(root) {
  const source = fs.readFileSync(path.join(root, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
  const ast = ts.createSourceFile('worker.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = ast.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]);
  const context = { APP_URL: 'https://dehub.io', arcadeGameLd: () => ({}) };
  const value = name => {
    const declaration = declarations.find(item => item.name.getText(ast) === name);
    if (!declaration?.initializer) throw new Error(`Missing crawler source: ${name}`);
    const result = vm.runInNewContext(`(${declaration.initializer.getText(ast)})`, context, { timeout: 1000 });
    context[name] = result;
    return result;
  };
  const marketing = value('MARKETING_PAGES'), sections = value('SECTION_PAGES');
  const docs = value('DOCS_PAGES'), guides = value('GUIDE_PAGES');
  for (const name of ['HOME_INTRO_SLIDES', 'HOME_INTRO_LINKS', 'HOME_INTRO_PRESS']) value(name);
  const homeBody = value('HOME_INTRO_HTML').match(/<!--hl-body-->([\s\S]*?)<!--\/hl-body-->/)[1];
  const en = readJson(path.join(root, 'src/i18n/locales/en.json'));
  const manifest = readJson(path.join(root, 'public/blog-manifest.json'));
  const sitemap = fs.readFileSync(path.join(root, 'public/sitemap-static.xml'), 'utf8');
  const routes = [...sitemap.matchAll(/<loc>https:\/\/dehub.io([^<]*)<\/loc>/g)].map(match => match[1] || '/').filter(route => !route.includes('?'));
  const out = {};
  for (const route of routes) {
    let meta, body = '', md;
    if (route.startsWith('/guides/')) {
      const slug = route.slice(8);
      meta = guides[slug];
      if (meta) body = readJson(path.join(root, `public/guide-content/${slug}.json`)).html;
      else {
        const post = manifest.find(item => item.slug === slug);
        if (post) {
          meta = { title: post.seoTitle || post.title, description: post.seoDescription || post.excerpt, heading: post.title };
          const content = readJson(path.join(root, `public/blog-content/${slug}.json`));
          body = content.html; md = content.md;
        }
      }
    } else if (route.startsWith('/docs/') && route !== '/docs/blog') {
      const slug = route.slice(6);
      meta = docs[slug];
      if (meta) {
        body = readJson(path.join(root, `public/docs-content/${slug.replaceAll('/', '-')}.json`)).html;
        meta = { ...meta, heading: meta.title.replace(/ — DeHub( Docs)?$/, '') };
      }
    } else {
      meta = marketing[route.slice(1)] || sections[route.slice(1)];
      if (meta) body = meta.bodyHtml || '';
    }
    if (meta) out[route] = { title: meta.title, description: meta.description, h1: meta.heading || meta.title, body, ...(md ? { md } : {}), ...(meta.intro ? { lede: meta.intro } : {}) };
  }
  out['/'] = { title: en.home.seoTitle, description: en.home.seoDescription, h1: 'DeHub — Open Source, User Owned & Censorship Resistant Media', body: homeBody, lede: "dehub.io is open source, user owned and censorship resistant media. Join the future of free speech and reach." };
  out['/docs'] = { title: en.docs.seoTitle, description: en.docs.seoDescription, h1: 'DeHub Documentation', body: '<ul>' + Object.entries(docs).map(([slug, page]) => `<li><a href="https://dehub.io/docs/${slug}">${escapeHtml(page.title.replace(/ — DeHub( Docs)?$/, ''))}</a><br><small>${escapeHtml(page.description)}</small></li>`).join('') + '</ul>' };
  out['/docs/blog'] = { title: 'DeHub Blog — News, Guides & Product Updates', description: 'News, product updates and Web3 guides from DeHub — the open source, user-owned social platform.', h1: 'DeHub Blog', body: '<ul>' + manifest.map(post => `<li><a href="https://dehub.io/guides/${post.slug}">${escapeHtml(post.title)}</a><br><small>${escapeHtml(post.excerpt || '')}</small></li>`).join('') + '</ul>' };
  for (const route of routes) if (!out[route]?.body) throw new Error(`Public route has no source body: ${route}`);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export function pageSegments(page) {
  return page.md
    ? page.md.split(/(\n\s*\n)/).filter(text => text.trim() && !/^\s*```/.test(text))
    : page.body.split(/(?<=<\/(?:p|li|h[1-6]|blockquote|table|div|section)>)/i).filter(text => text.trim());
}

export function buildPublicLocales(root) {
  const sources = collectPublicSources(root);
  const dictionaries = Object.fromEntries(PRIORITY_LOCALES.map(lang => [lang, readJson(path.join(root, `scripts/public-page-translations/${lang}.json`))]));
  const version = digest({ sources, dictionaries });
  const table = {}, assets = {}, routes = {};
  for (const [route, source] of Object.entries(sources)) {
    table[route] = { en: { title: source.title, description: source.description, h1: source.h1 } };
    routes[route] = PRIORITY_LOCALES;
    for (const lang of PRIORITY_LOCALES) {
      const dictionary = dictionaries[lang];
      const translate = text => {
        if (!text || !/[A-Za-z]{2}/.test(text.replace(/<[^>]*>/g, ''))) return text;
        const translated = dictionary[text];
        if (typeof translated !== 'string' || !translated.trim()) throw new Error(`${route}:${lang} missing translation: ${text.slice(0,100)}`);
        return translated;
      };
      const md = source.md?.split(/(\n\s*\n)/).map(text => !text.trim() || /^\s*```/.test(text) ? text : translate(text)).join('');
      const body = md ? mdToHtml(md) : source.body.split(/(?<=<\/(?:p|li|h[1-6]|blockquote|table|div|section)>)/i).map(translate).join('');
      const page = { title: translate(source.title), description: translate(source.description), h1: translate(source.h1), body, ...(md ? { md } : {}), ...(source.lede ? { lede: translate(source.lede) } : {}) };
      const bodyHeading = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
      if (bodyHeading) page.h1 = bodyHeading.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
      const asset = `/locale-pages/${version}/${lang}/${route === '/' ? 'index' : route.slice(1)}.json`;
      assets[asset] = page;
      table[route][lang] = { title: page.title, description: page.description, h1: page.h1, asset };
    }
  }
  for (const lang of PRIORITY_LOCALES) {
    const metadata = {};
    for (const [route, source] of Object.entries(sources)) {
      if (!source.md || !route.startsWith('/guides/')) continue;
      const page = assets[table[route][lang].asset];
      metadata[route.slice(8)] = { title: page.h1, seoTitle: page.title, seoDescription: page.description, excerpt: page.description, bannerImageAlt: page.h1 };
    }
    assets[`/locale-pages/${version}/${lang}/blog-metadata.json`] = metadata;
  }
  return { manifest: { version, routes }, table, assets };
}

export function writePublicLocales(root, built = buildPublicLocales(root)) {
  for (const [asset, page] of Object.entries(built.assets)) {
    const destination = path.join(root, 'public', asset);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(page)}\n`);
  }
  fs.writeFileSync(path.join(root, 'src/i18n/public-locales.json'), `${JSON.stringify(built.manifest, null, 2)}\n`);
  return built;
}
