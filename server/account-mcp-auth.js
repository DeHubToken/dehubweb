import { API, ORIGIN, RESOURCE, SCOPES, accountTools, callAccountTool, challenge, edge, hash, json, pkce, random, readJson, verifySession } from './account-mcp.js';

const HOUR = 3600000, DAY = 24 * HOUR;
// A grant stays linked while it is used: each refresh pushes the deadline out.
const GRANT_TTL = 30 * DAY;
// DeHub access tokens last 15 minutes, so rotate the connector's own session early.
const SESSION_REFRESH_AFTER = 12 * 60000;
const oauthError = (message, code = 'invalid_request', status = 400) => json({ error: code, error_description: message }, status);
const result = payload => ({ content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload });
const fail = message => ({ ...result({ error: message }), isError: true });
const publicOutput = data => Object.fromEntries(['imageUrl','videoUrl','audioUrl','modelUrl','previewImageUrl','transcript','text','status','error','libraryId','paymentRestored','savePending'].filter(key => data?.[key] !== undefined).map(key => [key, data[key]]));
export function validRedirect(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.hash && !u.port && value.length <= 2048; } catch { return false; }
}
const live = row => row && row.expires > Date.now() ? row.value : null;
const record = (value, ttl) => ({ value, expires: Date.now() + ttl });
// Clients may omit the RFC 8707 resource or add a trailing slash; anything else is refused.
const resourceOk = value => value === null || value.replace(/\/$/, '') === RESOURCE;
// dehub.io reaches the Worker through the direct gateway, so CF-Connecting-IP is the
// gateway for every visitor. The gateway sets X-Real-IP; only used for rate limits.
const clientIp = request => (request.headers.get('X-DeHub-Public-Host') === 'dehub.io' && request.headers.get('X-Real-IP')) || request.headers.get('CF-Connecting-IP') || 'unknown';
const scopeList = value => [...new Set(String(value || '').split(' ').filter(Boolean))];

