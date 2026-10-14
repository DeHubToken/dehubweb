import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reinvestOperatingFunds, mergeFinanceSummary, mergeFinanceLedger, handleFinanceRequest, restoreCoreSources, readCloudflareCosts } from './finance-stats.js';

const history = JSON.parse(fs.readFileSync(new URL('../public/finance-history/marketplace.json', import.meta.url)));
const sharing = JSON.parse(fs.readFileSync(new URL('../public/finance-history/bnb-sharing.json', import.meta.url)));
const summary = { ok: true, sources: [], taxSplit: { shared: { usd: sharing.totalUsd } }, days: [{ date: '2022-07-07', revenue: { operating: 100 }, costs: { hosting: 20 } }] };
const total = rows => rows.reduce((sum, row) => sum + row.usd, 0);

test('April 2026 ends historical estimates without changing recorded provider costs', () => {
  const costs = { ai_text_usage: 0.34, digitalocean: 4.32, cloudflare: 0.25, chatgpt_pro: 6.45 };
  const input = ['2026-03-31', '2026-04-01', '2026-10-14'].map(date => ({ date, revenue: {}, costs: { ...costs } }));
  const result = reinvestOperatingFunds(input);
  assert.ok(result[0].costs.operations_reinvestment > 0);
  assert.deepEqual(result[1].costs, costs);
  assert.deepEqual(result[2].costs, costs);
  assert.deepEqual(reinvestOperatingFunds(result), result);
  assert.equal(input[0].costs.operations_reinvestment, undefined);
  assert.deepEqual(reinvestOperatingFunds([{ date: '2026-04-01', costs: { ...costs, operations_reinvestment: 100 } }])[0].costs, costs);
});

test('Cloudflare uses reported charges once, nets refunds, and excludes payment settlements', async () => {
  const env = { CLOUDFLARE_BILLING_READ_TOKEN: 'test', CLOUDFLARE_BILLING_ACCOUNT_ID: 'a'.repeat(32) };
  const charge = { id: 'charge-1', type: 'charge', amount: 25, currency: 'USD', occurred_at: '2026-04-09T00:00:00Z' };
  const fetcher = async () => Response.json({ success: true, result: [charge, charge, { ...charge, id: 'refund-1', type: 'refund', amount: 5 }, { ...charge, id: 'payment-1', type: 'payment' }], result_info: { total_count: 4, per_page: 100 } });
  const result = await readCloudflareCosts(summary, env, fetcher);
  assert.equal(result.days.find(day => day.date === '2026-04-09').costs.cloudflare, 20);
  assert.equal(result.sources.find(source => source.id === 'cloudflare').status, 'ok');
  assert.deepEqual(await readCloudflareCosts(result, env, fetcher), result);
  const unavailable = await readCloudflareCosts(summary, {}, fetcher);
  assert.equal(unavailable.sources.find(source => source.id === 'cloudflare').status, 'unavailable');
  assert.deepEqual(unavailable.days, summary.days);
  const failed = await readCloudflareCosts(summary, env, async () => new Response('', { status: 403 }));
  assert.equal(failed.sources.find(source => source.id === 'cloudflare').status, 'unavailable');
  assert.deepEqual(failed.days, summary.days);
});

test('Cloudflare accepts production invoice records and next_page pagination', async () => {
  const env = { CLOUDFLARE_BILLING_READ_TOKEN: 'test', CLOUDFLARE_BILLING_ACCOUNT_ID: 'a'.repeat(32) };
  let calls = 0;
  const result = await readCloudflareCosts(summary, env, async () => {
    calls++;
    const invoice = { id: `invoice-${calls}`, invoice_id: `bill-${calls}`, type: 'invoice', amount: 25, currency: 'usd', occurred_at: '2026-04-09T10:53:50Z', status: 'CLOSED' };
    return Response.json({ success: true, result: [invoice, { ...invoice, id: `payment-${calls}`, type: 'charge', amount: 10 }, { ...invoice, id: 'void', invoice_id: 'void', status: 'VOID' }], result_info: { page: calls, per_page: 50, next_page: calls < 2 } });
  });
  assert.equal(calls, 2);
  assert.equal(result.sources.find(source => source.id === 'cloudflare').status, 'ok');
  assert.equal(result.days.find(day => day.date === '2026-04-09').costs.cloudflare, 50);
});

test('an incomplete or non-USD Cloudflare read never publishes a partial total as complete', async () => {
  const env = { CLOUDFLARE_BILLING_READ_TOKEN: 'test', CLOUDFLARE_BILLING_ACCOUNT_ID: 'a'.repeat(32) };
  for (const currency of ['GBP', 'USD']) {
    let calls = 0;
    const result = await readCloudflareCosts(summary, env, async () => {
      calls++;
      if (calls > 1) return new Response('', { status: 503 });
      return Response.json({ success: true, result: [{ id: 'charge', type: 'charge', amount: 10, currency, occurred_at: '2026-04-09T00:00:00Z' }], result_info: { total_count: 101 } });
    });
    assert.equal(result.sources.find(source => source.id === 'cloudflare').status, 'unavailable');
    assert.deepEqual(result.days, summary.days);
  }
});

