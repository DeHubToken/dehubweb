import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { IMAGE_COST_USD, VIDEO_COST_USD, MODEL3D_COST_USD, TOOL_COST_USD, quotePriceDhb, dhbToUsd } from '../supabase/functions/_shared/ai-pricing.ts';
import { CREATOR_FAL_VIDEO_MODELS } from '../supabase/functions/_shared/creator-fal-catalog.ts';

export const ORIGIN = 'https://dehub.io';
export const RESOURCE = `${ORIGIN}/mcp`;
const EDGE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1';
const API = 'https://api.dehub.io/api';
export const SCOPES = ['dehub:read', 'dehub:profile', 'dehub:social', 'dehub:generate'];
const text = (max = 2000) => z.string().trim().min(1).max(max);
const id = z.string().regex(/^\d{1,15}$/);
const wallet = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const media = z.string().url().max(4096).refine(value => {
  const u = new URL(value);
  // Fetch only DeHub's media hosts. Never fetch caller-selected internal URLs.
  return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
    ['dehubcdn.ams3.cdn.digitaloceanspaces.com', 'aigxuutjaqsywioxjefr.supabase.co'].includes(u.hostname);
}, 'Use a media URL from your DeHub library or uploads.');
const page = z.number().int().min(1).max(1000).default(1);
const limit = z.number().int().min(1).max(50).default(20);
const enc = encodeURIComponent;
const unwrap = value => value?.result ?? value;
const success = payload => ({ content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload });
const failure = (message, extra = {}) => ({ ...success({ error: message, ...extra }), isError: true });
export const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});
export const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
export const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export const pkce = async value => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

export async function readJson(response) {
  let data;
  try { data = await response.json(); } catch { throw new Error(`Service returned HTTP ${response.status} without a JSON result.`); }
  if (!response.ok || data?.error || data?.status === false || data?.result === false) {
    const error = new Error(String(data.error || data.message || `Service returned HTTP ${response.status}`).slice(0, 500));
    error.status = response.status;
    error.details = Object.fromEntries(['code', 'priceDhb', 'paymentRestored'].filter(k => data[k] !== undefined).map(k => [k, data[k]]));
    throw error;
  }
  return data;
}
export async function verifySession(token, fetcher = fetch) {
  const result = await readJson(await fetcher(`${API}/auth/verify`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) }));
  const address = typeof result.address === 'string' ? result.address.toLowerCase() : '';
  if (!/^0x[a-f0-9]{40}$/.test(address)) throw new Error('Invalid DeHub session. Sign in again.');
  return address;
}
async function api(ctx, path, method = 'GET', body) {
  return readJson(await ctx.fetch(`${API}${path}`, { method,
    headers: { ...(ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    redirect: 'error', signal: AbortSignal.timeout(25000),
  }));
}
export async function edge(ctx, name, body) {
  return readJson(await ctx.fetch(`${EDGE}/${name}`, { method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'x-dehub-token': ctx.token, 'x-wallet-address': ctx.wallet },
    body: JSON.stringify(body),
  }));
}
async function file(ctx, url, kind, maxBytes = 12 * 1024 * 1024) {
  const response = await ctx.fetch(media.parse(url), { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Could not download the DeHub media.');
  const mime = (response.headers.get('Content-Type') || '').split(';')[0];
  if (!mime.startsWith(`${kind}/`)) throw new Error(`Expected ${kind} media.`);
  if (Number(response.headers.get('Content-Length')) > maxBytes) throw new Error('Media is too large for a chat upload. Use DeHub to publish it.');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Media is too large for a chat upload. Use DeHub to publish it.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new Blob(chunks, { type: mime });
}

const tools = [];
function tool(name, title, description, shape, scope, handler, { destructive = false, open = false, read = false, idempotent = false, profile = false } = {}) {
  const schema = z.object(shape).strict();
  const securitySchemes = scope ? [{ type: 'oauth2', scopes: [scope] }] : [{ type: 'noauth' }];
  tools.push({ name, scope, schema, handler, descriptor: { name, title, description,
    inputSchema: zodToJsonSchema(schema, { $refStrategy: 'none' }),
    ...(profile ? { outputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1, pattern: '\\S' }, name: { type: 'string' }, nickname: { type: 'string' } }, required: ['id'], additionalProperties: false } } : {}),
    annotations: { readOnlyHint: read, destructiveHint: destructive, openWorldHint: open, idempotentHint: idempotent },
    securitySchemes, _meta: { securitySchemes, ...(profile ? { 'openai/profile': true } : {}) },
  } });
}

