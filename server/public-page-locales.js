const LABELS = {
  ar: ['افتح Riftn', 'الوثائق', 'المدونة', 'استكشف', 'الصفحة الرئيسية', 'مقاطع الفيديو', 'مقاطع قصيرة', 'الموسيقى', 'استكشف Riftn', 'المزيد من الوثائق', 'المزيد من مدونة Riftn', 'جميع مقالات مدونة Riftn', 'الصفحة الرئيسية لـ dehub.io', 'افتح في Riftn', 'بقلم', 'Riftn — وسائط مفتوحة المصدر يملكها المستخدمون ومقاومة للرقابة.'],
  es: ['Abrir Riftn', 'Documentación', 'Blog', 'Explorar', 'Inicio', 'Vídeos', 'Vídeos cortos', 'Música', 'Explorar Riftn', 'Más documentación', 'Más del blog de Riftn', 'Todos los artículos de Riftn', 'Inicio de dehub.io', 'Abrir en Riftn', 'Por', 'Riftn: medios de código abierto, propiedad de sus usuarios y resistentes a la censura.'],
  fr: ['Ouvrir Riftn', 'Documentation', 'Blog', 'Explorer', 'Accueil', 'Vidéos', 'Vidéos courtes', 'Musique', 'Explorer Riftn', 'Plus de documentation', 'Plus sur le blog Riftn', 'Tous les articles Riftn', 'Accueil de dehub.io', 'Ouvrir dans Riftn', 'Par', 'Riftn — des médias open source, détenus par leurs utilisateurs et résistants à la censure.'],
  nl: ['Riftn openen', 'Documentatie', 'Blog', 'Ontdekken', 'Startpagina', "Video's", "Korte video's", 'Muziek', 'Riftn ontdekken', 'Meer documentatie', 'Meer van het DeHub-blog', 'Alle DeHub-artikelen', 'Startpagina van dehub.io', 'Openen in Riftn', 'Door', 'Riftn — opensourcemedia, eigendom van gebruikers en bestand tegen censuur.'],
  tr: ["Riftn'ı aç", 'Belgeler', 'Blog', 'Keşfet', 'Ana sayfa', 'Videolar', 'Kısa videolar', 'Müzik', "Riftn'ı keşfet", 'Diğer belgeler', 'Riftn blogundan diğer yazılar', 'Tüm Riftn yazıları', 'dehub.io ana sayfası', "Riftn'da aç", 'Yazar:', 'Riftn — açık kaynaklı, kullanıcılarına ait ve sansüre dayanıklı medya.'],
};
const ENGLISH = ['Open Riftn', 'Docs', 'Blog', 'Explore', 'Home Feed', 'Video Feed', 'Shorts', 'Music', 'Explore Riftn', 'More documentation', 'More from the Riftn Blog', '← All Riftn blog posts', 'dehub.io home', 'Open in Riftn', 'By', 'Riftn — open source, user owned and censorship resistant media.'];
const FEED_LABELS = {
  ar: ['أحدث مقاطع الفيديو', 'أحدث المقاطع القصيرة', 'أحدث المنشورات على Riftn', 'أحدث المقاطع الموسيقية', 'مشاهدة'],
  es: ['Últimos vídeos', 'Últimos vídeos cortos', 'Lo último en Riftn', 'Últimas pistas', 'visualizaciones'],
  fr: ['Dernières vidéos', 'Dernières vidéos courtes', 'Dernières publications sur Riftn', 'Derniers morceaux', 'vues'],
  nl: ["Nieuwste video's", "Nieuwste korte video's", 'Nieuw op Riftn', 'Nieuwste nummers', 'weergaven'],
  tr: ['Son videolar', 'Son kısa videolar', "Riftn'daki son paylaşımlar", 'Son parçalar', 'görüntüleme'],
};
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const decodeHtml = value => value.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

