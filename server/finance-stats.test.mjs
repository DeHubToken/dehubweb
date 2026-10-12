import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reinvestOperatingFunds, mergeFinanceSummary, mergeFinanceLedger, handleFinanceRequest, restoreCoreSources } from './finance-stats.js';

const history = JSON.parse(fs.readFileSync(new URL('../public/finance-history/marketplace.json', import.meta.url)));
const sharing = JSON.parse(fs.readFileSync(new URL('../public/finance-history/bnb-sharing.json', import.meta.url)));
const summary = { ok: true, sources: [], taxSplit: { shared: { usd: sharing.totalUsd } }, days: [{ date: '2022-07-07', revenue: { operating: 100 }, costs: { hosting: 20 } }] };
const total = rows => rows.reduce((sum, row) => sum + row.usd, 0);

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
  assert.equal((await response.json()).marketplaceHistory.countedSales, 684);
  const head = await handleFinanceRequest(new Request('https://dehub.io/api/finance-stats', { method: 'HEAD' }), env, fetcher, null);
  assert.equal(await head.text(), '');
  const failed = await handleFinanceRequest(new Request('https://dehub.io/api/finance-stats'), env, async () => new Response('', { status: 503 }), null);
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  assert.equal((await failed.json()).ok, false);
});
