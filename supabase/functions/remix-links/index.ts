// deno-lint-ignore-file no-explicit-any
//
// Remix links: reactions (and later duets and stitches) to DeHub videos.
//
// A recorded reaction is an ordinary video post; once it is minted the client
// reports it here and the row ties it to its source. A live reaction is a
// DeHub video the streamer put on screen as a studio source; the row is
// active while it is there, and viewers read it for the "Reacting to" chip.
//
// Every write checks the source again: a public, finished video, not sold per
// view, locked, subscriber-only, hidden or adult, whose creator allows
// reactions (remix_settings: the post's own row, else the account default).
// The original creator is told through custom_notifications.
//
// Actions (POST JSON):
//   check     { sourceTokenId }                   anyone: may this be reacted to?
//   posted    { sourceTokenId, remixTokenId }     signed in, the remix's minter
//   live      { sourceTokenId, streamTokenId }    signed in, the stream's minter
//   live-stop { streamTokenId }                   the same
//   current   { streamTokenId }                   anyone: what the stream is reacting to
//   list      { sourceTokenId, before? }          anyone: reactions to a post
//   settings  { tokenId? }                        anyone: the allow switch
//   set       { tokenId?, allowReact }            signed in, the owner
import { admin, corsHeaders, DEHUB_API_BASE, json } from '../_shared/transcripts.ts';
import { checkRateLimit, requireDeHubAuth } from '../_shared/auth.ts';
import { blockedReason } from './source-policy.ts';

const LOG = '[remix-links]';
const PAGE = 30;

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

const tokenIdOf = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function post(tokenId: number): Promise<any | null> {
  const body = await fetchJson(`${DEHUB_API_BASE}/api/nft_info/${tokenId}`);
  const p = body?.result ?? body;
  return p?.tokenId ? p : null;
}

interface Source {
  tokenId: number;
  owner: string;
  username: string | null;
  title: string;
}

async function allowsReact(db: any, owner: string, tokenId: number): Promise<boolean> {
  const { data } = await db.from('remix_settings').select('token_id, allow_react')
    .eq('owner_address', owner).in('token_id', [0, tokenId]);
  const rows = (data ?? []) as { token_id: number; allow_react: boolean }[];
  const own = rows.find((r) => Number(r.token_id) === tokenId);
  const account = rows.find((r) => Number(r.token_id) === 0);
  return (own ?? account)?.allow_react ?? true;
}

async function source(db: any, tokenId: number | null): Promise<{ source?: Source; error?: string }> {
  if (!tokenId) return { error: 'A source video is required.' };
  const p = await post(tokenId);
  const reason = blockedReason(p);
  if (reason) return { error: reason };
  const owner = String(p.minter ?? '').toLowerCase();
  if (!owner) return { error: 'Video not found.' };
  if (!(await allowsReact(db, owner, tokenId))) return { error: 'The creator has turned off reactions to this video.' };
  return {
    source: {
      tokenId,
      owner,
      username: p.mintername || p.minterUser?.username || null,
      title: String(p.name ?? p.title ?? '').trim().slice(0, 200),
    },
  };
}

async function account(wallet: string): Promise<{ username: string | null; avatar: string | null }> {
  const body = await fetchJson(`${DEHUB_API_BASE}/api/account_info/${encodeURIComponent(wallet)}`);
  const a = body?.result ?? body;
  return { username: a?.username || null, avatar: a?.avatarImageUrl || a?.avatarUrl || null };
}

async function notify(db: any, src: Source, actor: string, referenceId: string, live: boolean) {
  if (src.owner === actor) return;
  const who = await account(actor);
  const { error } = await db.from('custom_notifications').insert({
    recipient_address: src.owner,
    actor_address: actor,
    actor_username: who.username,
    actor_avatar: who.avatar,
    type: 'video_reaction',
    content: live ? 'is reacting live to your video.' : 'reacted to your video.',
    reference_id: referenceId,
    reference_title: src.title || null,
  });
  if (error) console.warn(`${LOG} notification failed`, error);
}

