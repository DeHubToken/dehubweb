import { assert, assertEquals } from 'jsr:@std/assert@1';
import { blockedReason, controlledAction, settingsSchema } from './controls.ts';
import { freshStory, parseNews, newsTopicsFor, relevantNews } from './news.ts';

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
Deno.test('news follows requested interests and unrelated comments get no source', () => {
  assertEquals(newsTopicsFor('Current news about football', ['world']), ['sport']);
  assertEquals(newsTopicsFor('Current news about music and technology', ['world']), ['technology', 'culture']);
  const stories = parseNews(`<item><title>Football stadium renovation</title><description>Stadium renovation starts</description><link>https://www.bbc.com/news/articles/example</link><pubDate>${new Date().toUTCString()}</pubDate></item>`);
  assertEquals(relevantNews(stories, 'Coffee tastes different'), undefined);
  assertEquals(relevantNews(stories, 'Football stadium work'), stories[0]);
});

function fixture(mode: 'draft' | 'approval' | 'autonomous') {
  const rows: Record<string, any[]> = { ai_agent_controls: [{ agent_id: 'agent', settings: { mode } }], ai_agent_receipts: [] };
  const db = { from(table: string) {
    let action = 'read', values: any, single = false; const filters: ((row: any) => boolean)[] = [];
    const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; }, in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
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
import { alertWebhook, moderationSchema, reversalLabel, reverseReceipt } from './workspace-actions.ts';

Deno.test('external alerts accept only fixed Discord webhook destinations', () => {
  for (const url of ['', 'https://discord.com/api/webhooks/123/abc_DEF-123']) {
    if (!alertWebhook.safeParse(url).success) throw new Error('Valid webhook rejected');
  }
  for (const url of ['http://discord.com/api/webhooks/123/token', 'https://discord.com.evil.test/api/webhooks/123/token', 'https://127.0.0.1/api/webhooks/123/token', 'https://discord.com/api/webhooks/123/token?wait=true', 'https://discord.com/api/webhooks/123/../other']) {
    if (alertWebhook.safeParse(url).success) throw new Error('Untrusted destination accepted');
  }
});

Deno.test('reversal eligibility excludes uncertain, repeated and unsupported actions', () => {
  const receipt = { tool: 'dehub_post_create', status: 'succeeded', result: { post: { token_id: 42 } } };
  if (!reversalLabel(receipt)) throw new Error('Published post missing correction');
  for (const patch of [{ status: 'uncertain' }, { rollback_status: 'executing' }, { rollback_status: 'uncertain' }, { result: { skipped: true } }, { tool: 'dehub_update_profile' }]) {
    if (reversalLabel({ ...receipt, ...patch })) throw new Error('Unsafe correction offered');
  }
});

Deno.test('moderation validates specific stream, wallet and bounded timeout', () => {
  if (!moderationSchema.seconds.safeParse(300).success || moderationSchema.seconds.safeParse(3601).success || moderationSchema.seconds.safeParse(0).success) throw new Error('Invalid timeout bounds');
  if (moderationSchema.token_id.safeParse('../admin').success || moderationSchema.target_wallet.safeParse('someone').success) throw new Error('Invalid moderation target');
});

Deno.test('corrections claim once and verify the resulting visibility', async () => {
  const originalFetch = globalThis.fetch;
  const receipt: any = { id: 'post', agent_id: 'agent', tool: 'dehub_post_create', status: 'succeeded', result: { post: { token_id: 42 } }, arguments: {}, rollback_status: null };
  const states: string[] = []; let calls = 0;
  const db: any = { from: () => {
    let patch: any; let expected: string | null | undefined;
    const query: any = { update: (value: any) => { patch = value; return query; }, eq: () => query,
      is: (_key: string, value: null) => { expected = value; return query; }, select: () => query,
      then: (resolve: any) => {
        const matches = expected === undefined || receipt.rollback_status === expected;
        if (matches) { Object.assign(receipt, patch); states.push(patch.rollback_status); }
        return Promise.resolve({ data: matches ? [{ id: receipt.id }] : [], error: null }).then(resolve);
      } };
    return query;
  } };
  try {
    globalThis.fetch = (() => { calls++; return Promise.resolve(Response.json(calls === 1 ? { result: true } : { result: { isHidden: true } })); }) as typeof fetch;
    await reverseReceipt(db, 'private', receipt);
    assertEquals(states, ['executing', 'succeeded']); assertEquals(calls, 2);
    try { await reverseReceipt(db, 'private', receipt); } catch { /* Already corrected. */ }
    assertEquals(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});
