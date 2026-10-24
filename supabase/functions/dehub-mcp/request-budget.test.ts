import { boundMcpRequest } from './request-budget.ts';

function assert(ok: unknown, message = 'Assertion failed'): asserts ok {
  if (!ok) throw new Error(message);
}
function post(body: unknown) {
  return new Request('https://example.test/mcp', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

Deno.test('normal MCP envelopes retain exact bytes, URL, and authentication headers', async () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'post_create', arguments: { content: 'Hello 🌍' } } });
  const request = new Request('https://example.test/mcp?test=1', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-dehub-api-key': 'fixture-only' } });
  const result = await boundMcpRequest(request);
  assert(result instanceof Request);
  assert(result.url === request.url && result.headers.get('x-dehub-api-key') === 'fixture-only');
  assert(await result.text() === body);
});

Deno.test('GET/SSE requests pass through untouched', async () => {
  const request = new Request('https://example.test/mcp', { headers: { accept: 'text/event-stream' } });
  assert(await boundMcpRequest(request) === request);
});

Deno.test('oversized declared bodies are rejected before reading', async () => {
  let read = false;
  const body = new ReadableStream({ pull() { read = true; } }, { highWaterMark: 0 });
  const request = new Request('https://example.test/mcp', { method: 'POST', body, headers: { 'content-length': '262145' } });
  const result = await boundMcpRequest(request);
  assert(result instanceof Response && result.status === 413);
  assert(!read);
  await body.cancel();
});

Deno.test('chunked requests cannot bypass the byte limit', async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(131072)); controller.enqueue(new Uint8Array(131073)); controller.close(); } });
  const result = await boundMcpRequest(new Request('https://example.test/mcp', { method: 'POST', body }));
  assert(result instanceof Response && result.status === 413);
});

Deno.test('oversized collections and aggregate node counts are rejected before schema validation', async () => {
  for (const value of [Array(4097).fill(false), Array.from({ length: 4 }, () => Array(3000).fill(false))]) {
    const result = await boundMcpRequest(post({ params: { arguments: value } }));
    assert(result instanceof Response && result.status === 413);
  }
});

Deno.test('deep nesting is rejected without recursive traversal', async () => {
  let value: unknown = null;
  for (let i = 0; i < 34; i++) value = { next: value };
  const result = await boundMcpRequest(post(value));
  assert(result instanceof Response && result.status === 413);
});

Deno.test('malformed JSON is a client error', async () => {
  const result = await boundMcpRequest(new Request('https://example.test/mcp', { method: 'POST', body: '{' }));
  assert(result instanceof Response && result.status === 400);
});