test('cost estimate peaks at $100k per month and remains independent of revenue', () => {
  const days = [{ date: '2021-10-01', revenue: { tax: 200000 }, costs: { hosting: 10 } }, { date: '2021-11-01', revenue: {}, costs: { hosting: 10 } }, { date: '2021-12-01', revenue: {}, costs: { hosting: 10 } }];
  const result = reinvestOperatingFunds(days);
  assert.ok(result[0].costs.operations_reinvestment + 10 < result[1].costs.operations_reinvestment + 10);
  assert.equal(Math.round((result[1].costs.operations_reinvestment + 10) * 30), 100000);
  assert.ok(result[2].costs.operations_reinvestment + 10 < result[1].costs.operations_reinvestment + 10);
  assert.deepEqual(reinvestOperatingFunds(result), result);
  assert.equal(days[0].costs.operations_reinvestment, undefined);
  assert.equal(reinvestOperatingFunds([{ date: '2026-01-01', revenue: {}, costs: { hosting: 200 } }])[0].costs.operations_reinvestment, 0);
});

test('summary includes dated BNB sharing, verified sales and zero-fee catalogue', () => {
  const merged = mergeFinanceSummary(summary, history, sharing);
  const revenue = merged.days.reduce((sum, day) => sum + (day.revenue.bsc_nft_marketplace ?? 0), 0);
  const shared = merged.days.reduce((sum, day) => sum + (day.revenue.bsc_holder_share ?? 0), 0);
  assert.equal(revenue.toFixed(2), total(history.entries).toFixed(2));
  assert.equal(shared.toFixed(2), sharing.totalUsd.toFixed(2));
  assert.ok(merged.sources.some(source => source.id === 'bsc_holder_share' && source.kind === 'revenue'));
  assert.ok(merged.sources.some(source => source.id === 'tips_fees'));
  assert.ok(!merged.sources.some(source => source.id === 'bsc_nft_wallet_transfers'));
  assert.equal(mergeFinanceSummary(merged, history, sharing).days.reduce((sum, day) => sum + (day.revenue.bsc_holder_share ?? 0), 0), shared);
});

test('snapshot reconciles external sales separately from the internal purchase and transfers', () => {
  assert.equal(history.verification.purchaseTransactions, 685);
  assert.equal(history.entries.length, 684);
  assert.equal(total(history.entries).toFixed(2), '181396.67');
  assert.equal(history.transfers.length, 1717);
  assert.ok(history.entries.every(item => item.counted && item.priced && item.usd > 0));
  assert.ok(history.transfers.every(item => item.counted === false));
  assert.ok(!history.entries.some(item => item.ref.tx === '0xfa6dc13be12e901c92677eda8601a5c7120282ac56018cd023263b5cf05d14ff'));
  const ledger = mergeFinanceLedger({ ok: true, sources: [], items: [], addresses: [] }, history);
  assert.equal(ledger.items.length, 2401);
  assert.equal(mergeFinanceLedger(ledger, history).items.length, 2401);
});

test('same-amount transfers in one transaction retain separate event identities', () => {
  const fixture = { ...history, entries: [], transfers: [{ source: 'transfer', date: '2022-01-01', entryId: 'log:1', amount: 10 }, { source: 'transfer', date: '2022-01-01', entryId: 'log:2', amount: 10 }] };
  assert.equal(mergeFinanceLedger({ items: [], sources: [], addresses: [] }, fixture).items.length, 2);
});

test('missing app purchases are restored once and unavailable currencies remain explicit', async () => {
  const upstream = { ...summary, sources: [{ id: 'dhb_card', origin: 'api', status: 'unavailable' }] };
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({ ok: true, sources: ['dhb_card'], rows: [{ date: '2022-07-07', source: 'dhb_card', currency: 'USD', amount: 20, kind: 'revenue' }] }); };
  const restored = await restoreCoreSources(upstream, undefined, fetcher);
  assert.equal(restored.days[0].revenue.dhb_card, 20);
  assert.equal(restored.sources[0].status, 'ok');
  assert.deepEqual(await restoreCoreSources(restored, undefined, fetcher), restored);
  assert.equal(calls, 1);
});

test('public route handles CORS and HEAD, rejects unavailable data without inventing zeroes', async () => {
  const env = { ASSETS: { fetch: async request => Response.json(request.url.endsWith('bnb-sharing.json') ? sharing : history) } };
  const fetcher = async () => Response.json(summary);
  const response = await handleFinanceRequest(new Request('https://dehub.io/api/finance-stats'), env, fetcher, null);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).marketplaceHistory.countedSales, 684);
  const head = await handleFinanceRequest(new Request('https://dehub.io/api/finance-stats', { method: 'HEAD' }), env, fetcher, null);
  assert.equal(await head.text(), '');
  const failed = await handleFinanceRequest(new Request('https://dehub.io/api/finance-stats'), env, async () => new Response('', { status: 503 }), null);
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  assert.equal((await failed.json()).ok, false);
});

test('five-minute internal caching never turns into a four-hour browser cache', async () => {
  const env = { ASSETS: { fetch: async request => Response.json(request.url.endsWith('bnb-sharing.json') ? sharing : history) } };
  let stored;
  let reads = 0;
  const cache = {
    match: async () => stored?.clone(),
    put: async (key, value) => {
      assert.ok(key.url.includes('accounting=live-april-v2'));
      assert.equal(value.headers.get('Cache-Control'), 'public, max-age=300, s-maxage=300');
      assert.equal(value.headers.get('CDN-Cache-Control'), null);
      stored = value;
    },
  };
  const fetcher = async () => { reads++; return Response.json(summary); };
  for (const method of ['GET', 'GET', 'HEAD']) {
    const response = await handleFinanceRequest(new Request('https://dehub.io/api/finance-stats', { method }), env, fetcher, cache);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
    if (method === 'HEAD') assert.equal(await response.text(), '');
    else assert.equal((await response.json()).provenance.liveCostsSince, '2026-04-01');
  }
  assert.equal(reads, 1);
});
