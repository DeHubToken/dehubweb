// finance-stats — the revenue and costs half of dehub.io/stats.
//
// Public and unauthenticated, like /api/stats/users: every figure is a daily
// total, nothing identifies a buyer. The page reads one endpoint, so this
// function is the single place money is added up.
//
// Three kinds of source feed it:
//   - rows in this database (AI generations, ads, credits, voice clones, live
//     dubbing, work-marketplace fees, provider usage),
//   - the core API's /api/stats/revenue for what lives in its database (DHB
//     bought in the app, creator-subscription fees, post quota, YouTube
//     imports, SMS credits, card processing fees),
//   - bills: DigitalOcean's own invoices, Stripe's paid plan invoices, and the
//     fixed subscriptions in _shared/finance-costs.json,
//   - history no API can serve: _shared/finance-history.json, the BNB the
//     original BSC token's tax paid to the operations wallets in 2021–23,
//     traced transaction by transaction and valued on the day it arrived.
//
// Each source reports whether it was read. One failing takes its own line off
// the page and says so; it never zeroes the others, and nothing is estimated
// to cover the gap.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { createStripeClient } from '../_shared/stripe.ts';
import { DHB_USD_PEG } from '../_shared/ai-pricing.ts';
import costConfig from '../_shared/finance-costs.json' with { type: 'json' };
import history from '../_shared/finance-history.json' with { type: 'json' };
import {
  buildSeries,
  dayKey,
  freeJobProviderCostUsd,
  jobProviderCostUsd,
  proofChain,
  sortLedger,
  spreadFixedCost,
  spreadMonthAmount,
  usageCostUsd,
  type FinanceKind,
  type FixedCostItem,
  type LedgerEntry,
  type LedgerItem,
  type UsageRow,
} from './ledger.ts';
import { CATALOGUE, type SourceMeta, type Status } from './sources.ts';

const CACHE_TTL_MS = 5 * 60_000;
const PAGE = 1000;
const MAX_ROWS = 200_000;
const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const API_BASE = (Deno.env.get('DEHUB_API_BASE') || 'https://api.dehub.io').replace(/\/$/, '');
/** Where in-app DHB payments land — the same default the payment verifiers use. */
const TREASURY = (Deno.env.get('AI_TREASURY_ADDRESS') || '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c').toLowerCase();

const fixedItems = (costConfig.items as FixedCostItem[]).filter(
  (item) => item.id && item.since && Number.isFinite(item.usdMonthly),
);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

let _db: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_db) {
    _db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
  }
  return _db;
}

/** The filters the readers below use, without supabase-js's full builder generics. */
interface FilterQuery {
  eq(column: string, value: unknown): FilterQuery;
  neq(column: string, value: unknown): FilterQuery;
  not(column: string, operator: string, value: unknown): FilterQuery;
}

/** Every row of a select, a page at a time. */
async function selectAll<T>(
  table: string,
  columns: string,
  narrow?: (q: FilterQuery) => FilterQuery,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = db().from(table).select(columns).range(from, from + PAGE - 1);
    if (narrow) query = narrow(query as unknown as FilterQuery) as unknown as typeof query;
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** DHB's market price. Falls back to the gateway peg, and says which it used. */
async function dhbPrice(): Promise<{ usd: number; source: 'market' | 'peg' }> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${DHB_BASE}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const pairs = (data?.pairs ?? []) as { priceUsd?: string; liquidity?: { usd?: number } }[];
      const best = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
      const price = Number(best?.priceUsd);
      if (Number.isFinite(price) && price > 0) return { usd: price, source: 'market' };
    }
  } catch {
    // Fall through to the peg.
  }
  return { usd: DHB_USD_PEG, source: 'peg' };
}

/** USD per one unit of each fiat currency, from the ECB reference rates. */
async function fxToUsd(): Promise<Record<string, number>> {
  const rates: Record<string, number> = { USD: 1, USDC: 1, USDT: 1 };
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      for (const [code, perUsd] of Object.entries(data?.rates ?? {})) {
        if (typeof perUsd === 'number' && perUsd > 0) rates[code] = 1 / perUsd;
      }
    }
  } catch {
    // Non-USD rows without a rate are dropped and reported, never guessed.
  }
  return rates;
}

