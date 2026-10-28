// deno-lint-ignore-file no-explicit-any
//
// Remix links: duets, stitches and reactions made from another creator's video.
//
// The remix itself is an ordinary DeHub post (a duet posts as a quote of its
// source). This function keeps the link between the two, which is what the
// original creator gets back: credit on the remix, the lists and counts, a
// notification, and split_bps of every tip on the remix (see use-tip-payment).
//
// Every write re-checks the source: it must be a public, ungated video, and
// its creator's allow setting (per post, then account, then 'everyone') must
// let the caller in. 'followers' asks the DeHub API whether the caller follows.
//
// Actions (POST JSON):
//   check        { sourceTokenId, kind }               may the caller remix it? signed in.
//   record       { sourceTokenId, kind, remixTokenId, details? }   signed in, the remix's minter.
//   live-start   { sourceTokenId, streamTokenId }      signed in, a live reaction.
//   live-end     { id }                                the reactor.
//   attach       { id, remixTokenId }                  the reactor, once the replay is a post.
//   list         { sourceTokenId, kind?, page? }       public.
//   counts       { sourceTokenIds }                    public, up to 100.
//   links        { remixTokenIds }                     public, up to 100: what each post remixes.
//   settings-get { owner, tokenId? }                   public: the effective policy.
//   settings-set { tokenId?, allowDuet?, allowStitch?, allowReact? }   signed in, the owner.
import { admin, corsHeaders, DEHUB_API_BASE, json } from '../_shared/transcripts.ts';
import { checkRateLimit, requireDeHubAuth } from '../_shared/auth.ts';

const LOG = '[remix-links]';
const KINDS = ['duet', 'stitch', 'react'] as const;
type Kind = typeof KINDS[number];
type Policy = 'everyone' | 'followers' | 'nobody';
const POLICIES: Policy[] = ['everyone', 'followers', 'nobody'];
const COLUMN: Record<Kind, string> = { duet: 'allow_duet', stitch: 'allow_stitch', react: 'allow_react' };
const NOUN: Record<string, string> = { duet: 'duetted', stitch: 'stitched', react: 'reacted to', react_live: 'is reacting live to' };
/** Share of each tip on a remix that goes to the source creator. */
const SPLIT_BPS = Math.max(0, Math.min(5000, Number(Deno.env.get('REMIX_SPLIT_BPS') ?? 1000) || 0));
const PAGE = 30;
const COLUMNS = 'id, kind, source_token_id, source_address, source_username, remixer_address, remixer_username, '
  + 'remix_token_id, stream_token_id, active, split_bps, details, created_at';

const tokenIdOf = (v: unknown) => (/^\d{1,15}$/.test(String(v ?? '')) ? Number(v) : null);
const kindOf = (v: unknown): Kind | null => (KINDS.includes(v as Kind) ? v as Kind : null);
const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { await res.body?.cancel(); return null; }
    return await res.json();
  } catch {
    return null;
  }
}

async function post(tokenId: number): Promise<any | null> {
  const p = await fetchJson(`${DEHUB_API_BASE}/api/nft_info/${tokenId}`);
  const value = p?.result ?? p;
  return value && typeof value === 'object' && value.minter ? value : null;
}

const username = (p: any): string | null => p?.minterUsername || p?.mintername || p?.minterUser?.username || null;

/** The same gate the recorder and the cards apply: only open, finished videos. */
function restricted(p: any): string | null {
  if (p.postType && p.postType !== 'video') return 'Only videos can be remixed.';
  if (p.isHidden || p.deleted || p.is_live || p.status === 'live' || p.stream?.isActive) return 'This video is unavailable.';
  if (p.visibility && p.visibility !== 'public') return 'This video is not public.';
  const s = p.streamInfo ?? {};
  const locked = (p.is_locked || s.isLockContent) && Number(p.locked_price ?? s.lockContentAmount ?? 0) > 0;
  if (p.is_ppv || s.isPayPerView || locked || (p.plansDetails ?? p.plans ?? []).length) return 'This video is gated.';
  if (p.spoilerText || (p.contentRating && p.contentRating !== 'safe')) return 'This video is unavailable.';
  return null;
}

