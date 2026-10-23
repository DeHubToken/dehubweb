import { assert, assertEquals } from 'jsr:@std/assert@1';
import { blockedReason, controlledAction, settingsSchema } from './controls.ts';
import { freshStory, parseNews } from './news.ts';

Deno.test('news drops stale, undated, future and off-publisher stories', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  const item = (date: string, url = 'https://www.bbc.com/news/articles/example') => `<item><title><![CDATA[A report &amp; reaction]]></title><description>Details</description><link>${url}</link><pubDate>${date}</pubDate></item>`;
  const stories = parseNews(`<rss>${item('2026-10-23T11:00:00Z')}${item('2026-10-20T11:00:00Z')}${item('2026-10-25T11:00:00Z')}${item('bad')}${item('2026-10-23T11:00:00Z', 'https://evil.example/x')}</rss>`, now);
  assertEquals(stories.length, 1);
  assertEquals(stories[0].title, 'A report & reaction');
  assert(!freshStory(stories[0], now + 31 * 60000));
});

Deno.test('permissions and blocked terms reject writes regardless of approval mode', () => {
  const settings = settingsSchema.parse({ permissions: ['dehub_comment'], blocked_topics: ['giveaway'] });
  assert(blockedReason(settings, 'dehub_post_create', { content: 'Hello' }));
  assert(blockedReason(settings, 'dehub_comment', { content: 'GIVEAWAY now' }));
  assertEquals(blockedReason(settings, 'dehub_comment', { content: 'Interesting point' }), null);
});

function fixture(mode: 'draft' | 'approval' | 'autonomous') {
  const rows: Record<string, any[]> = { ai_agent_controls: [{ agent_id: 'agent', settings: { mode } }], ai_agent_receipts: [] };
  const db = { from(table: string) {
    let action = 'read', values: any, single = false; const filters: ((row: any) => boolean)[] = [];
    const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      insert: (value: any) => { action = 'insert'; values = value; return query; }, update: (value: any) => { action = 'update'; values = value; return query; },
      single: () => { single = true; return query; }, maybeSingle: () => { single = true; return query; },
      then: (resolve: any) => { let selected = rows[table].filter(row => filters.every(test => test(row)));
        if (action === 'insert') { selected = [{ ...values, id: crypto.randomUUID() }]; rows[table].push(...selected); }
        if (action === 'update') selected.forEach(row => Object.assign(row, values));
        return Promise.resolve({ data: single ? selected[0] ?? null : selected, error: null }).then(resolve); },
    }; return query;
  } }; return { db, rows };
}
Deno.test('draft and approval modes never invoke the write callback', async () => {
  for (const mode of ['draft', 'approval'] as const) {
    const { db, rows } = fixture(mode); let calls = 0;
    const result = await controlledAction(db, { id: 'agent' }, 'dehub_comment', { content: 'Hello', token_id: '1' }, async () => { calls++; return {}; });
    assertEquals(calls, 0); assertEquals(result.structuredContent.skipped, true); assertEquals(rows.ai_agent_receipts[0].status, mode);
  }
});
Deno.test('autonomous write failures leave an uncertain receipt and never retry', async () => {
  const { db, rows } = fixture('autonomous'); let calls = 0;
  try { await controlledAction(db, { id: 'agent' }, 'dehub_comment', { content: 'Hello' }, async () => { calls++; throw new Error('timeout'); }); } catch { /* Expected. */ }
  assertEquals(calls, 1); assertEquals(rows.ai_agent_receipts[0].status, 'uncertain');
});
Deno.test('approval rejects altered arguments and accepts equivalent JSON key order', async () => {
  const { db, rows } = fixture('approval'); let calls = 0;
  rows.ai_agent_receipts.push({ id: 'receipt', agent_id: 'agent', tool: 'dehub_comment', arguments: { content: 'Hello', token_id: '1' }, status: 'executing' });
  const call = async () => { calls++; return { structuredContent: { success: true } }; };
  const denied = await controlledAction(db, { id: 'agent' }, 'dehub_comment', { token_id: '2', content: 'Hello' }, call, 'receipt');
  assert(denied.isError); assertEquals(calls, 0);
  await controlledAction(db, { id: 'agent' }, 'dehub_comment', { token_id: '1', content: 'Hello' }, call, 'receipt');
  assertEquals(calls, 1); assertEquals(rows.ai_agent_receipts[0].status, 'succeeded');
});
