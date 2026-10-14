const UPSTREAM = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/finance-stats';
const WALLET = '0x2226ab7ff45d9a241e8986163ffb0176fabf5613';
export const LIVE_COSTS_SINCE = '2026-04-01';
const CLOUDFLARE = {
  id: 'cloudflare', label: 'Cloudflare', kind: 'cost', group: 'infrastructure', origin: 'api', status: 'unavailable',
  note: 'Cloudflare billing charges in USD, recorded on their billing date. Bills can arrive after usage; unbilled usage is not estimated. Billing access is unavailable until a read-only billing token is connected.',
};
const REINVESTMENT = {
  id: 'operations_reinvestment', label: 'Estimated operations', kind: 'cost',
  group: 'operations', origin: 'estimate', status: 'ok',
  note: 'Operating costs before 1 April 2026 follow a historical estimate, peaking at $100,000 a month in November 2021. From 1 April 2026, only recorded provider costs and subscriptions are included, with no estimated operations top-up. Provider reporting can lag; unavailable bills are excluded, not zero.',
};
const BNB_SHARING = {
  id: 'bsc_holder_share', label: 'BNB sharing to holders and stakers', kind: 'revenue',
  group: 'tax', origin: 'chain', status: 'ok',
  note: 'BNB paid to holders and stakers, valued in USD on each payment date. Included in the gross historical revenue view at the requested scope; this was distributed to participants, not retained by DeHub.',
};
const COST_MONTHLY_ANCHORS = [
  ['2021-08', 12000], ['2021-09', 30000], ['2021-10', 65000], ['2021-11', 100000],
  ['2021-12', 90000], ['2022-01', 80000], ['2022-03', 65000], ['2022-06', 50000],
  ['2022-09', 38000], ['2022-12', 30000], ['2023-06', 22000], ['2023-12', 15000],
  ['2024-06', 11000], ['2024-12', 8500], ['2025-06', 6500], ['2025-12', 5000],
  ['2026-06', 4200], ['2026-10', 3800],
];
const ZERO_FEES = [
  ['tips_fees', 'Tip platform fees'], ['ppv_fees', 'Pay-per-view platform fees'], ['paid_dm_fees', 'Paid message platform fees'],
].map(([id, label]) => ({ id, label, kind: 'revenue', group: 'fees', origin: 'config', status: 'ok', note: 'The current payment policy passes this payment to the creator with no platform cut. The platform fee is zero.' }));

function sourceLabel(source) {
  return source.id === 'bsc_token_tax' ? { ...source, label: 'Historical operating revenue' } : source;
}

const monthIndex = month => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
function estimatedMonthlyCost(month) {
  const index = monthIndex(month);
  for (let i = 1; i < COST_MONTHLY_ANCHORS.length; i++) {
    const [previousMonth, previousCost] = COST_MONTHLY_ANCHORS[i - 1];
    const [nextMonth, nextCost] = COST_MONTHLY_ANCHORS[i];
    if (index <= monthIndex(nextMonth)) {
      const share = Math.max(0, (index - monthIndex(previousMonth)) / (monthIndex(nextMonth) - monthIndex(previousMonth)));
      return previousCost + (nextCost - previousCost) * share;
    }
  }
  return COST_MONTHLY_ANCHORS.at(-1)[1];
}

/** Recorded bills consume the estimated monthly operating budget. */
export function reinvestOperatingFunds(days) {
  return days.map(day => {
    if (day.date >= LIVE_COSTS_SINCE) {
      const { operations_reinvestment, ...costs } = day.costs;
      return { ...day, costs };
    }
    if (day.costs.operations_reinvestment != null) return day;
    const [year, month] = day.date.slice(0, 7).split('-').map(Number);
    const dailyBudget = estimatedMonthlyCost(day.date.slice(0, 7)) / new Date(Date.UTC(year, month, 0)).getUTCDate();
    const recorded = Object.values(day.costs).reduce((a, b) => a + b, 0);
    return { ...day, costs: { ...day.costs, operations_reinvestment: Math.max(0, dailyBudget - recorded) } };
  });
}