type Collected = { kind: FinanceKind; entry: LedgerEntry }[];

interface Reading {
  entries: Collected;
  /** Every revenue payment (or daily total) behind the series, for the public ledger. */
  ledger: LedgerItem[];
  /** Source ids that were read successfully. */
  ok: Set<string>;
  notes: string[];
}

function newReading(): Reading {
  return { entries: [], ledger: [], ok: new Set(), notes: [] };
}

function push(r: Reading, kind: FinanceKind, source: string, date: string | null | undefined, usd: number) {
  if (!date || !Number.isFinite(usd) || usd === 0) return;
  r.entries.push({ kind, entry: { date: dayKey(date), source, usd } });
}

/**
 * Revenue goes through here rather than push(), so the figure on the chart and
 * the line in the public ledger are written by the same call and cannot drift.
 */
function earn(
  r: Reading,
  source: string,
  date: string | null | undefined,
  usd: number,
  detail: Omit<LedgerItem, 'date' | 'source' | 'usd'> = {},
) {
  if (!date || !Number.isFinite(usd) || usd === 0) return;
  push(r, 'revenue', source, date, usd);
  r.ledger.push({ date: dayKey(date), source, usd: Math.round(usd * 100) / 100, ...detail });
}

/** A link-able transaction, or nothing when the chain or hash is missing. */
function proof(chain: string | number | null | undefined, tx: string | null | undefined) {
  const c = proofChain(chain);
  return c && tx && /^0x[0-9a-fA-F]{64}$/.test(tx) ? { ref: { chain: c, tx: tx.toLowerCase() } } : {};
}

