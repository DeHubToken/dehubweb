import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pinnedHttp, readHtmlResponse } from './pinned-http.ts';

function response(value: string, fragment = 37) {
  const bytes = new TextEncoder().encode(value);
  let offset = 0;
  return { read(buffer: Uint8Array): Promise<number | null> {
    if (offset === bytes.length) return Promise.resolve(null);
    const count = Math.min(fragment, buffer.length, bytes.length - offset);
    buffer.set(bytes.subarray(offset, offset + count)); offset += count;
    return Promise.resolve(count);
  } };
}
const headers = 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n';
Deno.test('parses bounded fixed, EOF and chunked HTML across read boundaries', async () => {
  for (const wire of [
    headers + 'Content-Length: 5\r\n\r\nhello',
    headers + '\r\nhello',
    headers + 'Transfer-Encoding: chunked\r\n\r\n2;foo=bar\r\nhe\r\n3\r\nllo\r\n0\r\nX-Trailer: ignored\r\n\r\n',
    'HTTP/1.1 103 Early Hints\r\nLink: </style.css>\r\n\r\n' + headers + 'Content-Length: 5\r\n\r\nhello',
  ]) assertEquals((await readHtmlResponse(response(wire, 1))).html, 'hello');
});
Deno.test('rejects ambiguous, truncated, compressed and oversized responses', async () => {
  for (const suffix of [
    'Content-Length: 5\r\nContent-Length: 5\r\n\r\nhello',
    'Content-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\nhello',
    'Content-Length: -1\r\n\r\n',
    'Content-Length: 6\r\n\r\nhello',
    'Content-Length: 1048577\r\n\r\n',
    'Content-Encoding: gzip\r\n\r\n',
    'Transfer-Encoding: gzip, chunked\r\n\r\n',
    'Transfer-Encoding: chunked\r\n\r\n3\r\nhi',
    'Transfer-Encoding: chunked\r\n\r\n-1\r\n',
    'Transfer-Encoding: chunked\r\n\r\n100001\r\n',
    'Transfer-Encoding: chunked\r\n\r\n1\r\nxBAD\r\n0\r\n\r\n',
    'X-Large: ' + 'x'.repeat(8193) + '\r\n\r\n',
    '\r\n' + 'x'.repeat(1048577),
  ]) await assertRejects(() => readHtmlResponse(response(headers + suffix, 8192)));
  await assertRejects(() => readHtmlResponse(response('HTTP/1.1 101 Switching Protocols\r\n\r\n')));
  await assertRejects(() => readHtmlResponse(response('HTTP/1.1 200 OK\nContent-Type: text/html\n\n')));
});
Deno.test('redirects return before reading a potentially unbounded body', async () => {
  const result = await readHtmlResponse(response('HTTP/1.1 302 Found\r\nLocation: https://example.com/next\r\n\r\n'));
  assertEquals(result, {status:302, location:'https://example.com/next', html:''});
});
Deno.test('native TLS pins the IP, preserves Host and verifies the original certificate name', async () => {
  const cert = Deno.env.get('PREVIEW_TLS_CERT');
  const key = Deno.env.get('PREVIEW_TLS_KEY');
  if (!cert || !key) throw new Error('TLS fixture must be configured');
  const listener = Deno.listenTls({ hostname:'127.0.0.1', port:0, cert:Deno.readTextFileSync(cert), key:Deno.readTextFileSync(key), alpnProtocols:['http/1.1'] });
  const { port } = listener.addr;
  const connections = new Set<Deno.Conn>();
  const handlers: Promise<void>[] = [];
  const serving = (async () => {
    try {
      for await (const conn of listener) {
        connections.add(conn);
        handlers.push((async () => {
          try {
            const buffer = new Uint8Array(8192);
            let request = '';
            while (!request.includes('\r\n\r\n')) {
              const count = await conn.read(buffer);
              if (count === null) return;
              request += new TextDecoder().decode(buffer.subarray(0, count));
            }
            assertEquals(request.includes(`\r\nHost: localhost:${port}\r\n`), true);
            const wire = new TextEncoder().encode(headers + 'Content-Length: 2\r\n\r\nok');
            let sent = 0;
            while (sent < wire.length) sent += await conn.write(wire.subarray(sent));
          } catch (error) {
            if (error instanceof Deno.errors.InvalidData || error instanceof Deno.errors.BadResource || error instanceof Deno.errors.Interrupted || error instanceof Deno.errors.ConnectionReset || error instanceof Deno.errors.UnexpectedEof) return;
            throw error;
          } finally { connections.delete(conn); try { conn.close(); } catch { /* closed */ } }
        })());
      }
    } catch (error) { if (!(error instanceof Deno.errors.BadResource)) throw error; }
  })();
  try {
    assertEquals((await pinnedHttp(new URL(`https://localhost:${port}`), '127.0.0.1', AbortSignal.timeout(3000))).html, 'ok');
    await assertRejects(() => pinnedHttp(new URL(`https://wrong-name.invalid:${port}`), '127.0.0.1', AbortSignal.timeout(3000)));
  } finally {
    listener.close();
    for (const conn of connections) { try { conn.close(); } catch { /* closed */ } }
    await serving;
    await Promise.all(handlers);
  }
});
Deno.test('abort closes a stalled connection without waiting for the server', async () => {
  const listener = Deno.listen({hostname:'127.0.0.1', port:0});
  const accepted = listener.accept();
  const controller = new AbortController();
  const pending = pinnedHttp(new URL(`http://example.com:${listener.addr.port}`), '127.0.0.1', controller.signal);
  const conn = await accepted;
  try {
    controller.abort();
    await assertRejects(() => pending);
  } finally { conn.close(); listener.close(); }
});