export function mergeFinanceSummary(upstream, history, sharing = { days: [] }) {
  const days = new Map(upstream.days.map(day => [day.date, { ...day, revenue: { ...day.revenue }, costs: { ...day.costs } }]));
  const supplied = new Set(upstream.sources.map(source => source.id));
  for (const entry of history.entries) {
    if (entry.counted === false || supplied.has(entry.source)) continue;
    const day = days.get(entry.date) ?? { date: entry.date, revenue: {}, costs: {} };
    day.revenue[entry.source] = (day.revenue[entry.source] ?? 0) + entry.usd;
    days.set(entry.date, day);
  }
  for (const entry of sharing.days) {
    const day = days.get(entry.date) ?? { date: entry.date, revenue: {}, costs: {} };
    if (day.revenue[BNB_SHARING.id] == null) day.revenue[BNB_SHARING.id] = entry.usd;
    days.set(entry.date, day);
  }
  const sources = [...upstream.sources.map(sourceLabel), ...history.sources.filter(source => !supplied.has(source.id)), ...ZERO_FEES.filter(source => !supplied.has(source.id))];
  if (!sources.some(source => source.id === BNB_SHARING.id)) sources.push(BNB_SHARING);
  if (!sources.some(source => source.id === REINVESTMENT.id)) sources.push(REINVESTMENT);
  return {
    ...upstream,
    sources,
    days: reinvestOperatingFunds([...days.values()].sort((a, b) => a.date.localeCompare(b.date))),
    notes: [...(upstream.notes ?? []), ...history.notes.filter(note => !note.startsWith('The retained operating funds')), history.valuation, REINVESTMENT.note, BNB_SHARING.note],
    marketplaceHistory: history.verification,
    provenance: { ...upstream.provenance, endpoint: 'https://dehub.io/api/finance-stats', marketplaceSnapshot: 'https://dehub.io/finance-history/marketplace.json', bnbSharingSnapshot: 'https://dehub.io/finance-history/bnb-sharing.json', expenseAllocation: REINVESTMENT.note, liveCostsSince: LIVE_COSTS_SINCE },
  };
}

export function mergeFinanceLedger(upstream, history) {
  const key = item => item.entryId ?? `${item.source}:${item.ref?.tx ?? item.date}:${item.direction ?? ''}:${item.amount ?? ''}:${item.unit ?? ''}`;
  const items = new Map(upstream.items.map(item => [key(item), item]));
  for (const item of [...history.entries, ...history.transfers]) if (!items.has(key(item))) items.set(key(item), item);
  const sources = new Map(upstream.sources.map(source => [source.id, sourceLabel(source)]));
  for (const source of [...history.sources, ...history.transferSources]) if (!sources.has(source.id)) sources.set(source.id, source);
  return {
    ...upstream,
    sources: [...sources.values()],
    items: [...items.values()].sort((a, b) => b.date.localeCompare(a.date) || (b.block ?? 0) - (a.block ?? 0)),
    addresses: [...upstream.addresses, { label: 'NFT marketplace shop wallet', address: WALLET, chains: ['bsc'] }],
    notes: [...(upstream.notes ?? []), ...history.notes, history.valuation, 'Wallet transfers are visible for reconciliation and excluded from revenue totals.'],
  };
}

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Cache-Control': 'public, max-age=60, s-maxage=300' };

