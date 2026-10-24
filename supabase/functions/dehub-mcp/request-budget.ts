const MAX_BODY_BYTES = 256 * 1024;
const MAX_NODES = 10_000;
const MAX_DEPTH = 32;
const MAX_COLLECTION = 4096;

function withinBudget(value: unknown): boolean {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++nodes > MAX_NODES || item.depth > MAX_DEPTH) return false;
    if (item.value !== null && typeof item.value === 'object') {
      const children = Object.values(item.value);
      if (children.length > MAX_COLLECTION || nodes + pending.length + children.length > MAX_NODES) return false;
      for (const child of children) pending.push({ value: child, depth: item.depth + 1 });
    }
  }
  return true;
}

function rejected(status: number, message: string): Response {
  return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message } }, { status });
}

// Bound untrusted input before the SDK or schema validator can allocate an
// error for every item. GET/SSE requests and their streaming responses pass through.
export async function boundMcpRequest(request: Request): Promise<Request | Response> {
  if (request.method !== 'POST') return request;
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) return rejected(413, 'Request body is too large');
  const reader = request.body?.getReader();
  if (!reader) return rejected(400, 'Invalid JSON body');
  const buffer = new Uint8Array(MAX_BODY_BYTES);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return rejected(413, 'Request body is too large');
      }
      buffer.set(value, size);
      size += value.byteLength;
    }
  } catch {
    return rejected(400, 'Could not read request body');
  } finally {
    reader.releaseLock();
  }
  const bytes = buffer.subarray(0, size);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return rejected(400, 'Invalid JSON body'); }
  if (!withinBudget(value)) return rejected(413, 'Request structure is too complex');
  return new Request(request, { body: bytes });
}