async function policyFor(db: any, owner: string, tokenId: number | null, kind: Kind): Promise<Policy> {
  const column = COLUMN[kind];
  let query = db.from('remix_settings').select(`token_id, ${column}`).eq('owner_address', owner);
  query = tokenId == null ? query.is('token_id', null) : query.or(`token_id.is.null,token_id.eq.${tokenId}`);
  const { data } = await query;
  const rows = data ?? [];
  const forPost = rows.find((r: any) => r.token_id != null)?.[column];
  const forAccount = rows.find((r: any) => r.token_id == null)?.[column];
  return forPost || forAccount || 'everyone';
}

async function follows(follower: string, owner: string): Promise<boolean> {
  const info = await fetchJson(`${DEHUB_API_BASE}/api/account_info/${encodeURIComponent(owner)}?address=${encodeURIComponent(follower)}`);
  return (info?.result ?? info)?.isFollowing === true;
}

/** Whether `wallet` may remix `source` as `kind`, with the reason when not. */
async function allowed(db: any, wallet: string, source: any, tokenId: number, kind: Kind) {
  const owner = lower(source.minter);
  if (owner === wallet) return { allowed: true, policy: 'everyone' as Policy };
  const blocked = restricted(source);
  if (blocked) return { allowed: false, reason: blocked };
  if (kind === 'duet' && source.quotePolicy === 'nobody') return { allowed: false, reason: 'The creator turned off duets for this video.' };
  const policy = await policyFor(db, owner, tokenId, kind);
  if (policy === 'nobody') return { allowed: false, policy, reason: `The creator turned off ${kind === 'react' ? 'reactions' : kind + 's'} for this video.` };
  if ((policy === 'followers' || (kind === 'duet' && source.quotePolicy === 'followers')) && !(await follows(wallet, owner))) {
    return { allowed: false, policy, reason: 'Only the creator’s followers can do this.' };
  }
  return { allowed: true, policy };
}

async function notify(db: any, row: any) {
  if (row.source_address === row.remixer_address) return;
  const { error } = await db.from('custom_notifications').insert({
    recipient_address: row.source_address,
    actor_address: row.remixer_address,
    actor_username: row.remixer_username,
    type: 'remix',
    content: `${NOUN[row.kind] ?? 'remixed'} your video`,
    reference_id: String(row.remix_token_id ?? row.stream_token_id),
    reference_title: row.kind,
  });
  if (error) console.warn(`${LOG} notification failed`, error);
}

/* ──────────────────────────────── signed in ─────────────────────────────── */

async function check(db: any, wallet: string, body: any) {
  const tokenId = tokenIdOf(body?.sourceTokenId);
  const kind = kindOf(body?.kind);
  if (tokenId == null || !kind) return json({ error: 'sourceTokenId and kind required' }, 400);
  const source = await post(tokenId);
  if (!source) return json({ allowed: false, reason: 'This video is unavailable.' });
  return json(await allowed(db, wallet, source, tokenId, kind));
}

async function record(db: any, wallet: string, body: any) {
  const sourceTokenId = tokenIdOf(body?.sourceTokenId);
  const remixTokenId = tokenIdOf(body?.remixTokenId);
  const kind = kindOf(body?.kind);
  if (sourceTokenId == null || remixTokenId == null || !kind) return json({ error: 'sourceTokenId, remixTokenId and kind required' }, 400);
  if (sourceTokenId === remixTokenId) return json({ error: 'A video cannot remix itself.' }, 400);
  if (!(await checkRateLimit(db, wallet, 'remix-links:record', { limit: 30, windowMs: 3_600_000 })).allowed) return json({ error: 'Too many remixes. Try again later.' }, 429);

  const { data: existing } = await db.from('remix_links').select(COLUMNS).eq('remix_token_id', remixTokenId).maybeSingle();
  if (existing) {
    return existing.remixer_address === wallet ? json({ link: existing }) : json({ error: 'That post is already linked.' }, 409);
  }
  const [source, remix] = await Promise.all([post(sourceTokenId), post(remixTokenId)]);
  if (!source) return json({ error: 'The original video is unavailable.' }, 404);
  if (!remix || lower(remix.minter) !== wallet) return json({ error: 'That post is not yours.' }, 403);
  // A duet is posted as a quote of its source; that link is the backend's own.
  if (kind === 'duet' && remix.quotedTokenId != null && Number(remix.quotedTokenId) !== sourceTokenId) {
    return json({ error: 'That post does not quote this video.' }, 400);
  }
  const verdict = await allowed(db, wallet, source, sourceTokenId, kind);
  if (!verdict.allowed) return json({ error: verdict.reason, refused: true }, 403);

  const details = body?.details && typeof body.details === 'object' ? JSON.parse(JSON.stringify(body.details).slice(0, 2000)) : {};
  const row = {
    kind, source_token_id: sourceTokenId, source_address: lower(source.minter), source_username: username(source),
    remixer_address: wallet, remixer_username: username(remix), remix_token_id: remixTokenId,
    split_bps: lower(source.minter) === wallet ? 0 : SPLIT_BPS, details,
  };
  const { data, error } = await db.from('remix_links').insert(row).select(COLUMNS).single();
  if (error) {
    console.error(`${LOG} insert failed`, error);
    return json({ error: 'Could not link this post.' }, 500);
  }
  await notify(db, data);
  return json({ link: data });
}