// Only this Durable Object can read connection credentials. Nothing uses a caller-
// supplied wallet as identity. OAuth codes and bearer credentials are stored hashed.
export class AccountMcpAuth {
  constructor(state, _env, fetcher = (...args) => fetch(...args)) { this.state = state; this.store = state.storage; this.fetcher = fetcher; }
  async get(key) { return live(await this.store.get(key)); }
  async put(key, value, ttl) {
    await this.store.put(key, record(value, ttl));
    if (!await this.store.getAlarm()) await this.store.setAlarm(Date.now() + HOUR);
  }
  async alarm() {
    const cursor = await this.store.get('_gc');
    const rows = await this.store.list({ ...(cursor ? { startAfter: cursor } : {}), limit: 256 });
    const expired = [...rows].filter(([key, row]) => key !== '_gc' && row.expires <= Date.now()).map(([key]) => key);
    if (expired.length) await this.store.delete(expired);
    if (rows.size === 256) await this.store.put('_gc', [...rows.keys()].at(-1)); else await this.store.delete('_gc');
    await this.store.setAlarm(Date.now() + (rows.size === 256 ? 60000 : HOUR));
  }
  async budget(key, limit, window = 60000) {
    return this.store.transaction(async tx => {
      const previous = live(await tx.get(`rate:${key}`)) || 0;
      if (previous >= limit) return false;
      const current = await tx.get(`rate:${key}`);
      await tx.put(`rate:${key}`, { value: previous + 1, expires: current?.expires > Date.now() ? current.expires : Date.now() + window });
      return true;
    });
  }
  async consume(key, validate) {
    return this.store.transaction(async tx => {
      const value = live(await tx.get(key));
      if (!value || !validate(value)) return null;
      await tx.delete(key);
      return value;
    });
  }
  async bearer(request) {
    const raw = request.headers.get('Authorization') || '';
    if (!raw) return null;
    const match = /^Bearer (dhm_[a-f0-9]{64})$/i.exec(raw);
    if (!match) throw new Error('Invalid connection token.');
    const access = await this.get(`access:${await hash(match[1])}`);
    const grant = access && await this.get(`grant:${access.grant}`);
    if (!grant) throw new Error('Expired or revoked connection. Link your DeHub account again.');
    const current = await this.fresh(access.grant, grant);
    if (await verifySession(current.token, this.fetcher) !== current.wallet) throw new Error('DeHub session changed. Link your account again.');
    return { ...current, id: access.grant };
  }
  // The connector gets its own DeHub session (listed in Active sessions) so it
  // outlives the 15 minute browser token it was approved with. Older backends
  // without the endpoint fall back to that browser token.
  async connectorSession(token, clientName) {
    try {
      const response = await this.fetcher(`${API}/auth/connector-session`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName }), signal: AbortSignal.timeout(12000) });
      const data = response.ok ? await response.json() : null;
      if (typeof data?.token === 'string' && typeof data?.refreshToken === 'string') return { token: data.token, session: data.refreshToken, at: Date.now() };
    } catch { /* fall back below */ }
    return { token, session: null, at: Date.now() };
  }
  // Rotates the connector's DeHub session once per grant at a time; concurrent
  // callers share the same rotation so a refresh token is never used twice.
  async fresh(grantId, grant) {
    if (!grant.session || Date.now() - grant.at < SESSION_REFRESH_AFTER) return grant;
    this.rotations ??= new Map();
    let rotation = this.rotations.get(grantId);
    if (!rotation) {
      rotation = (async () => {
        const current = await this.get(`grant:${grantId}`);
        if (!current?.session || Date.now() - current.at < SESSION_REFRESH_AFTER) return current || grant;
        try {
          const response = await this.fetcher(`${API}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: current.session }), signal: AbortSignal.timeout(12000) });
          const data = await response.json().catch(() => null);
          if (!response.ok || typeof data?.accessToken !== 'string' || typeof data?.refreshToken !== 'string') return current;
          const next = { ...current, token: data.accessToken, session: data.refreshToken, at: Date.now() };
          await this.put(`grant:${grantId}`, next, Math.max(1, next.deadline - Date.now()));
          return next;
        } catch { return current; }
      })().finally(() => this.rotations.delete(grantId));
      this.rotations.set(grantId, rotation);
    }
    return rotation;
  }
  async issue(grantId, grant) {
    const access = `dhm_${random()}`, refresh = `dhr_${random()}`;
    await this.put(`access:${await hash(access)}`, { grant: grantId }, HOUR);
    await this.put(`refresh:${await hash(refresh)}`, { grant: grantId, client: grant.client }, Math.max(1, grant.deadline - Date.now()));
    return { access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh, scope: grant.scopes.join(' ') };
  }
  async once(wallet, kind, id, args, operation) {
    const key = `operation:${wallet}:${kind}:${id}`, fingerprint = await hash(JSON.stringify(args));
    const claimed = await this.store.transaction(async tx => {
      const previous = live(await tx.get(key));
      if (previous) return previous;
      await tx.put(key, record({ fingerprint, pending: true }, DAY));
      return null;
    });
    if (claimed) {
      if (claimed.fingerprint !== fingerprint) return fail('That request_id is already assigned to different content.');
      return claimed.result || result({ request_id: id, status: 'pending', message: 'Already submitted. Check its status or your library; do not submit it again.' });
    }
    let response;
    try { response = await operation(); }
    catch (error) { response = { ...fail(error.message || 'Request outcome is unknown. Check DeHub before retrying.'), ...(error.details ? { structuredContent: { error: error.message, ...error.details } } : {}), ...([401,403].includes(error.status) ? { _meta: { 'mcp/www_authenticate': [challenge()] } } : {}) }; }
    await this.put(key, { fingerprint, result: response }, DAY);
    return response;
  }
  async generate(args, ctx) {
    return this.once(ctx.wallet, 'generation', args.request_id, args, async () => {
      const endpoint = { image: 'generate-image', video: 'generate-video', model3d: 'generate-3d', audio: 'fal-ai-tools' }[args.kind];
      if (args.payment !== 'free') {
        const quote = await edge(ctx, 'ai-quote', { kind: args.kind === 'audio' ? 'tool' : args.kind, modelId: args.model_id, durationSeconds: args.duration_seconds, quality: args.quality });
        if (!Number.isFinite(quote.priceDhb) || quote.priceDhb > args.max_price_dhb) return fail('The current price exceeds the agreed maximum. Get a new quote and agreement before submitting a new request.');
      }
      const body = { clientJobId: args.request_id, model: args.model_id, prompt: args.prompt,
        ...(args.kind === 'audio' ? { tool: args.model_id } : {}),
        ...(args.source_image ? { sourceImage: args.source_image } : {}),
        ...(args.aspect_ratio ? { aspectRatio: args.aspect_ratio } : {}),
        ...(args.resolution ? { resolution: args.resolution } : {}),
        ...(args.quality ? { textureQuality: args.quality } : {}),
        ...(args.duration_seconds ? { duration: args.kind === 'video' ? `${args.duration_seconds}s` : args.duration_seconds } : {}),
        ...(args.payment === 'credits' ? { paySource: 'credits', txHash: 'credits' } : args.payment === 'free' ? { useFree: true } : { txHash: args.tx_hash }),
      };
      const key = `job:${ctx.wallet}:${args.request_id}`;
      await this.put(key, { endpoint, status: 'submitting' }, DAY);
      try {
        const data = await edge(ctx, endpoint, body);
        // Free images have no paid-job journal. Save them through the same
        // private library protocol as both apps, so chat creations survive.
        if (args.payment === 'free' && data.imageUrl) {
          try { await this.saveImage(args, data, ctx); }
          catch { data.savePending = true; }
        }
        await this.put(key, { endpoint, data, status: data.predictionId || data.requestId ? 'processing' : 'succeeded' }, DAY);
        const output = publicOutput(data);
        if (output.imageUrl?.startsWith('data:')) { delete output.imageUrl; output.savePending = true; }
        return result({ job_id: args.request_id, status: data.predictionId || data.requestId ? 'processing' : 'succeeded', ...output, creator_url: `${ORIGIN}/creator` });
      } catch (error) {
        // A dropped response can follow a successful provider submission. Never
        // start a second paid job to discover what happened to the first one.
        await this.put(key, { endpoint, status: 'unknown', error: error.message }, DAY);
        throw error;
      }
    });
  }
  async saveImage(args, data, ctx) {
    const prepared = await edge(ctx, 'creator-library', { action: 'prepare', id: args.request_id,
      metadata: { kind: 'image', prompt: args.prompt, model: args.model_id, modelName: args.model_id, createdAt: Date.now() } });
    if (!prepared.saved) {
      let bytes, contentType;
      if (data.imageUrl.startsWith('data:')) {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data.imageUrl);
        if (!match || match[2].length > 20 * 1024 * 1024) throw new Error('Invalid generated image');
        contentType = match[1]; bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
      } else {
        // This URL is returned by our generation endpoint, never a tool input.
        const url = new URL(data.imageUrl);
        if (url.protocol !== 'https:') throw new Error('Invalid generated image');
        const response = await ctx.fetch(url.href, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
        contentType = response.headers.get('Content-Type') || '';
        if (!response.ok || !contentType.startsWith('image/') || Number(response.headers.get('Content-Length')) > 15 * 1024 * 1024) throw new Error('Could not save generated image');
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 15 * 1024 * 1024) throw new Error('Image too large'); chunks.push(value); } }
        finally { await reader.cancel().catch(() => {}); }
        bytes = new Blob(chunks, { type: contentType });
      }
      if (prepared.path !== `${ctx.wallet}/${args.request_id}/original` || typeof prepared.token !== 'string') throw new Error('Invalid library upload');
      const upload = await ctx.fetch(`https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/upload/sign/creator-assets/${prepared.path}?token=${encodeURIComponent(prepared.token)}`, {
        method: 'PUT', headers: { 'Content-Type': contentType, 'x-upsert': 'true' }, body: bytes,
      });
      if (!upload.ok) throw new Error('Library upload failed');
      await edge(ctx, 'creator-library', { action: 'complete', id: args.request_id });
    }
    const library = await edge(ctx, 'creator-library', { action: 'list', offset: 0 });
    const asset = library.jobs?.find(job => job.id === args.request_id);
    if (!asset?.url) throw new Error('Saved image is not available yet');
    data.imageUrl = asset.url; data.libraryId = args.request_id;
  }
  async generationStatus(id, ctx) {
    const key = `job:${ctx.wallet}:${id}`, job = await this.get(key);
    if (!job) return fail('No job with this ID belongs to this account connection.');
    if (job.status !== 'processing') {
      const output = publicOutput(job.data);
      if (output.imageUrl?.startsWith('data:')) { delete output.imageUrl; output.savePending = true; }
      return result({ job_id: id, status: job.status, ...output, ...(job.error ? { error: job.error } : {}), creator_url: `${ORIGIN}/creator` });
    }
    const data = job.data;
    const ticket = job.endpoint === 'fal-ai-tools'
      ? { requestId: data.requestId, appId: data.appId, statusUrl: data.statusUrl, responseUrl: data.responseUrl }
      : { predictionId: data.predictionId, provider: data.provider, falAppId: data.falAppId };
    const response = await edge(ctx, job.endpoint, ticket);
    const status = response.status || 'processing';
    if (['succeeded','failed','canceled','cancelled'].includes(status)) await this.put(key, { ...job, status, data: response }, DAY);
    return result({ job_id: id, ...publicOutput(response), creator_url: `${ORIGIN}/creator` });
  }
  async oauth(request, url) {
    const route = url.pathname.slice('/mcp/oauth/'.length);
    if (route === 'register' && request.method === 'POST') {
      const ip = clientIp(request);
      // Chat apps register from shared server addresses, so allow a few per minute.
      if (!await this.budget(`register:${await hash(ip)}`, 60, HOUR)) return oauthError('Registration rate limit reached.', 'temporarily_unavailable', 429);
      const input = await request.json();
      if (!Array.isArray(input.redirect_uris) || !input.redirect_uris.length || input.redirect_uris.length > 5 || !input.redirect_uris.every(validRedirect)) return oauthError('Register 1-5 exact HTTPS callback URLs.');
      const client_id = random(), client_name = String(input.client_name || 'DeHub connection').slice(0, 100);
      await this.put(`client:${client_id}`, { redirects: input.redirect_uris, name: client_name }, 90 * DAY);
      return json({ client_id, client_name, redirect_uris: input.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code','refresh_token'], response_types: ['code'], scope: SCOPES.join(' ') }, 201);
    }
    if (route === 'authorize' && request.method === 'GET') {
      const client = await this.get(`client:${url.searchParams.get('client_id')}`);
      const redirect = url.searchParams.get('redirect_uri');
      // Never redirect an OAuth error until the client's exact callback is known.
      if (!client || !client.redirects.includes(redirect)) return oauthError('Unknown client or callback URL.');
      if (url.searchParams.get('response_type') !== 'code' || url.searchParams.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code_challenge') || '')) return oauthError('Authorization code with S256 PKCE is required.');
      if (!resourceOk(url.searchParams.get('resource'))) return oauthError('The resource must be https://dehub.io/mcp.', 'invalid_target');
      const scopes = scopeList(url.searchParams.get('scope') || SCOPES.join(' '));
      if (!scopes.length || scopes.some(s => !SCOPES.includes(s))) return oauthError('Unsupported permission requested.', 'invalid_scope');
      const ip = await hash(clientIp(request));
      if (!await this.budget(`authorize:${ip}`, 30)) return oauthError('Please wait before connecting again.', 'temporarily_unavailable', 429);
      const pending = random();
      await this.put(`pending:${pending}`, { client: url.searchParams.get('client_id'), clientName: client.name, redirect, scopes,
        challenge: url.searchParams.get('code_challenge'), state: (url.searchParams.get('state') || '').slice(0, 2048), resource: RESOURCE }, 10 * 60000);
      return new Response(null, { status: 302, headers: { Location: `${ORIGIN}/connect/chatgpt?authorization=${pending}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    if (route === 'request' && request.method === 'GET') {
      const pending = await this.get(`pending:${url.searchParams.get('id')}`);
      return pending ? json({ client_name: pending.clientName, callback_origin: new URL(pending.redirect).origin, scopes: pending.scopes }) : oauthError('Connection request expired. Start again from your chat app.');
    }
    if (['approve','connections','disconnect'].includes(route)) {
      if (request.method !== 'POST' || request.headers.get('Origin') !== ORIGIN) return oauthError('Open this connection on dehub.io.', 'access_denied', 403);
      const token = request.headers.get('x-dehub-token') || '';
      if (!token || token.length > 8192) return oauthError('Sign in to DeHub first.', 'access_denied', 401);
      const wallet = await verifySession(token, this.fetcher);
      if (request.headers.get('x-wallet-address')?.toLowerCase() && request.headers.get('x-wallet-address').toLowerCase() !== wallet) return oauthError('The selected account changed. Reload and try again.', 'access_denied', 403);
      if (!await this.budget(`manage:${wallet}`, 30)) return oauthError('Please wait before changing connections.', 'temporarily_unavailable', 429);
      const input = await request.json();
      if (route === 'connections') {
        const rows = await this.store.list({ prefix: `owner:${wallet}:`, limit: 100 });
        const connections = [];
        for (const [key, row] of rows) {
          const grant = live(row) && await this.get(`grant:${row.value}`);
          if (grant) connections.push({ id: row.value, client_name: grant.clientName, scopes: grant.scopes, expires_at: grant.deadline });
          else await this.store.delete(key);
        }
        return json({ connections });
      }
      if (route === 'disconnect') {
        const grant = await this.get(`grant:${input.id}`);
        if (grant?.wallet === wallet) { await this.store.delete(`grant:${input.id}`); await this.store.delete(`owner:${wallet}:${input.id}`); }
        return json({ disconnected: true });
      }
      const pending = await this.consume(`pending:${input.request_id}`, () => true);
      if (!pending) return oauthError('Connection request expired or already used.');
      const target = new URL(pending.redirect);
      if (pending.state) target.searchParams.set('state', pending.state);
      if (input.approve !== true) { target.searchParams.set('error', 'access_denied'); return json({ redirect: target.href }); }
      const code = random();
      await this.put(`code:${await hash(code)}`, { ...pending, wallet, token }, 60000);
      target.searchParams.set('code', code);
      return json({ redirect: target.href });
    }
    if (route === 'token' && request.method === 'POST') {
      const body = new URLSearchParams(await request.text());
      if (!resourceOk(body.get('resource'))) return oauthError('Wrong resource.', 'invalid_target');
      if (!/^[a-f0-9]{64}$/.test(body.get('client_id') || '')) return oauthError('Unknown client.', 'invalid_client');
      if (body.get('grant_type') === 'authorization_code') {
        const verifier = body.get('code_verifier') || '';
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return oauthError('Invalid PKCE verifier.', 'invalid_grant');
        const digest = await pkce(verifier);
        const code = await this.consume(`code:${await hash(body.get('code') || '')}`, row => row.client === body.get('client_id') && row.redirect === body.get('redirect_uri') && row.challenge === digest && row.resource === RESOURCE);
        if (!code) return oauthError('Invalid or used authorization code.', 'invalid_grant');
        const session = await this.connectorSession(code.token, code.clientName);
        const grantId = random(), grant = { client: code.client, clientName: code.clientName, wallet: code.wallet, ...session, scopes: code.scopes, deadline: Date.now() + GRANT_TTL };
        await this.put(`grant:${grantId}`, grant, GRANT_TTL);
        await this.put(`owner:${grant.wallet}:${grantId}`, grantId, GRANT_TTL);
        return json(await this.issue(grantId, grant));
      }
      if (body.get('grant_type') === 'refresh_token') {
        const refresh = await this.consume(`refresh:${await hash(body.get('refresh_token') || '')}`, row => row.client === body.get('client_id'));
        const stored = refresh && await this.get(`grant:${refresh.grant}`);
        if (!stored) return oauthError('Connection expired or revoked.', 'invalid_grant');
        const grant = { ...await this.fresh(refresh.grant, stored), deadline: Date.now() + GRANT_TTL };
        if (body.has('scope') && body.get('scope') !== grant.scopes.join(' ')) return oauthError('Reconnect to change permissions.', 'invalid_scope');
        if (await verifySession(grant.token, this.fetcher) !== grant.wallet) return oauthError('Sign in again.', 'invalid_grant');
        await this.put(`grant:${refresh.grant}`, grant, GRANT_TTL);
        await this.put(`owner:${grant.wallet}:${refresh.grant}`, refresh.grant, GRANT_TTL);
        return json(await this.issue(refresh.grant, grant));
      }
      return oauthError('Unsupported grant type.', 'unsupported_grant_type');
    }
    if (route === 'revoke' && request.method === 'POST') {
      const body = new URLSearchParams(await request.text()), token = body.get('token') || '';
      const row = await this.get(`${token.startsWith('dhr_') ? 'refresh' : 'access'}:${await hash(token)}`);
      const grant = row && await this.get(`grant:${row.grant}`);
      if (grant && (!body.get('client_id') || grant.client === body.get('client_id'))) { await this.store.delete(`grant:${row.grant}`); await this.store.delete(`owner:${grant.wallet}:${row.grant}`); }
      return json({});
    }
    return oauthError('Unknown connection route.', 'invalid_request', 404);
  }
  async fetch(request) {
    try {
      if (Number(request.headers.get('Content-Length')) > 65536) return json({ error: 'Request is too large.' }, 413);
      const url = new URL(request.url);
      if (url.pathname.startsWith('/mcp/oauth/')) return await this.oauth(request, url);
      if (url.pathname === '/mcp/health' && request.method === 'GET') return json({ status: 'ok', version: '3.0.0', tools: accountTools.length });
      if (url.pathname !== '/mcp') return json({ error: 'Unknown route.' }, 404);
      if (request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html')) return new Response(null, { status: 302, headers: { Location: `${ORIGIN}/connect`, 'Cache-Control': 'no-store' } });
      if (request.method !== 'POST') return json({ error: 'Use Streamable HTTP POST.' }, 405, { Allow: 'POST, OPTIONS' });
      let grant;
      try { grant = await this.bearer(request); } catch { return json({ error: 'Link your DeHub account again.' }, 401, { 'WWW-Authenticate': challenge() }); }
      const raw = await request.text();
      if (raw.length > 65536) return json({ error: 'Request is too large.' }, 413);
      let rpc;
      try { rpc = JSON.parse(raw); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }, 400); }
      if (!rpc || Array.isArray(rpc) || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC request' } }, 400);
      if (rpc.method.startsWith('notifications/') && rpc.id === undefined) return new Response(null, { status: 202 });
      const reply = value => json({ jsonrpc: '2.0', id: rpc.id ?? null, result: value });
      if (rpc.method === 'initialize') return reply({ protocolVersion: ['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(rpc.params?.protocolVersion) ? rpc.params.protocolVersion : '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'dehub-mcp', title: 'DeHub', version: '3.0.0' },
        instructions: 'Browse DeHub publicly. Link an account to manage its profile, posts, relationships, bookmarks, notifications and Creator library. Confirm the connected identity before writes. Discover models and quote before generating; obtain agreement to costs. Never publish a generated asset without a request to publish. Reuse request_id for retries. Read generation status only when needed; never poll repeatedly. Account connections renew while used, expire after 30 days unused, and can be disconnected on dehub.io/connect/chatgpt.' });
      if (rpc.method === 'ping') return reply({});
      if (rpc.method === 'tools/list') return reply({ tools: accountTools.map(t => t.descriptor) });
      if (['resources/list','resources/templates/list','prompts/list'].includes(rpc.method)) return reply({ [rpc.method === 'resources/templates/list' ? 'resourceTemplates' : rpc.method.split('/')[0]]: [] });
      if (rpc.method !== 'tools/call') return json({ jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32601, message: 'Method not found' } });
      if (!await this.budget(`tools:${grant?.wallet || await hash(clientIp(request))}`, grant ? 120 : 60)) return reply(fail('Rate limit reached. Please wait a minute.'));
      const ctx = { fetch: this.fetcher, token: grant?.token || '', wallet: grant?.wallet, scopes: grant?.scopes || [],
        once: (kind, id, args, operation) => this.once(grant.wallet, kind, id, args, operation),
        generate: args => this.generate(args, ctx), generationStatus: id => this.generationStatus(id, ctx) };
      return reply(await callAccountTool(rpc.params?.name, rpc.params?.arguments ?? {}, ctx));
    } catch (error) {
      return oauthError('The connection service could not complete this request. Sign in again if your session expired.', 'temporarily_unavailable', 503);
    }
  }
}