/** Read missing core sources directly while the managed endpoint is unavailable. */
export async function restoreCoreSources(upstream, view, fetcher) {
  const missing = new Map(upstream.sources.filter(source => source.status === 'unavailable' && (source.origin === 'api' || ['dhb_card', 'dhb_crypto', 'post_quota', 'youtube_imports', 'sms_credits', 'creator_sub_fees', 'stripe_fees'].includes(source.id))).map(source => [source.id, source]));
  if (!missing.size) return upstream;
  try {
    const response = await fetcher('https://api.dehub.io/api/stats/revenue', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
    if (!response.ok) return upstream;
    const core = await response.json();
    if (core.ok !== true || !Array.isArray(core.rows) || !Array.isArray(core.sources)) return upstream;
    const rates = { USD: 1, USDC: 1, USDT: 1 };
    if (core.rows.some(row => missing.has(row.source) && !rates[row.currency.toUpperCase()] && row.currency !== 'DHB')) {
      const fxResponse = await fetcher('https://api.frankfurter.app/latest?from=USD', { signal: AbortSignal.timeout(5_000) });
      if (fxResponse.ok) for (const [currency, rate] of Object.entries((await fxResponse.json()).rates ?? {})) if (typeof rate === 'number' && rate > 0) rates[currency] = 1 / rate;
    }
    const days = new Map((upstream.days ?? []).map(day => [day.date, { ...day, revenue: { ...day.revenue }, costs: { ...day.costs } }]));
    const items = [...(upstream.items ?? [])];
    const unpriced = new Set();
    for (const row of core.rows) {
      if (!missing.has(row.source)) continue;
      const unit = row.currency.toUpperCase();
      const rate = unit === 'DHB' ? upstream.dhb?.priceUsd : rates[unit];
      if (!rate || !Number.isFinite(Number(row.amount))) {
        unpriced.add(row.source);
        if (view === 'ledger' && row.kind === 'revenue' && Number.isFinite(Number(row.amount))) items.push({ date: row.date, source: row.source, usd: 0, priced: false, amount: Number(row.amount), unit, count: row.count });
        continue;
      }
      const usd = Number(row.amount) * rate;
      if (view === 'ledger') {
        if (row.kind === 'revenue') items.push({ date: row.date, source: row.source, usd, amount: Number(row.amount), unit, count: row.count });
      } else {
        const day = days.get(row.date) ?? { date: row.date, revenue: {}, costs: {} };
        const target = row.kind === 'cost' ? day.costs : day.revenue;
        target[row.source] = (target[row.source] ?? 0) + usd;
        days.set(row.date, day);
      }
    }
    return { ...upstream, ...(view === 'ledger' ? { items } : { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) }),
      sources: upstream.sources.map(source => missing.has(source.id) && core.sources.includes(source.id) && !unpriced.has(source.id) ? { ...source, status: 'ok' } : source),
      notes: [...(upstream.notes ?? []).filter(note => !note.startsWith("DeHub's core API could not be read")), 'Missing app payment sources were read directly from the public core API. Fiat conversion uses current ECB reference rates, as in the managed finance endpoint.'],
    };
  } catch { return upstream; }
}

/** Keep billing credentials on the server and publish only daily USD totals. */
export async function readCloudflareCosts(upstream, env, fetcher = fetch) {
  if (upstream.sources.some(source => source.id === CLOUDFLARE.id)) return upstream;
  const unavailable = { ...upstream, sources: [...upstream.sources, CLOUDFLARE] };
  const token = env.CLOUDFLARE_BILLING_READ_TOKEN;
  const account = env.CLOUDFLARE_BILLING_ACCOUNT_ID;
  if (!token || !/^[a-f0-9]{32}$/i.test(account ?? '')) return unavailable;
  try {
    const totals = new Map();
    const seen = new Set();
    for (let page = 1; page <= 100; page++) {
      const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/billing/history?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error('Billing unavailable');
      const body = await response.json();
      if (body.success !== true || !Array.isArray(body.result)) throw new Error('Invalid billing response');
      for (const row of body.result) {
        const date = row.occurred_at?.slice(0, 10);
        if (!date || date < LIVE_COSTS_SINCE || date > new Date().toISOString().slice(0, 10)) continue;
        // Ignore payment settlements: they settle an existing charge, not a second cost.
        if (!['charge', 'refund', 'credit'].includes(row.type)) continue;
        if (!row.id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || row.currency?.toUpperCase() !== 'USD' || typeof row.amount !== 'number' || !Number.isFinite(row.amount)) throw new Error('Unpriced billing record');
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const amount = row.type === 'charge' ? row.amount : -Math.abs(row.amount);
        totals.set(date, (totals.get(date) ?? 0) + amount);
      }
      const info = body.result_info;
      if (!info || !Number.isFinite(info.total_count)) throw new Error('Incomplete billing pagination');
      if (page * 100 >= info.total_count) break;
      if (page === 100) throw new Error('Incomplete billing history');
    }
    const days = new Map(upstream.days.map(day => [day.date, { ...day, costs: { ...day.costs } }]));
    for (const [date, amount] of totals) {
      const day = days.get(date) ?? { date, revenue: {}, costs: {} };
      day.costs.cloudflare = amount;
      days.set(date, day);
    }
    return { ...upstream, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), sources: [...upstream.sources, { ...CLOUDFLARE, status: 'ok', note: 'Cloudflare USD charges, refunds and credits on their billing date, refreshed every five minutes. Unbilled usage is excluded until Cloudflare reports a charge.' }] };
  } catch {
    return unavailable;
  }
}

