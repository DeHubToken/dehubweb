import assert from 'node:assert/strict';
import { Miniflare, WorkerResponse, convertV4MiniflareOptions, productionWorkerModules } from './worker-bundle.mjs';

let redirectQuote = false;
const outbound = [];
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: await productionWorkerModules(), compatibilityDate: '2026-07-18',
  durableObjects: { ACCOUNT_MCP: { className: 'AccountMcpAuth', useSQLite: true } },
  outboundService: async request => {
    outbound.push(request.url);
    assert.equal(request.url, 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/ai-quote');
    assert.equal(request.method, 'POST');
    assert.deepEqual(await request.json(), { kind: 'image', modelId: 'flux-2-pro' });
    if (redirectQuote) return new WorkerResponse(null, { status: 302, headers: { Location: 'https://untrusted.example/quote' } });
    return new WorkerResponse(JSON.stringify({ priceDhb: 36, priceUsd: 0.036 }), { headers: { 'Content-Type': 'application/json' } });
  },
}));
async function rpc(method, params) {
  const response = await mf.dispatchFetch('https://dehub.io/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  assert.equal(response.status, 200);
  return (await response.json()).result;
}
try {
  const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'runtime-check', version: '1' } });
  assert.equal(initialized.serverInfo.version, '3.0.0');
  const tools = await rpc('tools/list', {});
  assert.ok(tools.tools.some(tool => tool.name === 'dehub_generate_content'));
  const input = { name: 'dehub_quote_generation', arguments: { kind: 'image', model_id: 'flux-2-pro' } };
  const quote = await rpc('tools/call', input);
  assert.notEqual(quote.isError, true, JSON.stringify(quote));
  assert.equal(quote.structuredContent.priceDhb, 36);
  redirectQuote = true;
  const redirected = await rpc('tools/call', input);
  assert.equal(redirected.isError, true);
  assert.equal(outbound.length, 2, 'A quote redirect must never be followed');
  const account = await rpc('tools/call', { name: 'dehub_account', arguments: {} });
  assert.equal(account.isError, true);
  assert.ok(account._meta['mcp/www_authenticate']);
  console.log('Production Worker MCP quotes use supported fetch options, refuse redirects and require account authentication.');
} finally { await mf.dispose(); }