function view(row: any) {
  return {
    kind: row.kind,
    sourceTokenId: Number(row.source_token_id),
    sourceUsername: row.source_username,
    sourceTitle: row.source_title,
    remixTokenId: row.remix_token_id == null ? null : Number(row.remix_token_id),
    streamTokenId: row.stream_token_id == null ? null : Number(row.stream_token_id),
    remixerAddress: row.remixer_address,
    remixerUsername: row.remixer_username,
    active: !!row.active,
    createdAt: row.created_at,
  };
}

const COLUMNS = 'kind, source_token_id, source_username, source_title, remix_token_id, stream_token_id, remixer_address, remixer_username, active, created_at';

async function posted(db: any, wallet: string, body: any) {
  const remixTokenId = tokenIdOf(body?.remixTokenId);
  if (!remixTokenId) return json({ error: 'A reaction post is required.' }, 400);
  const remix = await post(remixTokenId);
  if (!remix || String(remix.minter ?? '').toLowerCase() !== wallet) {
    return json({ error: 'Only the creator of the reaction can link it.' }, 403);
  }
  const { source: src, error } = await source(db, tokenIdOf(body?.sourceTokenId));
  if (!src) return json({ error }, 409);
  if (src.tokenId === remixTokenId) return json({ error: 'A video cannot react to itself.' }, 400);
  const me = await account(wallet);
  const { data, error: insertError } = await db.from('remix_links').upsert({
    kind: 'react',
    source_token_id: src.tokenId,
    source_address: src.owner,
    source_username: src.username,
    source_title: src.title,
    remix_token_id: remixTokenId,
    remixer_address: wallet,
    remixer_username: me.username,
  }, { onConflict: 'remix_token_id', ignoreDuplicates: true }).select(COLUMNS);
  if (insertError) {
    console.error(`${LOG} link failed`, insertError);
    return json({ error: 'Could not link this reaction.' }, 500);
  }
  // A repeat report of the same post inserts nothing and notifies nobody.
  if (data?.length) await notify(db, src, wallet, String(remixTokenId), false);
  return json({ link: data?.[0] ? view(data[0]) : null });
}

async function streamOf(wallet: string, streamTokenId: number | null) {
  if (!streamTokenId) return { error: 'A live stream is required.' };
  const p = await post(streamTokenId);
  if (!p || p.postType !== 'live') return { error: 'Live stream not found.' };
  if (String(p.minter ?? '').toLowerCase() !== wallet) return { error: 'Only the streamer can change this.' };
  return { tokenId: streamTokenId };
}

async function live(db: any, wallet: string, body: any) {
  const stream = await streamOf(wallet, tokenIdOf(body?.streamTokenId));
  if (!stream.tokenId) return json({ error: stream.error }, 403);
  const { source: src, error } = await source(db, tokenIdOf(body?.sourceTokenId));
  if (!src) return json({ error }, 409);
  const now = new Date().toISOString();
  await db.from('remix_links').update({ active: false, ended_at: now })
    .eq('stream_token_id', stream.tokenId).eq('active', true);
  const me = await account(wallet);
  const { data, error: insertError } = await db.from('remix_links').insert({
    kind: 'react_live',
    source_token_id: src.tokenId,
    source_address: src.owner,
    source_username: src.username,
    source_title: src.title,
    stream_token_id: stream.tokenId,
    remixer_address: wallet,
    remixer_username: me.username,
    active: true,
  }).select(COLUMNS).single();
  if (insertError) {
    console.error(`${LOG} live link failed`, insertError);
    return json({ error: 'Could not start this reaction.' }, 500);
  }
  // Once per source per stream: taking it off and back on is not news.
  const { count } = await db.from('remix_links').select('id', { count: 'exact', head: true })
    .eq('stream_token_id', stream.tokenId).eq('source_token_id', src.tokenId);
  if ((count ?? 0) <= 1) await notify(db, src, wallet, String(stream.tokenId), true);
  return json({ link: view(data) });
}