async function liveStart(db: any, wallet: string, body: any) {
  const sourceTokenId = tokenIdOf(body?.sourceTokenId);
  const streamTokenId = tokenIdOf(body?.streamTokenId);
  if (sourceTokenId == null || streamTokenId == null) return json({ error: 'sourceTokenId and streamTokenId required' }, 400);
  const [source, stream] = await Promise.all([post(sourceTokenId), post(streamTokenId)]);
  if (!source) return json({ error: 'The original video is unavailable.' }, 404);
  if (!stream || lower(stream.minter) !== wallet) return json({ error: 'That stream is not yours.' }, 403);
  const verdict = await allowed(db, wallet, source, sourceTokenId, 'react');
  if (!verdict.allowed) return json({ error: verdict.reason, refused: true }, 403);
  await db.from('remix_links').update({ active: false }).eq('stream_token_id', streamTokenId).eq('remixer_address', wallet).eq('active', true);
  const { data, error } = await db.from('remix_links').insert({
    kind: 'react_live', source_token_id: sourceTokenId, source_address: lower(source.minter), source_username: username(source),
    remixer_address: wallet, remixer_username: username(stream), stream_token_id: streamTokenId,
    split_bps: lower(source.minter) === wallet ? 0 : SPLIT_BPS,
  }).select(COLUMNS).single();
  if (error) return json({ error: 'Could not start the live reaction.' }, 500);
  await notify(db, data);
  return json({ link: data });
}

async function ownLive(db: any, wallet: string, id: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from('remix_links').select(COLUMNS).eq('id', id).maybeSingle();
  return data && data.remixer_address === wallet && data.kind === 'react_live' ? data : null;
}

async function liveEnd(db: any, wallet: string, body: any) {
  const row = await ownLive(db, wallet, body?.id);
  if (!row) return json({ error: 'Not found.' }, 404);
  await db.from('remix_links').update({ active: false }).eq('id', row.id);
  return json({ ok: true });
}

async function attach(db: any, wallet: string, body: any) {
  const row = await ownLive(db, wallet, body?.id);
  const remixTokenId = tokenIdOf(body?.remixTokenId);
  if (!row || remixTokenId == null) return json({ error: 'Not found.' }, 404);
  const remix = await post(remixTokenId);
  if (!remix || lower(remix.minter) !== wallet) return json({ error: 'That post is not yours.' }, 403);
  const { data, error } = await db.from('remix_links').update({ remix_token_id: remixTokenId, active: false })
    .eq('id', row.id).select(COLUMNS).single();
  if (error) return json({ error: 'Could not attach the replay.' }, 409);
  return json({ link: data });
}

async function settingsSet(db: any, wallet: string, body: any) {
  const tokenId = body?.tokenId == null ? null : tokenIdOf(body.tokenId);
  if (body?.tokenId != null && tokenId == null) return json({ error: 'Invalid tokenId' }, 400);
  if (tokenId != null) {
    const p = await post(tokenId);
    if (!p || lower(p.minter) !== wallet) return json({ error: 'That post is not yours.' }, 403);
  }
  const values: Record<string, Policy | null> = {};
  for (const [field, column] of [['allowDuet', 'allow_duet'], ['allowStitch', 'allow_stitch'], ['allowReact', 'allow_react']]) {
    if (!(field in (body ?? {}))) continue;
    const v = body[field];
    if (v !== null && !POLICIES.includes(v)) return json({ error: `Invalid ${field}` }, 400);
    values[column] = v;
  }
  if (!Object.keys(values).length) return json({ error: 'Nothing to save' }, 400);
  let existing = db.from('remix_settings').select('owner_address').eq('owner_address', wallet);
  existing = tokenId == null ? existing.is('token_id', null) : existing.eq('token_id', tokenId);
  const { data: found } = await existing.maybeSingle();
  const stamp = { ...values, updated_at: new Date().toISOString() };
  const write = found
    ? (tokenId == null
      ? db.from('remix_settings').update(stamp).eq('owner_address', wallet).is('token_id', null)
      : db.from('remix_settings').update(stamp).eq('owner_address', wallet).eq('token_id', tokenId))
    : db.from('remix_settings').insert({ owner_address: wallet, token_id: tokenId, ...stamp });
  const { error } = await write;
  if (error) return json({ error: 'Could not save.' }, 500);
  return await settingsGet(db, { owner: wallet, tokenId });
}