tool('dehub_features', 'Discover DeHub account controls', 'List the chat controls available for each DeHub feature and open the app for features that need its editor, live media or wallet signatures.', {}, null, async () => success({
  endpoint: RESOURCE,
  features: [
    { feature: 'Profile and privacy', tools: ['dehub_account','dehub_update_profile'] },
    { feature: 'Posts and conversations', tools: ['dehub_feed','dehub_post','dehub_search','dehub_my_posts','dehub_create_post','dehub_comments','dehub_comment'] },
    { feature: 'Social and notifications', tools: ['dehub_follow','dehub_follow_list','dehub_notifications','dehub_mark_notification_read'] },
    { feature: 'Bookmarks', tools: ['dehub_bookmark_folders','dehub_bookmark_items','dehub_save_bookmark'] },
    { feature: 'Creator Studio', tools: ['dehub_creator_models','dehub_quote_generation','dehub_generate_content','dehub_generation_status','dehub_creator_library'], url: `${ORIGIN}/creator` },
  ],
  in_app: [
    { feature: 'Encrypted messages', url: `${ORIGIN}/app/messages`, reason: 'Messages require the account keys held by the app.' },
    { feature: 'Timeline editing and live recording', url: `${ORIGIN}/editor`, reason: 'Use the editor for interactive editing and capture.' },
    { feature: 'Wallet transfers, minting and staking', url: `${ORIGIN}/app`, reason: 'Approve blockchain signatures in your wallet.' },
    { feature: 'Agent tasks', url: `${ORIGIN}/app/agents`, reason: 'Agent accounts retain their separate personal connectors and task permissions.' },
  ],
}), { read: true });