async function liveStop(db: any, wallet: string, body: any) {
  const stream = await streamOf(wallet, tokenIdOf(body?.streamTokenId));
  if (!stream.tokenId) return json({ error: stream.error }, 403);
  await db.from('remix_links').update({ active: false, ended_at: new Date().toISOString() })
    .eq('stream_token_id', stream.tokenId).eq('active', true);
  return json({ ok: true });
}

async function current(db: any, body: any) {
  const streamTokenId = tokenIdOf(body?.streamTokenId);
  if (!streamTokenId) return json({ link: null });
  const { data } = await db.from('remix_links').select(COLUMNS)
    .eq('stream_token_id', streamTokenId).eq('active', true).maybeSingle();
  return json({ link: data ? view(data) : null });
}

async function list(db: any, body: any) {
  const sourceTokenId = tokenIdOf(body?.sourceTokenId);
  if (!sourceTokenId) return json({ error: 'A source video is required.' }, 400);
  let q = db.from('remix_links').select(COLUMNS, { count: 'exact' })
    .eq('source_token_id', sourceTokenId).in('kind', ['react', 'react_live'])
    .order('created_at', { ascending: false }).limit(PAGE);
  if (typeof body?.before === 'string' && !Number.isNaN(Date.parse(body.before))) q = q.lt('created_at', body.before);
  const { data, count, error } = await q;
  if (error) return json({ error: 'Could not load reactions.' }, 500);
  const rows = (data ?? []).map(view);
  return json({ reactions: rows, total: count ?? rows.length, hasMore: rows.length === PAGE });
}

async function settings(db: any, body: any) {
  const tokenId = tokenIdOf(body?.tokenId);
  if (!tokenId) return json({ error: 'A post is required.' }, 400);
  const p = await post(tokenId);
  if (!p) return json({ error: 'Post not found.' }, 404);
  const owner = String(p.minter ?? '').toLowerCase();
  return json({ allowReact: await allowsReact(db, owner, tokenId), blocked: blockedReason(p) });
}

async function set(db: any, wallet: string, body: any) {
  if (typeof body?.allowReact !== 'boolean') return json({ error: 'allowReact must be true or false.' }, 400);
  const tokenId = body?.tokenId == null ? 0 : tokenIdOf(body.tokenId);
  if (tokenId === null) return json({ error: 'Invalid post.' }, 400);
  if (tokenId) {
    const p = await post(tokenId);
    if (!p || String(p.minter ?? '').toLowerCase() !== wallet) return json({ error: 'Only the creator can change this.' }, 403);
  }
  const { error } = await db.from('remix_settings').upsert({
    owner_address: wallet, token_id: tokenId, allow_react: body.allowReact, updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: 'Could not save this setting.' }, 500);
  // Turning reactions off also takes the video off any stream showing it now.
  if (!body.allowReact) {
    let q = db.from('remix_links').update({ active: false, ended_at: new Date().toISOString() })
      .eq('source_address', wallet).eq('active', true);
    if (tokenId) q = q.eq('source_token_id', tokenId);
    await q;
  }
  return json({ allowReact: body.allowReact });
}

const SIGNED_IN: Record<string, (db: any, wallet: string, body: any) => Promise<Response>> = {
  posted,
  live,
  'live-stop': liveStop,
  set,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const db = admin();
    const action = String(body?.action ?? '');
    if (action === 'check') {
      const { error } = await source(db, tokenIdOf(body?.sourceTokenId));
      return json({ allowed: !error, reason: error ?? null });
    }
    if (action === 'current') return await current(db, body);
    if (action === 'list') return await list(db, body);
    if (action === 'settings') return await settings(db, body);
    const handler = SIGNED_IN[action];
    if (!handler) return json({ error: 'unknown action' }, 400);
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    const limit = await checkRateLimit(db, auth.wallet, 'remix-links', { limit: 60, windowMs: 600_000 });
    if (!limit.allowed) return json({ error: 'Too many requests. Try again in a few minutes.' }, 429);
    return await handler(db, auth.wallet, body);
  } catch (e: any) {
    console.error(`${LOG} error`, e);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