/* ───────────────────────────────── public ───────────────────────────────── */

async function list(db: any, body: any) {
  const tokenId = tokenIdOf(body?.sourceTokenId);
  if (tokenId == null) return json({ error: 'sourceTokenId required' }, 400);
  const page = Math.max(0, Math.min(100, Number(body?.page) || 0));
  let query = db.from('remix_links').select(COLUMNS).eq('source_token_id', tokenId);
  const kind = body?.kind;
  if (kind === 'react') query = query.in('kind', ['react', 'react_live']);
  else if (kindOf(kind)) query = query.eq('kind', kind);
  query = query.or('remix_token_id.not.is.null,active.eq.true');
  const { data } = await query.order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
  const rows = data ?? [];
  return json({ links: rows.slice(0, PAGE), hasMore: rows.length > PAGE });
}

const ids = (v: unknown) => (Array.isArray(v) ? v.map(tokenIdOf).filter((n): n is number => n != null).slice(0, 100) : []);

async function counts(db: any, body: any) {
  const list = ids(body?.sourceTokenIds);
  if (!list.length) return json({ counts: {} });
  const { data } = await db.from('remix_counts').select('*').in('source_token_id', list);
  const out: Record<string, { duets: number; stitches: number; reactions: number }> = {};
  for (const r of data ?? []) out[r.source_token_id] = { duets: Number(r.duets), stitches: Number(r.stitches), reactions: Number(r.reactions) };
  return json({ counts: out });
}

async function links(db: any, body: any) {
  const list = ids(body?.remixTokenIds);
  if (!list.length) return json({ links: [] });
  const { data } = await db.from('remix_links').select(COLUMNS).in('remix_token_id', list);
  return json({ links: data ?? [] });
}

async function settingsGet(db: any, body: any) {
  const owner = lower(body?.owner);
  if (!/^0x[0-9a-f]{40}$/.test(owner) && !/^[1-9a-hj-np-z]{32,44}$/i.test(owner)) return json({ error: 'owner required' }, 400);
  const tokenId = body?.tokenId == null ? null : tokenIdOf(body.tokenId);
  let query = db.from('remix_settings').select('token_id, allow_duet, allow_stitch, allow_react').eq('owner_address', owner);
  query = tokenId == null ? query.is('token_id', null) : query.or(`token_id.is.null,token_id.eq.${tokenId}`);
  const { data } = await query;
  const rows = data ?? [];
  const account = rows.find((r: any) => r.token_id == null) ?? {};
  const forPost = rows.find((r: any) => r.token_id != null) ?? {};
  const pick = (c: string) => ({ post: forPost[c] ?? null, account: account[c] ?? null, effective: forPost[c] || account[c] || 'everyone' });
  return json({ settings: { duet: pick('allow_duet'), stitch: pick('allow_stitch'), react: pick('allow_react') }, splitBps: SPLIT_BPS });
}

/* ─────────────────────────────── handler ────────────────────────────────── */

const SIGNED_IN: Record<string, (db: any, wallet: string, body: any) => Promise<Response>> = {
  check, record, 'live-start': liveStart, 'live-end': liveEnd, attach, 'settings-set': settingsSet,
};
const PUBLIC: Record<string, (db: any, body: any) => Promise<Response>> = {
  list, counts, links, 'settings-get': settingsGet,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const db = admin();
    const action = String(body?.action ?? '');
    if (PUBLIC[action]) return await PUBLIC[action](db, body);
    const handler = SIGNED_IN[action];
    if (!handler) return json({ error: 'unknown action' }, 400);
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    return await handler(db, auth.wallet, body);
  } catch (e: any) {
    console.error(`${LOG} error`, e);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
