import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

// Reviewed public copy only. Reuse the deployed translation cache and its
// direct-provider-first routing. Results are reviewable artifacts, never commits.
const request = JSON.parse(readFileSync(process.env.TRANSLATION_REQUEST || 'scripts/priority-translation-request.json', 'utf8'));
const client = readFileSync('src/integrations/supabase/client.ts', 'utf8');
const key = client.match(/(?:SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY)\s*=\s*["']([^"']+)["']/)?.[1] || client.match(/["'](eyJ[A-Za-z0-9._-]+)["']/)?.[1];
if (!key) throw new Error('Public translation client key is unavailable');
const endpoint = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/translate-text';
const languages = ['ar', 'es', 'fr', 'nl', 'tr'];
const tokenPattern = /\{\{[^}]+\}\}|\{[a-zA-Z_][\w.]*\}|https?:\/\/[^\s<>"\)]+|<\/?[a-zA-Z][^>]*>|\[TEAM_SECTION_[^\]]+\]|\r?\n/g;
const protect = source => {
  const tokens = [];
  const masked = source.replace(tokenPattern, value => { tokens.push(value); return `@@${tokens.length - 1}@@`; });
  return { masked, tokens };
};
const restore = (value, tokens) => {
  if (typeof value !== 'string') return null;
  for (let i = 0; i < tokens.length; i++) {
    const marker = new RegExp(`(?:@[ \\t\\u00a0]?){1,3}${i}(?:[ \\t\\u00a0]?@){1,3}`, 'g');
    if (!marker.test(value)) return null;
    value = value.replace(marker, () => tokens[i]);
  }
  return /@@\d+@@/.test(value) ? null : value.trim();
};
let calls = 0;
async function translate(text, lang) {
  if (++calls > 2500) throw new Error('Translation request budget exhausted');
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ text, targetLang: lang, sourceLang: 'en', public: true, purpose: 'i18n' }),
  });
  if (!response.ok) throw new Error(`Translation service returned HTTP ${response.status}`);
  const data = await response.json();
  if (typeof data.translatedText !== 'string') throw new Error('Translation response is missing text');
  return data.translatedText;
}
mkdirSync('translation-output', { recursive: true });
let failures = 0;
for (const [lang, entries] of Object.entries(request)) {
  if (process.env.TRANSLATION_LOCALE && process.env.TRANSLATION_LOCALE !== lang) continue;
  if (!languages.includes(lang)) throw new Error(`Unsupported priority locale: ${lang}`);
  const file = `translation-output/${lang}.json`;
  const output = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const missing = Object.keys(entries).filter(source => !output[source]);
  const batches = [];
  let batch = [], size = 0;
  for (const source of missing) {
    if (batch.length && (size + source.length > 6000 || batch.length >= 30)) {
      batches.push(batch); batch = []; size = 0;
    }
    batch.push(source); size += source.length;
  }
  if (batch.length) batches.push(batch);
  console.log(`${lang}: ${missing.length} unique strings in ${batches.length} batches`);
  const failed = [];
  for (let index = 0; index < batches.length; index++) {
    const sources = batches[index];
    const prepared = sources.map(protect);
    const result = await translate(prepared.map(item => item.masked).join('\n'), lang);
    const lines = result.split('\n');
    for (let i = 0; i < sources.length; i++) {
      let target = lines.length === sources.length ? restore(lines[i], prepared[i].tokens) : null;
      if (!target) target = restore(await translate(prepared[i].masked, lang), prepared[i].tokens);
      const echoedProse = target === sources[i].trim() && /\b(?:the|your|with|this|that|you|from|will|please)\b/i.test(target);
      if (target && !echoedProse) {
        const leading = sources[i].match(/^\s*/)[0], trailing = sources[i].match(/\s*$/)[0];
        output[sources[i]] = leading + target + trailing;
      } else { failures++; failed.push(sources[i]); }
    }
    writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`);
    writeFileSync(`translation-output/${lang}-failed.json`, `${JSON.stringify(failed, null, 2)}\n`);
    console.log(`${lang}: batch ${index + 1}/${batches.length}; ${Object.keys(output).length} saved; ${failed.length} rejected`);
  }
}
if (failures) throw new Error(`${failures} strings require review; successful results are saved.`);