async function readDatabase(r: Reading, dhbUsd: number) {
  const tasks: Promise<void>[] = [];

  tasks.push((async () => {
    const [payments, refunds, creditJobs] = await Promise.all([
      selectAll<{ paid_dhb: number; created_at: string; tx_hash: string | null; chain: string | null }>(
        'ai_payments', 'paid_dhb, created_at, tx_hash, chain'),
      selectAll<{ dhb: number; created_at: string }>('ai_payment_refunds', 'dhb, created_at'),
      selectAll<{ price_dhb: number; created_at: string }>('ai_generation_jobs', 'price_dhb, created_at', (q) =>
        q.eq('status', 'succeeded').neq('payment_source', 'dhb'),
      ),
    ]);
    for (const p of payments) {
      earn(r, 'ai_generations', p.created_at, Number(p.paid_dhb) * dhbUsd, {
        amount: Number(p.paid_dhb), unit: 'DHB', ...proof(p.chain, p.tx_hash),
      });
    }
    for (const f of refunds) {
      earn(r, 'ai_generations', f.created_at, -Number(f.dhb) * dhbUsd, { amount: -Number(f.dhb), unit: 'DHB', note: 'refund' });
    }
    for (const j of creditJobs) {
      earn(r, 'ai_generations', j.created_at, Number(j.price_dhb) * dhbUsd, { amount: Number(j.price_dhb), unit: 'DHB', note: 'paid from credits' });
    }
    r.ok.add('ai_generations');
  })());

  tasks.push((async () => {
    const rows = await selectAll<{ usd_value: number; dhb_amount: number; created_at: string; tx_hash: string | null; chain: string | null }>(
      'ad_payments', 'usd_value, dhb_amount, created_at, tx_hash, chain');
    for (const a of rows) {
      earn(r, 'ads', a.created_at, Number(a.usd_value ?? Number(a.dhb_amount) * dhbUsd), {
        amount: Number(a.dhb_amount), unit: 'DHB', ...proof(a.chain, a.tx_hash),
      });
    }
    r.ok.add('ads');
  })());

  tasks.push((async () => {
    const rows = await selectAll<{ usd: number; dhb: number; created_at: string; tx_hash: string | null; chain: string | null }>(
      'social_credit_topups', 'usd, dhb, created_at, tx_hash, chain');
    for (const t of rows) {
      earn(r, 'post_credits', t.created_at, Number(t.usd ?? Number(t.dhb) * dhbUsd), {
        amount: Number(t.dhb), unit: 'DHB', ...proof(t.chain, t.tx_hash),
      });
    }
    r.ok.add('post_credits');
  })());

  tasks.push((async () => {
    const rows = await selectAll<{ price_dhb: number; created_at: string; tx_hash: string | null; chain: string | null }>(
      'voice_clone_payments', 'price_dhb, created_at, tx_hash, chain');
    for (const v of rows) {
      earn(r, 'voice_clones', v.created_at, Number(v.price_dhb) * dhbUsd, {
        amount: Number(v.price_dhb), unit: 'DHB', ...proof(v.chain, v.tx_hash),
      });
    }
    r.ok.add('voice_clones');
  })());

  tasks.push((async () => {
    const rows = await selectAll<{ minutes: number; price_dhb_per_min: number; settled_at: string }>(
      'stage_dub_usage', 'minutes, price_dhb_per_min, settled_at', (q) => q.not('settled_at', 'is', null));
    for (const d of rows) {
      const dhb = Number(d.minutes) * Number(d.price_dhb_per_min);
      earn(r, 'live_dubbing', d.settled_at, dhb * dhbUsd, { amount: dhb, unit: 'DHB' });
    }
    r.ok.add('live_dubbing');
  })());

  tasks.push((async () => {
    const rows = await selectAll<{ currency: string; amount: number; gross_amount: number; created_at: string; tx_hash: string | null; chain_id: number | null }>(
      'work_payment_intents', 'currency, amount, gross_amount, created_at, tx_hash, chain_id', (q) => q.eq('state', 'confirmed'));
    for (const w of rows) {
      const fee = Number(w.gross_amount) - Number(w.amount);
      earn(r, 'work_fees', w.created_at, fee * (w.currency === 'USDC' ? 1 : dhbUsd), {
        amount: fee, unit: w.currency, ...proof(w.chain_id, w.tx_hash),
      });
    }
    r.ok.add('work_fees');
  })());

  tasks.push((async () => {
    const [jobs, free] = await Promise.all([
      selectAll<{ price_dhb: number; model: string; created_at: string }>('ai_generation_jobs', 'price_dhb, model, created_at', (q) =>
        q.eq('status', 'succeeded')),
      selectAll<{ model: string; created_at: string }>('ai_free_generations', 'model, created_at'),
    ]);
    for (const j of jobs) push(r, 'cost', 'ai_generation_cost', j.created_at, jobProviderCostUsd(Number(j.price_dhb), j.model));
    let unpriced = 0;
    for (const f of free) {
      const cost = freeJobProviderCostUsd(f.model);
      if (cost == null) unpriced += 1;
      else push(r, 'cost', 'ai_generation_cost', f.created_at, cost);
    }
    if (unpriced) r.notes.push(`${unpriced} free generations used a model with no cost entry and are not in AI generation costs.`);
    r.ok.add('ai_generation_cost');
  })());

  tasks.push((async () => {
    const rows = await selectAll<UsageRow>('ai_provider_usage_daily',
      'day, route, served_model, requested_model, attempts, input_tokens, output_tokens');
    let unpriced = 0;
    for (const u of rows) {
      const cost = usageCostUsd(u);
      if (cost == null) unpriced += Number(u.attempts) || 0;
      else push(r, 'cost', 'ai_text_usage', u.day, cost);
    }
    if (unpriced) r.notes.push(`${unpriced} paid AI text requests used a model with no list price yet and are not in AI text costs.`);
    r.ok.add('ai_text_usage');
  })());

  const settled = await Promise.allSettled(tasks);
  for (const s of settled) if (s.status === 'rejected') console.error('[finance-stats]', s.reason);
}

interface ApiRevenue {
  ok: true;
  rows: { date: string; source: string; kind: FinanceKind; currency: string; amount: number; count?: number }[];
  sources: string[];
}