// Public reads continue through the existing server, including its view accounting.
for (const [name, title, shape] of [
  ['dehub_feed', 'Browse DeHub posts', { sort: z.enum(['new','hot','trending','discussed']).optional(), category: text(100).optional(), search: text(200).optional(), limit, offset: z.number().int().min(0).max(10000).default(0) }],
  ['dehub_post', 'Read a DeHub post', { token_id: id }],
  ['dehub_comments', 'Read post comments', { token_id: id, limit, page: z.number().int().min(0).max(1000).default(0) }],
  ['dehub_search', 'Search posts and people', { query: text(200), type: z.enum(['all','posts','users']).default('all'), limit }],
  ['dehub_profile', 'Look up a public profile', { user: text(100) }],
]) tool(name, title, `${title}. Public information; no account linking required.`, shape, null, async (args, ctx) => {
  const response = await ctx.fetch(`${EDGE}/dehub-mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  if (!response.ok) throw new Error(`Public DeHub lookup returned HTTP ${response.status}.`);
  const raw = (await response.text()).trim();
  const frame = raw.startsWith('{') ? raw : raw.split(/\r?\n/).filter(line => line.startsWith('data:')).at(-1)?.slice(5).trim();
  const result = JSON.parse(frame || '{}');
  if (result.error || !result.result) throw new Error('Public DeHub lookup failed.');
  return result.result;
}, { open: true, read: true });

tool('dehub_account', 'Get my connected DeHub account', 'Identify the connected account and read its profile. Use before changing a profile or publishing to confirm the active identity.', {}, 'dehub:read', async (_, ctx) => {
  const p = unwrap(await api(ctx, `/account_info/${ctx.wallet}`));
  return success({ id: ctx.wallet, display_name: p.displayName || p.username || ctx.wallet, username: p.username,
    profile: p, url: `${ORIGIN}/${enc(p.username || ctx.wallet)}`, granted_scopes: ctx.scopes });
}, { read: true });

tool('dehub_connected_profile', 'Identify the linked DeHub profile', 'Return the immutable identity and display label of the profile represented by this request\'s validated credentials.', {}, 'dehub:read', async (_, ctx) => {
  const p = unwrap(await api(ctx, `/account_info/${ctx.wallet}`));
  const profileId = p?._id ?? p?.id;
  if (!['string','number'].includes(typeof profileId) || !String(profileId).trim()) throw new Error('The connected profile has no persistent identity.');
  return success({ id: String(profileId), name: p.displayName || p.username || ctx.wallet, ...(p.username ? { nickname: `@${p.username}` } : {}) });
}, { read: true, profile: true });

tool('dehub_update_profile', 'Update my DeHub profile', 'Change only the connected person\'s profile: bio, display name, username, avatar or cover. Images must come from DeHub uploads or the Creator library. Overwrites the selected profile fields.', {
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,30}$/).optional(), bio: z.string().max(2000).optional(), display_name: text(100).optional(),
  is_private: z.boolean().optional(), hide_badge_and_balance: z.boolean().optional(), hide_followers: z.boolean().optional(),
  avatar_url: media.optional(), banner_url: media.optional(),
}, 'dehub:profile', async (a, ctx) => {
  if (!Object.keys(a).length) throw new Error('Provide at least one profile field.');
  if (a.username) {
    const current = unwrap(await api(ctx, `/account_info/${ctx.wallet}`));
    if (a.username !== current.username) {
      const availability = await api(ctx, `/username/check?username=${enc(a.username)}`);
      if (availability.available !== true) throw new Error('Username is taken or reserved. Choose another.');
    }
  }
  const form = new FormData();
  for (const [key, field] of [['username','username'],['bio','aboutMe'],['display_name','displayName']]) if (a[key] !== undefined) form.set(field, a[key]);
  if (a.is_private !== undefined) form.set('isPrivate', String(a.is_private));
  if (a.hide_badge_and_balance !== undefined) form.set('hideBadgeAndBalance', String(a.hide_badge_and_balance));
  if (a.hide_followers !== undefined) form.set('hideFollowers', String(a.hide_followers));
  if (a.avatar_url) form.set('avatarImg', await file(ctx, a.avatar_url, 'image'), 'avatar.png');
  if (a.banner_url) form.set('coverImg', await file(ctx, a.banner_url, 'image'), 'cover.png');
  await api(ctx, '/update_profile', 'POST', form);
  const profile = unwrap(await api(ctx, `/account_info/${ctx.wallet}`));
  const verified = !a.avatar_url && !a.banner_url && (!a.username || profile.username === a.username) && (a.bio === undefined || profile.aboutMe === a.bio) && (!a.display_name || profile.displayName === a.display_name)
    && (a.is_private === undefined || profile.isPrivate === a.is_private) && (a.hide_badge_and_balance === undefined || profile.hideBadgeAndBalance === a.hide_badge_and_balance)
    && (a.hide_followers === undefined || profile.hideFollowers === a.hide_followers);
  return success({ saved: true, verified, profile, url: `${ORIGIN}/${enc(profile.username || ctx.wallet)}`, ...(verified ? {} : { message: 'Save accepted; the profile read has not reflected all changes yet. Read the account again before retrying.' }) });
}, { destructive: true, open: true });

tool('dehub_my_posts', 'List my posts', 'Read the connected account\'s own published posts.', { page, limit }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/myPosts?page=${a.page}&limit=${a.limit}`)), { read: true });
tool('dehub_create_post', 'Publish a DeHub post', 'Publish an ordinary text, image or video post as the connected person. Requires an explicit request to publish. Does not mint or sign blockchain transactions. Use one request_id for the same publication, including retries. Video needs a thumbnail.', {
  request_id: z.string().uuid(), content: text(500), title: text(150).optional(), media_url: media.optional(), media_type: z.enum(['image','video']).optional(), thumbnail_url: media.optional(), category: text(100).default('General'),
}, 'dehub:social', async (a, ctx) => ctx.once('post', a.request_id, a, async () => {
  if (!!a.media_url !== !!a.media_type) throw new Error('Provide both media_url and media_type together.');
  if (a.media_type === 'video' && !a.thumbnail_url) throw new Error('Video posts need a thumbnail.');
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: a.title && !a.content.startsWith(a.title) ? a.title : ' ', description: a.content,
    postType: a.media_url ? a.media_type === 'video' ? 'video' : 'feed-images' : 'feed-simple', chainId: '8453',
    category: JSON.stringify([a.category]), minter: ctx.wallet, mintOptOut: 'true', idempotencyKey: a.request_id,
    streamInfo: JSON.stringify({ isLockContent: false, isPayPerView: false, isAddBounty: false }) })) form.set(key, value);
  if (a.media_url) {
    form.append('file', await file(ctx, a.media_url, a.media_type, a.media_type === 'video' ? 64 * 1024 * 1024 : undefined), a.media_type === 'video' ? 'video.mp4' : 'image.png');
    form.set('media_type', a.media_type);
    if (a.thumbnail_url) form.append('file', await file(ctx, a.thumbnail_url, 'image'), 'thumbnail.png');
  }
  const result = unwrap(await api(ctx, '/user_mint', 'POST', form));
  if (!result?.createdTokenId) throw new Error('Publication outcome is unknown. Read your posts before retrying.');
  return success({ published: true, minted: false, token_id: result.createdTokenId, url: `${ORIGIN}/app/post/${result.createdTokenId}` });
}), { open: true });
tool('dehub_comment', 'Comment or reply', 'Publish a comment or threaded reply as the connected person. Read the thread first. Reuse request_id on retries.', {
  request_id: z.string().uuid(), token_id: id, content: text(2000), reply_to_comment_id: id.optional(),
}, 'dehub:social', async (a, ctx) => ctx.once('comment', a.request_id, a, async () => success(await api(ctx, '/request_comment', 'POST', {
  streamTokenId: Number(a.token_id), content: a.content, ...(a.reply_to_comment_id ? { commentId: Number(a.reply_to_comment_id) } : {}),
}))), { open: true });
tool('dehub_follow', 'Follow or unfollow a person', 'Set the connected account\'s follow relationship. Checks the existing relationship before changing it.', {
  target_wallet: wallet, action: z.enum(['follow','unfollow']),
}, 'dehub:social', async (a, ctx) => {
  const p = unwrap(await api(ctx, `/account_info/${enc(a.target_wallet)}`));
  const follows = p.isFollowing === true || p.isFollowRequestPending === true;
  if ((a.action === 'follow') === follows) return success({ success: true, skipped: true });
  return success(await api(ctx, '/request_follow', 'POST', { following: a.target_wallet, ...(a.action === 'unfollow' ? { unFollowing: true } : {}) }));
}, { open: true });
tool('dehub_follow_list', 'Read followers or following', 'List the connected account\'s followers or followed accounts.', { type: z.enum(['followers','following']), page, limit }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/follow_list/${ctx.wallet}?type=${a.type}&page=${a.page}&limit=${a.limit}`)), { read: true });
tool('dehub_set_reaction', 'Set or remove my post reaction', 'Set one reaction on a post, or remove it with reaction=null. Checks the current reaction so an existing reaction is not accidentally toggled off. Reuse request_id on retries.', {
  request_id: z.string().uuid(), token_id: id, reaction: z.enum(['like','love','respect','hot','hundred','lol','sad','cry','poo','dislike']).nullable(),
}, 'dehub:social', async (a, ctx) => ctx.once('reaction', a.request_id, a, async () => {
  const current = unwrap(await api(ctx, `/post-reactions?tokenId=${a.token_id}`));
  const reaction = current.myReaction ?? null;
  if (reaction === a.reaction) return success({ success: true, skipped: true, reaction });
  const next = a.reaction || reaction;
  return success(await api(ctx, `/request_reaction?reaction=${enc(next)}`, 'POST', { streamTokenId: Number(a.token_id), reaction: next }));
}), { open: true });
tool('dehub_notifications', 'Read my notifications', 'Read the connected account\'s notifications. Reading does not mark them as read.', { page, limit, unread_only: z.boolean().default(false) }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/notification?page=${a.page}&limit=${a.limit}&unreadOnly=${a.unread_only}`)), { read: true });
tool('dehub_mark_notification_read', 'Mark a notification as read', 'Mark one of the connected account\'s notifications as read.', { notification_id: text(100) }, 'dehub:social', async (a, ctx) => success(await api(ctx, `/notification/${enc(a.notification_id)}`, 'PATCH', {})), { idempotent: true });
tool('dehub_bookmark_folders', 'List my bookmark folders', 'Read the connected account\'s bookmark folders and playlists.', {}, 'dehub:read', async (_, ctx) => success(await api(ctx, '/bookmark-folders')), { read: true });
tool('dehub_bookmark_items', 'Read a bookmark folder', 'Read posts saved in a folder accessible to the connected account.', { folder_id: text(100), page, limit }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/bookmark-folders/${enc(a.folder_id)}/items?page=${a.page}&limit=${a.limit}`)), { read: true });
tool('dehub_save_bookmark', 'Save a post to a folder', 'Save a post in an existing bookmark folder owned by the connected account.', { folder_id: text(100), token_id: id }, 'dehub:social', async (a, ctx) => success(await api(ctx, `/bookmark-folders/${enc(a.folder_id)}/items`, 'POST', { tokenId: Number(a.token_id) })));

tool('dehub_creator_models', 'Explore Creator Studio models', 'Discover image, video, audio and 3D model IDs and current prices from the same catalogue as DeHub web and mobile. Quote the chosen options before generating.', { kind: z.enum(['image','video','model3d','audio']) }, null, async a => {
  const costs = a.kind === 'image' ? IMAGE_COST_USD : a.kind === 'video' ? VIDEO_COST_USD : a.kind === 'model3d' ? MODEL3D_COST_USD : Object.fromEntries(['ace-step','minimax-music','dia-tts'].map(key => [key, TOOL_COST_USD[key]]));
  return success({ kind: a.kind, models: Object.keys(costs).map(model_id => {
    const v = CREATOR_FAL_VIDEO_MODELS[model_id];
    const options = v ? { durationSeconds: v.defaultDuration } : {};
    const price_dhb = quotePriceDhb(a.kind === 'audio' ? 'tool' : a.kind, model_id, options);
    return { model_id, price_dhb, price_usd: price_dhb === null ? null : dhbToUsd(price_dhb),
      ...(v ? { name: v.name, supports: v.supports, default_duration: v.defaultDuration, min_duration: v.minDuration, max_duration: v.maxDuration, allowed_durations: v.allowedDurations, aspect_ratios: v.aspectRatios, resolutions: v.resolutions } : {}),
      free_starter_eligible: a.kind === 'image' && IMAGE_COST_USD[model_id] <= 0.02 };
  }), creator_url: `${ORIGIN}/creator` });
}, { read: true });
tool('dehub_quote_generation', 'Quote a content generation', 'Get the current server price before spending credits or DHB. This does not generate or charge anything.', {
  kind: z.enum(['image','video','model3d','audio']), model_id: text(150), duration_seconds: z.number().min(1).max(600).optional(), quality: z.enum(['none','standard','HD']).optional(),
}, null, async (a, ctx) => success(await edge(ctx, 'ai-quote', { kind: a.kind === 'audio' ? 'tool' : a.kind, modelId: a.model_id, durationSeconds: a.duration_seconds, quality: a.quality })), { read: true });
tool('dehub_generate_content', 'Generate content in Creator Studio', 'Create an image, video, 3D model or music using the connected account\'s existing Creator service. Quote first, obtain the person\'s agreement to the cost, then choose credits, a confirmed DHB transfer, or an eligible free starter image. Reuse request_id on retries. Returns a job immediately for queued renders. Never publish automatically. Results use the same library as web and mobile.', {
  request_id: z.string().uuid(), kind: z.enum(['image','video','model3d','audio']), model_id: text(150), prompt: text(10000),
  payment: z.enum(['credits','transfer','free']), tx_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  max_price_dhb: z.number().finite().min(0).describe('Maximum DHB-equivalent price the person agreed to after seeing the quote. Use 0 for an eligible free image.'),
  source_image: media.optional(), aspect_ratio: z.enum(['21:9','16:9','4:3','1:1','3:4','9:16']).optional(),
  duration_seconds: z.number().int().min(1).max(600).optional(), resolution: text(30).optional(),
  quality: z.enum(['none','standard','HD']).optional().describe('3D texture quality; must match the quoted quality'),
}, 'dehub:generate', async (a, ctx) => {
  if (a.payment === 'transfer' && !a.tx_hash) throw new Error('Provide the confirmed DHB transfer hash.');
  if (a.payment !== 'transfer' && a.tx_hash) throw new Error('A transfer hash is only valid with transfer payment.');
  if (a.payment === 'free' && (a.kind !== 'image' || !(IMAGE_COST_USD[a.model_id] <= 0.02))) throw new Error('Only eligible starter image models accept free payment.');
  if (a.kind === 'audio' && !['ace-step','minimax-music','dia-tts'].includes(a.model_id)) throw new Error('Choose an audio model from dehub_creator_models.');
  if (quotePriceDhb(a.kind === 'audio' ? 'tool' : a.kind, a.model_id, { durationSeconds: a.duration_seconds }) === null) throw new Error('Unknown model. Read dehub_creator_models first.');
  return ctx.generate(a);
}, { destructive: true });
tool('dehub_generation_status', 'Check one of my content jobs', 'Read a job started through this connection. Call once when requested; if still running, return its state and avoid repeated polling. Does not create or charge another generation.', { job_id: z.string().uuid() }, 'dehub:read', async (a, ctx) => ctx.generationStatus(a.job_id), { read: true });
tool('dehub_creator_library', 'Read my Creator library', 'Read the connected account\'s saved images, videos, audio and 3D assets, shared with web and mobile. Media links expire; request the library again when needed.', { offset: z.number().int().min(0).max(10000).default(0) }, 'dehub:read', async (a, ctx) => success(await edge(ctx, 'creator-library', { action: 'list', offset: a.offset })), { read: true });

export const accountTools = tools;
const authError = scope => failure('Link your DeHub account to use this tool.', { connect_url: `${ORIGIN}/connect/chatgpt` });
export function challenge(scope = 'dehub:read') {
  return `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource", scope="${scope}"`;
}
export async function callAccountTool(name, input, ctx) {
  const t = tools.find(item => item.name === name);
  if (!t) return failure('Unknown DeHub tool.');
  let args;
  try { args = t.schema.parse(input); } catch (error) { return failure('Invalid tool arguments.', { issues: error.issues?.map(({ path, message }) => ({ path, message })) }); }
  if (t.scope && (!ctx.token || !ctx.scopes?.includes(t.scope))) return { ...authError(t.scope), _meta: { 'mcp/www_authenticate': [challenge(t.scope)] } };
  try { return await t.handler(args, ctx); }
  catch (error) {
    return { ...failure(error.message || 'DeHub could not complete this request.', error.details),
      ...([401,403].includes(error.status) ? { _meta: { 'mcp/www_authenticate': [challenge(t.scope)] } } : {}) };
  }
}

