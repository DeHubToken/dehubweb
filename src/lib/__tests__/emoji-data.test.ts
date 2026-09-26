import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEHUB_PICKS, loadEmojiData, searchEmoji, withTone, type EmojiKeywords } from '@/lib/emoji';

function keywords(version: string, file: string): EmojiKeywords {
  const rows: string[] = JSON.parse(
    readFileSync(resolve(__dirname, `../../../public/emoji-data/${version}/names/${file}.json`), 'utf8'),
  );
  return {
    labels: rows.map((r) => r.slice(0, r.indexOf('|'))),
    search: rows.map((r) => ` ${r.slice(r.indexOf('|') + 1)}`),
  };
}

describe('emoji dataset', () => {
  it('covers the full Unicode set and every DeHub pick', async () => {
    const data = await loadEmojiData();
    expect(data.entries.length).toBeGreaterThan(1800);
    for (const pick of DEHUB_PICKS) expect(data.byChar.get(pick)).toBeTruthy();
  });

  it('ships an index-aligned keyword file for every locale it maps', async () => {
    const data = await loadEmojiData();
    const dir = resolve(__dirname, `../../../public/emoji-data/${data.version}/names`);
    const files = new Set(readdirSync(dir).map((f) => f.replace('.json', '')));
    for (const file of new Set(Object.values(data.locales))) {
      expect(files.has(file)).toBe(true);
      expect(keywords(data.version, file).labels.length).toBe(data.entries.length);
    }
  });

  it('finds emoji by keyword, shortcode and DeHub slang', async () => {
    const data = await loadEmojiData();
    const en = keywords(data.version, 'en');
    const first = (q: string) => searchEmoji(q, data.entries, [en])[0]?.char;
    expect(first('fire')).toBe('🔥');
    expect(first(':rocket:')).toBe('🚀');
    expect(searchEmoji('gun', data.entries, [en]).map((e) => e.char)).toContain('🔫');
    expect(searchEmoji('hodl', data.entries, [en]).map((e) => e.char)).toContain('💎');
  });

  it('applies skin tones only where the emoji takes one', async () => {
    const data = await loadEmojiData();
    expect(withTone(data.byChar.get('👍')!, 3, 1000)).toBe('👍🏽');
    expect(withTone(data.byChar.get('🔥')!, 3, 1000)).toBe('🔥');
  });
});