/** Only site-owned labels and links are localized; creator posts keep their text. */
export function localizePublicChrome(html, route, lang, table) {
  const labels = LABELS[lang];
  if (!labels) return html;
  const dictionary = Object.fromEntries(ENGLISH.map((source, i) => [source, labels[i]]));
  ['Latest videos', 'Latest shorts', 'Latest on Riftn', 'Latest tracks'].forEach((source, i) => { dictionary[source] = FEED_LABELS[lang][i]; });
  const creatorCopy = [];
  html = html.replace(/<([a-z][\w-]*)\b[^>]*\bdata-creator-copy(?:="[^"]*")?[^>]*>[\s\S]*?<\/\1>/gi, content => {
    creatorCopy.push(content); return '<!--creator-copy-' + (creatorCopy.length - 1) + '-->';
  });
  let out = html.replace(/>([^<>]+)</g, (match, text) => {
    const trimmed = decodeHtml(text.trim());
    const translated = dictionary[trimmed];
    return translated ? `>${escapeHtml(translated)}<` : match;
  });
  out = out.replace(/(<a\b[^>]*class="[^"]*dh-cta[^"]*"[^>]*>)[^<]*(<\/a>)/g, (_, open, close) => `${open}${escapeHtml(labels[13])}${close}`);
  out = out.replace(/<em>By /g, `<em>${escapeHtml(labels[14])} `);
  out = out.replace(/(<a\b[^>]*href=")(https:\/\/(?:riftn\.com|dehub\.io)[^"#]*)([^"]*"[^>]*>)([^<]*)(<\/a>)/g, (match, before, href, after, text, close) => {
    const url = new URL(decodeHtml(href));
    const linked = table[url.pathname]?.[lang];
    if (!linked) return match;
    const english = table[url.pathname].en;
    const label = decodeHtml(text);
    const translated = label === english.h1 ? linked.h1 : label === english.title ? linked.title : null;
    url.searchParams.set('hl', lang);
    return `${before}${escapeHtml(url.toString())}${after}${translated ? escapeHtml(translated) : text}${close}`;
  });
  out = out.replace(/(<span data-public-by>)[\s\S]*?(<\/span>)/g, match => match.replace('>by ', '>' + escapeHtml(labels[14]) + ' '));
  out = out.replace(/<span data-public-views="(\d+)">[^<]*<\/span>/g, (_, count) => '<span data-public-views="' + count + '">' + new Intl.NumberFormat(lang).format(Number(count)) + ' ' + FEED_LABELS[lang][4] + '</span>');
  return out.replace(/<!--creator-copy-(\d+)-->/g, (_, index) => creatorCopy[Number(index)]);
}

/** Keep structured data attached to the localized document, including @graph. */
export function localizePageJsonLd(value, route, lang, page) {
  const canonical = `https://riftn.com${route}?hl=${lang}`;
      const visit = (value, depth = 0, graphChild = false) => {
        if (Array.isArray(value)) return value.map(item => visit(item, depth, graphChild)).filter(item => item !== null);
        if (!value || typeof value !== 'object') return value;
        const out = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, depth + 1, key === '@graph')]));
        const type = Array.isArray(out['@type']) ? out['@type'] : [out['@type']];
        const base = 'https://riftn.com' + route;
        const ownsDocument = out.url === base || out['@id'] === base || out.mainEntityOfPage === base || out.mainEntityOfPage?.['@id'] === canonical || ((!out.url && !out['@id']) && (depth === 0 || graphChild));
        if (ownsDocument && type.some(item => ['Article', 'TechArticle', 'BlogPosting', 'WebPage', 'CollectionPage', 'Blog', 'WebApplication', 'SoftwareApplication', 'MusicPlaylist', 'DefinedTermSet', 'Table', 'VideoGame'].includes(item))) {
          out.inLanguage = lang;
          if (out.name) out.name = page.title;
          if (out.headline) out.headline = page.h1 || page.title;
          if (out.description) out.description = page.description;
          if (out.url === `https://riftn.com${route}`) out.url = canonical;
          if (out['@id'] === `https://riftn.com${route}`) out['@id'] = canonical;
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
        if (out.item === `https://riftn.com${route}`) { out.item = canonical; out.name = page.h1 || page.title; }
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