export function isAccountMcpRoute(path) {
  return path === '/mcp' || path.startsWith('/mcp/') || path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp' || path === '/.well-known/oauth-authorization-server' || path === '/.well-known/oauth-authorization-server/mcp';
}
export async function handleAccountMcp(request, env) {
  const url = new URL(request.url);
  if (url.hostname !== 'dehub.io') return json({ error: 'Use https://dehub.io/mcp' }, 404);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id', 'Access-Control-Expose-Headers': 'WWW-Authenticate' } });
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return json({ resource: RESOURCE, authorization_servers: [ORIGIN], scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_name: 'DeHub account' });
  if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) return json({ issuer: ORIGIN, authorization_endpoint: `${RESOURCE}/oauth/authorize`, token_endpoint: `${RESOURCE}/oauth/token`, registration_endpoint: `${RESOURCE}/oauth/register`, revocation_endpoint: `${RESOURCE}/oauth/revoke`, scopes_supported: SCOPES, response_types_supported: ['code'], grant_types_supported: ['authorization_code','refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'] });
  if (!env.ACCOUNT_MCP) return json({ error: 'Account connection is unavailable.' }, 503);
  try { return await env.ACCOUNT_MCP.get(env.ACCOUNT_MCP.idFromName('account-mcp-v1')).fetch(request); }
  catch { return json({ error: 'DeHub connection is temporarily unavailable.' }, 503); }
}
