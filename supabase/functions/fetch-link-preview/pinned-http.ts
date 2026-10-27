const MAX_BODY = 1_048_576;
const MAX_HEADERS = 65_536;

// A single-use HTTP/1.1 connection: no pooling, retries, redirects or DNS lookups.
// Keep framing and decoded data bounded independently, including tiny chunks.
export async function readHtmlResponse(conn: Pick<Deno.Conn, 'read'>) {
  const buffer = new Uint8Array(8192);
  let start = 0, end = 0, wireBytes = 0;
  async function fill() {
    const count = await conn.read(buffer);
    start = 0;
    end = count ?? 0;
    wireBytes += end;
    if (wireBytes > MAX_BODY * 2) throw new Error('Preview response is too large');
    return end !== 0;
  }
  async function line(limit: number): Promise<string> {
    let result = '';
    for (;;) {
      if (start === end && !await fill()) throw new Error('Truncated HTTP headers');
      const byte = buffer[start++];
      if (byte === 10) {
        if (!result.endsWith('\r')) throw new Error('Invalid HTTP line ending');
        return result.slice(0, -1);
      }
      if (result.length >= limit) throw new Error('HTTP headers are too large');
      result += String.fromCharCode(byte);
    }
  }
  let headerBytes = 0;
  async function headerLine() {
    const value = await line(Math.min(8192, MAX_HEADERS - headerBytes));
    headerBytes += value.length + 2;
    if (headerBytes > MAX_HEADERS) throw new Error('HTTP headers are too large');
    return value;
  }
  let status = 0;
  let headers = new Headers();
  for (let interim = 0; interim <= 4; interim++) {
    const match = /^HTTP\/1\.[01] ([1-5][0-9]{2})(?: [\x20-\x7e]*)?$/.exec(await headerLine());
    if (!match) throw new Error('Invalid HTTP status');
    status = Number(match[1]);
    headers = new Headers();
    for (;;) {
      const value = await headerLine();
      if (!value) break;
      const field = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[\t ]*([^\x00-\x08\x0a-\x1f\x7f]*)$/.exec(value);
      if (!field) throw new Error('Invalid HTTP header');
      const name = field[1].toLowerCase();
      if (headers.has(name) && ['content-length', 'transfer-encoding', 'location'].includes(name)) {
        throw new Error('Ambiguous HTTP framing');
      }
      headers.append(name, field[2].trim());
    }
    if (status >= 200) break;
    if (status === 101 || interim === 4) throw new Error('Unsupported HTTP upgrade or interim response');
  }
  if ([301, 302, 303, 307, 308].includes(status)) {
    return { status, location: headers.get('location') ?? undefined, html: '' };
  }
  if (status < 200 || status >= 300 || !/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(headers.get('content-type') ?? '')
    || !['', 'identity'].includes((headers.get('content-encoding') ?? '').toLowerCase())) {
    throw new Error('URL did not return an HTML page');
  }
  const length = headers.get('content-length');
  const transfer = headers.get('transfer-encoding');
  if ((length !== null && transfer !== null) || (transfer !== null && transfer.toLowerCase() !== 'chunked')) {
    throw new Error('Ambiguous or unsupported HTTP framing');
  }
  if (length !== null && !/^\d+$/.test(length)) {
    throw new Error('Preview page has an invalid length');
  }
  const body = new Uint8Array(MAX_BODY);
  let size = 0;
  // A preview only needs the head of the page, so a long page is cut at
  // MAX_BODY instead of refused. False once the budget is spent: stop reading.
  async function take(count: number): Promise<boolean> {
    while (count > 0) {
      if (size === MAX_BODY) return false;
      if (start === end && !await fill()) throw new Error('Truncated HTTP body');
      const n = Math.min(count, end - start, MAX_BODY - size);
      body.set(buffer.subarray(start, start + n), size);
      start += n; size += n; count -= n;
    }
    return size < MAX_BODY;
  }
  if (transfer !== null) {
    for (;;) {
      const chunk = await line(1024);
      if (!/^[0-9a-fA-F]+(?:;[\x20-\x7e]*)?$/.test(chunk)) throw new Error('Invalid HTTP chunk');
      const count = parseInt(chunk.split(';', 1)[0], 16);
      if (!Number.isSafeInteger(count)) throw new Error('Invalid HTTP chunk size');
      if (count === 0) {
        // Trailers cannot influence the already validated response headers.
        while (await headerLine()) { /* bounded by the shared header budget */ }
        break;
      }
      if (!await take(count)) break;
      if (await line(1) !== '') throw new Error('Invalid HTTP chunk ending');
    }
  } else if (length !== null) {
    await take(Number(length));
  } else {
    while (start !== end || await fill()) {
      if (!await take(end - start)) break;
    }
  }
  return { status, html: new TextDecoder().decode(body.subarray(0, size)) };
}

export async function pinnedHttp(url: URL, address: string, signal: AbortSignal, fresh = false) {
  let conn: Deno.Conn | undefined;
  const close = () => { try { conn?.close(); } catch { /* already closed */ } };
  signal.throwIfAborted();
  signal.addEventListener('abort', close, { once: true });
  try {
    const tcp = await Deno.connect({ hostname: address, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) });
    conn = tcp;
    signal.throwIfAborted();
    if (url.protocol === 'https:') {
      // Connect only to the vetted IP; verify the certificate and SNI against
      // the original hostname. Supported by the deployed Deno 2.1 runtime.
      conn = await Deno.startTls(tcp, { hostname: url.hostname.replace(/^\[|\]$/g, ''), alpnProtocols: ['http/1.1'] });
      signal.throwIfAborted();
    }
    const request = new TextEncoder().encode(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nUser-Agent: DeHubLinkPreview/1.0\r\nAccept: text/html,application/xhtml+xml\r\nAccept-Encoding: identity\r\n${fresh ? 'Cache-Control: no-cache\r\nPragma: no-cache\r\n' : ''}Connection: close\r\n\r\n`);
    let sent = 0;
    while (sent < request.length) sent += await conn.write(request.subarray(sent));
    return await readHtmlResponse(conn);
  } finally {
    signal.removeEventListener('abort', close);
    close();
  }
}
