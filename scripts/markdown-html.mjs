const APP_URL = 'https://dehub.io';
const escHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const absolutize = (url) => {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

function inlineMd(text) {
  let s = escHtml(text);
  // Captures below come from the ALREADY-ESCAPED string — un-escape &amp;
  // before re-escaping, or URLs with query params ship as &amp;amp;.
  const unesc = (u) => u.replace(/&amp;/g, '&');
  // images first (so their alt/src aren't re-parsed as links)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    const cleanAlt = alt.split('|')[0].trim(); // "Name|avatar" convention
    return `<img src="${escHtml(absolutize(unesc(src)))}" alt="${escHtml(unesc(cleanAlt))}" loading="lazy" style="max-width:100%">`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) =>
    `<a href="${escHtml(absolutize(unesc(href)))}">${txt}</a>`);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s>])\*([^*\n]+)\*(?=[\s.,!?<]|$)/g, '$1<em>$2</em>');
  return s;
}

export function mdToHtml(md) {
  const src = String(md || '')
    .replace(/\r\n/g, '\n')
    .replace(/\[TEAM_SECTION_START\]|\[TEAM_SECTION_END\]/g, '');
  const lines = src.split('\n');
  // The page's <h1> is the post title, so the body's outermost heading level
  // becomes h2 and every deeper one keeps its distance from it. Shifting every
  // level down by one, as this used to, made the posts' `##` sections h3 —
  // 124 of 126 posts jumped h1 → h3 with no h2 at all. The docs sections use
  // `#` and render exactly as before.
  let fenced = false;
  let top = 6;
  for (const l of lines) {
    if (l.trim().startsWith('```')) fenced = !fenced;
    const m = !fenced && l.match(/^(#{1,6})\s+\S/);
    if (m) top = Math.min(top, m[1].length);
  }
  const out = [];
  let para = [];
  let list = null; // 'ul' | 'ol'
  let inFence = false;
  let fence = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineMd(para.join(' '))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('```')) {
      if (inFence) {
        out.push(`<pre><code>${escHtml(fence.join('\n'))}</code></pre>`);
        fence = [];
        inFence = false;
      } else {
        flushPara(); flushList();
        inFence = true;
      }
      continue;
    }
    if (inFence) { fence.push(raw); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const level = Math.min(Math.max(h[1].length - top + 2, 2), 6);
      out.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const want = ul ? 'ul' : 'ol';
      if (list !== want) { flushList(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inlineMd((ul || ol)[1])}</li>`);
      continue;
    }
    if (line.match(/^\s*>\s?(.*)$/)) {
      flushPara(); flushList();
      out.push(`<blockquote>${inlineMd(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('\n');
}