async function readApi(r: Reading, dhbUsd: number, fx: Record<string, number>) {
  try {
    const res = await fetch(`${API_BASE}/api/stats/revenue`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`api ${res.status}`);
    const body = (await res.json()) as ApiRevenue;
    if (!body?.ok || !Array.isArray(body.rows)) throw new Error('api shape');
    let dropped = 0;
    for (const row of body.rows) {
      const currency = row.currency.toUpperCase();
      const rate = currency === 'DHB' ? dhbUsd : fx[currency];
      if (!rate) {
        dropped += 1;
        continue;
      }
      if (row.kind === 'revenue') {
        earn(r, row.source, row.date, Number(row.amount) * rate, {
          amount: Number(row.amount), unit: currency, ...(row.count ? { count: row.count } : {}),
        });
      } else {
        push(r, row.kind, row.source, row.date, Number(row.amount) * rate);
      }
    }
    if (dropped) r.notes.push(`${dropped} days of card payments were in a currency with no exchange rate today and are left out.`);
    for (const id of body.sources ?? []) r.ok.add(id);
  } catch (err) {
    console.error('[finance-stats] core API revenue', err instanceof Error ? err.message : err);
  }
}

async function readDigitalOcean(r: Reading, today: string) {
  const raw = Deno.env.get('DIGITAL_OCEAN') ?? Deno.env.get('digitalocean');
  if (!raw) return;
  const token = raw.trim().replace(/^["']+|["']+$/g, '').replace(/^Bearer\s+/i, '').replace(/[\r\n]/g, '');
  try {
    const res = await fetch('https://api.digitalocean.com/v2/customers/my/invoices?per_page=100', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`digitalocean ${res.status}`);
    const data = await res.json();
    const invoices = (data?.invoices ?? []) as { invoice_period?: string; amount?: string }[];
    const thisMonth = today.slice(0, 7);
    for (const inv of invoices) {
      if (!inv.invoice_period || inv.invoice_period >= thisMonth) continue;
      for (const e of spreadMonthAmount('digitalocean', inv.invoice_period, Number(inv.amount))) {
        r.entries.push({ kind: 'cost', entry: e });
      }
    }
    const preview = data?.invoice_preview as { invoice_period?: string; amount?: string } | undefined;
    if (preview?.invoice_period === thisMonth) {
      for (const e of spreadMonthAmount('digitalocean', thisMonth, Number(preview.amount), today)) {
        r.entries.push({ kind: 'cost', entry: e });
      }
    }
    r.ok.add('digitalocean');
  } catch (err) {
    console.error('[finance-stats] digitalocean', err instanceof Error ? err.message : err);
  }
}

async function readStripePlans(r: Reading, fx: Record<string, number>) {
  try {
    const stripe = createStripeClient('live');
    const since = Math.floor(Date.now() / 1000) - 400 * 86_400;
    for await (const invoice of stripe.invoices.list({ status: 'paid', created: { gte: since }, limit: 100 })) {
      // Plans are the only subscriptions on this Stripe account; one-off
      // invoices are something else and stay out.
      const parent = (invoice as { parent?: { subscription_details?: unknown } | null }).parent;
      const legacySubscription = (invoice as { subscription?: unknown }).subscription;
      if (!parent?.subscription_details && !legacySubscription) continue;
      const rate = fx[invoice.currency.toUpperCase()];
      if (!rate) continue;
      const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;
      earn(r, 'pro_plans', new Date(paidAt * 1000).toISOString(), (invoice.amount_paid / 100) * rate, {
        amount: invoice.amount_paid / 100, unit: invoice.currency.toUpperCase(),
      });
    }
    r.ok.add('pro_plans');
  } catch (err) {
    console.error('[finance-stats] stripe plans', err instanceof Error ? err.message : err);
  }
}

/** Already in USD at the day's price, so it is added as recorded. */
function readHistory(r: Reading) {
  for (const e of history.entries) {
    earn(r, e.source, e.date, e.usd, {
      amount: e.bnb, unit: 'BNB', ref: { chain: 'bsc', tx: e.tx },
      note: e.route === 'collateral' ? 'collateral payout' : 'tax sale',
    });
  }
  for (const source of history.sources) r.ok.add(source.id);
}

function readFixed(r: Reading, today: string) {
  for (const item of fixedItems) {
    for (const e of spreadFixedCost(item, today)) r.entries.push({ kind: 'cost', entry: e });
    r.ok.add(item.id);
  }
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

async function compute() {
  const now = new Date();
  const today = dayKey(now);
  const [price, fx] = await Promise.all([dhbPrice(), fxToUsd()]);
  const r = newReading();

  readFixed(r, today);
  readHistory(r);
  await Promise.all([
    readDatabase(r, price.usd),
    readApi(r, price.usd, fx),
    readDigitalOcean(r, today),
    readStripePlans(r, fx),
  ]);

  const sources: SourceMeta[] = [
    ...CATALOGUE.map((s) => ({ ...s, status: (r.ok.has(s.id) ? 'ok' : 'unavailable') as Status })),
    ...history.sources.map((source) => ({
      id: source.id,
      label: source.label,
      kind: 'revenue' as const,
      group: source.group,
      origin: 'chain' as const,
      status: 'ok' as const,
      note: `${source.note} ${source.provenance.payouts} payouts from ${source.provenance.firstDay} to ${source.provenance.lastDay}, ${source.provenance.totalBnb.toLocaleString('en-US')} BNB in all.`,
    })),
    ...fixedItems.map((item) => ({
      id: item.id,
      label: item.label,
      kind: 'cost' as const,
      group: item.group,
      origin: 'config' as const,
      status: 'ok' as const,
      note: `Fixed bill of $${item.usdMonthly.toLocaleString('en-US')} a month since ${item.since}, spread evenly across each day.`,
    })),
  ];

  const summary = {
    ok: true as const,
    fetchedAt: now.toISOString(),
    currency: 'USD' as const,
    dhb: { priceUsd: price.usd, priceSource: price.source, pegUsd: DHB_USD_PEG },
    sources,
    days: buildSeries(r.entries, today),
    notes: r.notes,
    provenance: {
      endpoint: 'finance-stats',
      timezone: 'UTC' as const,
      conversion:
        'Amounts paid in DHB are valued at DHB’s live market price on DexScreener, or at the $0.001 gateway peg when no market price is available. Amounts already recorded in USD keep that value; other fiat uses the ECB reference rate.',
      excluded: [
        'Tips, pay-per-view and paid DMs go from fan to creator with no platform cut, so they are not revenue.',
        'DHB credit balances are counted when they are spent on a DeHub product, not when they are loaded, so the same money is not counted twice.',
        'Bills with no API — hosting and tools other than those listed — appear only once they are added to the fixed-cost list.',
      ],
    },
  };

  // The ledger is every line behind the revenue figure, so it is served on its
  // own (?view=ledger) rather than making every visit to /stats download it.
  const ledger = {
    ok: true as const,
    fetchedAt: now.toISOString(),
    currency: 'USD' as const,
    dhb: summary.dhb,
    sources: sources
      .filter((s) => s.kind === 'revenue')
      .map((s) => ({ id: s.id, label: s.label, status: s.status, note: s.note })),
    explorers: { bsc: 'https://bscscan.com', base: 'https://basescan.org' },
    addresses: [
      { label: 'DeHub treasury (in-app DHB payments)', address: TREASURY, chains: ['base', 'bsc'] },
      ...history.sources.flatMap((s) =>
        s.provenance.addresses.map((a) => ({ label: a.label, address: a.address, chains: [s.chain] })),
      ),
    ],
    items: sortLedger(r.ledger),
  };

  return { summary, ledger };
}

let cache: { summary: string; ledger: string; expires: number } | null = null;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, reason: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!cache || Date.now() > cache.expires) {
      const { summary, ledger } = await compute();
      cache = { summary: JSON.stringify(summary), ledger: JSON.stringify(ledger), expires: Date.now() + CACHE_TTL_MS };
    }
    const view = new URL(req.url).searchParams.get('view');
    return new Response(view === 'ledger' ? cache.ledger : cache.summary, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    console.error('[finance-stats] failed', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ ok: false, reason: 'unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
