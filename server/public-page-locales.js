const LABELS = {
  ar: ['افتح DeHub', 'الوثائق', 'المدونة', 'استكشف', 'الصفحة الرئيسية', 'مقاطع الفيديو', 'مقاطع قصيرة', 'الموسيقى', 'استكشف DeHub', 'المزيد من الوثائق', 'المزيد من مدونة DeHub', 'جميع مقالات مدونة DeHub', 'الصفحة الرئيسية لـ dehub.io', 'افتح في DeHub', 'بقلم', 'DeHub — وسائط مفتوحة المصدر يملكها المستخدمون ومقاومة للرقابة.'],
  es: ['Abrir DeHub', 'Documentación', 'Blog', 'Explorar', 'Inicio', 'Vídeos', 'Vídeos cortos', 'Música', 'Explorar DeHub', 'Más documentación', 'Más del blog de DeHub', 'Todos los artículos de DeHub', 'Inicio de dehub.io', 'Abrir en DeHub', 'Por', 'DeHub: medios de código abierto, propiedad de sus usuarios y resistentes a la censura.'],
  fr: ['Ouvrir DeHub', 'Documentation', 'Blog', 'Explorer', 'Accueil', 'Vidéos', 'Vidéos courtes', 'Musique', 'Explorer DeHub', 'Plus de documentation', 'Plus sur le blog DeHub', 'Tous les articles DeHub', 'Accueil de dehub.io', 'Ouvrir dans DeHub', 'Par', 'DeHub — des médias open source, détenus par leurs utilisateurs et résistants à la censure.'],
  nl: ['DeHub openen', 'Documentatie', 'Blog', 'Ontdekken', 'Startpagina', "Video's", "Korte video's", 'Muziek', 'DeHub ontdekken', 'Meer documentatie', 'Meer van het DeHub-blog', 'Alle DeHub-artikelen', 'Startpagina van dehub.io', 'Openen in DeHub', 'Door', 'DeHub — opensourcemedia, eigendom van gebruikers en bestand tegen censuur.'],
  tr: ["DeHub'ı aç", 'Belgeler', 'Blog', 'Keşfet', 'Ana sayfa', 'Videolar', 'Kısa videolar', 'Müzik', "DeHub'ı keşfet", 'Diğer belgeler', 'DeHub blogundan diğer yazılar', 'Tüm DeHub yazıları', 'dehub.io ana sayfası', "DeHub'da aç", 'Yazar:', 'DeHub — açık kaynaklı, kullanıcılarına ait ve sansüre dayanıklı medya.'],
};
const ENGLISH = ['Open DeHub', 'Docs', 'Blog', 'Explore', 'Home Feed', 'Video Feed', 'Shorts', 'Music', 'Explore DeHub', 'More documentation', 'More from the DeHub Blog', '← All DeHub blog posts', 'dehub.io home', 'Open in DeHub', 'By', 'DeHub — open source, user owned and censorship resistant media.'];
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const decodeHtml = value => value.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

/** Only site-owned labels and links are localized; creator posts keep their text. */
export function localizePublicChrome(html, route, lang, table) {
  const labels = LABELS[lang];
  if (!labels) return html;
  const dictionary = Object.fromEntries(ENGLISH.map((source, i) => [source, labels[i]]));
  let out = html.replace(/>([^<>]+)</g, (match, text) => {
    const trimmed = decodeHtml(text.trim());
    const translated = dictionary[trimmed];
    return translated ? `>${escapeHtml(translated)}<` : match;
  });
  out = out.replace(/(<a\b[^>]*class="[^"]*dh-cta[^"]*"[^>]*>)[^<]*(<\/a>)/g, (_, open, close) => `${open}${escapeHtml(labels[13])}${close}`);
  out = out.replace(/<em>By /g, `<em>${escapeHtml(labels[14])} `);
  out = out.replace(/(<a\b[^>]*href=")(https:\/\/dehub\.io[^"#]*)([^"]*"[^>]*>)([^<]*)(<\/a>)/g, (match, before, href, after, text, close) => {
    const url = new URL(decodeHtml(href));
    const linked = table[url.pathname]?.[lang];
    if (!linked) return match;
    const english = table[url.pathname].en;
    const label = decodeHtml(text);
    const translated = label === english.h1 ? linked.h1 : label === english.title ? linked.title : null;
    url.searchParams.set('hl', lang);
    return `${before}${escapeHtml(url.toString())}${after}${translated ? escapeHtml(translated) : text}${close}`;
  });
  return out;
}

/** Keep structured data attached to the localized document, including @graph. */
export function localizePageJsonLd(value, route, lang, page) {
  const canonical = `https://dehub.io${route}?hl=${lang}`;
      const visit = value => {
        if (Array.isArray(value)) return value.map(visit).filter(item => item !== null);
        if (!value || typeof value !== 'object') return value;
        const out = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
        const type = Array.isArray(out['@type']) ? out['@type'] : [out['@type']];
        if (type.some(item => ['Article', 'TechArticle', 'BlogPosting', 'WebPage', 'CollectionPage', 'Blog'].includes(item))) {
          out.inLanguage = lang;
          if (out.name) out.name = page.title;
          if (out.headline) out.headline = page.h1 || page.title;
          if (out.description) out.description = page.description;
          if (out.url === `https://dehub.io${route}`) out.url = canonical;
          if (out['@id'] === `https://dehub.io${route}`) out['@id'] = canonical;
          if (typeof out.mainEntityOfPage === 'string') out.mainEntityOfPage = canonical;
        }
        if (type.includes('FAQPage')) {
          const plain = text => decodeHtml(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
          const questions = [...(page.body || '').matchAll(/<h[2-6][^>]*>([^]*?)<\/h[2-6]>\s*<p[^>]*>([^]*?)<\/p>/g)]
            .map(([, question, answer]) => ({ question: plain(question), answer: plain(answer) }))
            .filter(item => /[?؟]$/.test(item.question));
          if (!questions.length) return null;
          out.inLanguage = lang;
          out.mainEntity = questions.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } }));
        }
        if (out.item === `https://dehub.io${route}`) { out.item = canonical; out.name = page.h1 || page.title; }
        return out;
      };
  return visit(value);
}

export function localizeStructuredData(html, route, lang, page) {
  return html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (match, open, source, close) => {
    try {
      const localized = localizePageJsonLd(JSON.parse(source), route, lang, page);
      return localized ? `${open}${JSON.stringify(localized).replaceAll('<', '\\u003c')}${close}` : '';
    } catch { return match; }
  });
}