export async function handleFinanceRequest(request, env, fetcher = fetch, cache = globalThis.caches?.default) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (!['GET', 'HEAD'].includes(request.method)) return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: { ...HEADERS, Allow: 'GET, HEAD, OPTIONS' } });
  const url = new URL(request.url);
  const view = url.searchParams.get('view');
  if (view && !['ledger', 'tax'].includes(view)) return Response.json({ ok: false, error: 'Unknown finance view' }, { status: 400, headers: HEADERS });
  const key = new Request(`${url.origin}/api/finance-stats${view ? `?view=${view}` : ''}`);
  const cached = await cache?.match(key);
  if (cached) return request.method === 'HEAD' ? new Response(null, cached) : cached;
  try {
    const response = await fetcher(`${UPSTREAM}${view ? `?view=${view}` : ''}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('Upstream finance response failed');
    let upstream = await response.json();
    if (upstream.ok !== true || !Array.isArray(upstream.sources) || !(view ? Array.isArray(upstream.items) : Array.isArray(upstream.days))) throw new Error('Invalid upstream finance response');
    let body = upstream;
    if (view !== 'tax') {
      upstream = await restoreCoreSources(upstream, view, fetcher);
      if (view !== 'ledger') upstream = await readCloudflareCosts(upstream, env, fetcher);
      const snapshotResponse = await env.ASSETS.fetch(new Request(new URL('/finance-history/marketplace.json', url)));
      if (!snapshotResponse.ok) throw new Error('Marketplace history is unavailable');
      const history = await snapshotResponse.json();
      if (history.ok !== true || history.wallet !== WALLET || !Array.isArray(history.entries) || !Array.isArray(history.transfers)) throw new Error('Invalid marketplace history');
      let sharing;
      if (view !== 'ledger') {
        const sharingResponse = await env.ASSETS.fetch(new Request(new URL('/finance-history/bnb-sharing.json', url)));
        if (!sharingResponse.ok) throw new Error('BNB sharing history is unavailable');
        sharing = await sharingResponse.json();
        if (sharing.ok !== true || !Array.isArray(sharing.days) || Math.abs(sharing.days.reduce((sum, day) => sum + day.usd, 0) - upstream.taxSplit.shared.usd) > 0.01) throw new Error('Invalid BNB sharing history');
      }
      body = view === 'ledger' ? mergeFinanceLedger(upstream, history) : mergeFinanceSummary(upstream, history, sharing);
    }
    const result = Response.json(body, { headers: HEADERS });
    await cache?.put(key, result.clone());
    return request.method === 'HEAD' ? new Response(null, result) : result;
  } catch {
    return Response.json({ ok: false, error: 'Finance sources could not be read' }, { status: 502, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });
  }
}
