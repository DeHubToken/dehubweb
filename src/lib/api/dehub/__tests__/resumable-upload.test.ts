/**
 * resumableUpload() — composer videos in chunks over the node-uploadx protocol.
 *
 * The fake server below holds one session at a time and answers exactly as
 * the API does: 201 + Location on create, 308 + Range per chunk, 200 + the
 * draft on the last byte, and the same for a `bytes * /size` probe. Each test
 * breaks the connection in one of the ways a real upload meets.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthenticationError, setAuthToken, setRefreshToken, setTokenExpiresAt, UploadHttpError } from '@/lib/api/dehub/core';
import {
  FIRST_CHUNK_BYTES,
  MAX_CHUNK_BYTES,
  MIN_CHUNK_BYTES,
  ResumableUnsupportedError,
  heldBytes,
  nextChunkSize,
  resumableUpload,
} from '@/lib/api/dehub/resumable-upload';

type Fault = 'network' | 'hang' | number;

const server = {
  token: 'tok-valid',
  size: 0,
  held: 0,
  sessions: 0,
  createStatus: 201,
  finishStatus: 200,
  /** Applied to the next chunk PUTs (not probes), in order. */
  faults: [] as Fault[],
  /** After this many accepted chunks the access token is rotated, as a 15-minute JWT expiring mid-upload would be. */
  rotateAfter: 0,
  /** Content-Range of every chunk that was accepted. */
  accepted: [] as Array<[number, number]>,
};

class MockXhr {
  static sent: MockXhr[] = [];

  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  timeout = 0;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  responseHeaders: Record<string, string> = {};
  body: Blob | string | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  getResponseHeader(name: string) {
    return this.responseHeaders[name] ?? null;
  }

  abort() {
    this.onabort?.();
    this.onloadend?.();
  }

  send(body: Blob | string | null) {
    this.body = body;
    MockXhr.sent.push(this);
    queueMicrotask(() => this.respond());
  }

  private reply(status: number, body = '', headers: Record<string, string> = {}) {
    this.status = status;
    this.responseText = body;
    this.responseHeaders = headers;
    this.onload?.();
    this.onloadend?.();
  }

  private respond() {
    if (this.headers.Authorization !== `Bearer ${server.token}`) return this.reply(401, '{"message":"Access token expired"}');

    if (this.method === 'POST') {
      if (server.createStatus !== 201) return this.reply(server.createStatus, '{"message":"nope"}');
      server.sessions++;
      server.size = Number(this.headers['X-Upload-Content-Length']);
      server.held = 0;
      return this.reply(201, `{"uploadId":"s${server.sessions}"}`, {
        Location: `/api/draft_video/resumable?upload_id=s${server.sessions}`,
      });
    }

    const range = this.headers['Content-Range'];
    const probe = /^bytes \*\/(\d+)$/.test(range);
    if (!probe) {
      const fault = server.faults.shift();
      if (fault === 'network') {
        this.onerror?.();
        this.onloadend?.();
        return;
      }
      if (fault === 'hang') return;
      if (fault === 404) server.held = 0;
      if (typeof fault === 'number') return this.reply(fault, '{"message":"fault"}');
    }

    const done = () =>
      server.finishStatus === 200
        ? this.reply(200, '{"draftId":"draft-1","status":"processing"}')
        : this.reply(server.finishStatus, '{"message":"\\"clip.mp4\\" doesn\'t look like a readable video file."}');
    const partial = () => this.reply(308, '', { Range: `bytes=0-${server.held - 1}` });

    if (probe) return server.held >= server.size ? done() : partial();

    const [, a, b] = /^bytes (\d+)-(\d+)\/\d+$/.exec(range) as RegExpExecArray;
    const start = Number(a);
    const end = Number(b);
    if (start > server.held) return this.reply(409, '{"message":"gap"}');
    expect((this.body as Blob).size).toBe(end - start + 1);
    this.upload.onprogress?.({ loaded: end - start + 1 });
    server.accepted.push([start, end]);
    server.held = Math.max(server.held, end + 1);
    if (server.accepted.length === server.rotateAfter) server.token = 'tok-fresh';
    return server.held >= server.size ? done() : partial();
  }
}

const originalXhr = globalThis.XMLHttpRequest;
const file = (bytes: number) => new File([new Uint8Array(bytes)], 'clip.mp4', { type: 'video/mp4', lastModified: 1 });
const chunkPuts = () => MockXhr.sent.filter((x) => x.method === 'PUT' && !/\*/.test(x.headers['Content-Range']));

/** The accepted ranges, put together, cover [0, size) with no gap. */
function expectWholeFile(size: number) {
  let next = 0;
  for (const [start, end] of server.accepted) {
    expect(start).toBeLessThanOrEqual(next);
    next = Math.max(next, end + 1);
  }
  expect(next).toBe(size);
}

describe('resumableUpload', () => {
  beforeEach(() => {
    localStorage.clear();
    setAuthToken('tok-valid');
    setTokenExpiresAt(900);
    setRefreshToken('rt-valid');
    Object.assign(server, {
      token: 'tok-valid', size: 0, held: 0, sessions: 0, createStatus: 201, finishStatus: 200, faults: [], accepted: [], rotateAfter: 0,
    });
    MockXhr.sent = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.XMLHttpRequest = MockXhr as any;
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXhr;
    vi.restoreAllMocks();
  });

  it('sends the file in chunks and resolves with the draft', async () => {
    const size = 5 * FIRST_CHUNK_BYTES + 123;
    const progress: number[] = [];

    const result = await resumableUpload('/api/draft_video/resumable', file(size), {
      metadata: { postType: 'video' },
      onProgress: (p) => progress.push(p),
    });

    expect(result).toEqual({ draftId: 'draft-1', status: 'processing' });
    expectWholeFile(size);
    expect(chunkPuts()[0].headers['Content-Range']).toBe(`bytes 0-${FIRST_CHUNK_BYTES - 1}/${size}`);
    const create = MockXhr.sent[0];
    expect(create.headers['X-Upload-Content-Length']).toBe(String(size));
    expect(create.headers['X-Upload-Content-Type']).toBe('video/mp4');
    expect(JSON.parse(create.body as string)).toMatchObject({ name: 'clip.mp4', size, postType: 'video', lastModified: 1 });
    expect(progress[progress.length - 1]).toBe(100);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  it('asks where to carry on after the connection drops, and does not start over', async () => {
    const size = 4 * FIRST_CHUNK_BYTES;
    server.faults = [undefined, 'network', 'network'];

    const result = await resumableUpload('/api/draft_video/resumable', file(size), { retryBaseMs: 1 });

    expect(result).toMatchObject({ draftId: 'draft-1' });
    expectWholeFile(size);
    expect(server.sessions).toBe(1);
    const probes = MockXhr.sent.filter((x) => x.headers['Content-Range'] === `bytes */${size}`);
    expect(probes.length).toBeGreaterThanOrEqual(2);
    expect(server.accepted[0]).toEqual([0, FIRST_CHUNK_BYTES - 1]);
    expect(server.accepted[1][0]).toBe(FIRST_CHUNK_BYTES);
  });

  it('cuts a stuck chunk when the browser goes offline and resumes once it is back', async () => {
    const size = 2 * FIRST_CHUNK_BYTES;
    server.faults = ['hang'];

    const upload = resumableUpload('/api/draft_video/resumable', file(size), { retryBaseMs: 60_000 });
    await vi.waitFor(() => expect(chunkPuts()).toHaveLength(1));
    window.dispatchEvent(new Event('offline'));
    // The retry wait is a minute; coming back online ends it early.
    await new Promise((resolve) => setTimeout(resolve, 10));
    window.dispatchEvent(new Event('online'));

    await expect(upload).resolves.toMatchObject({ draftId: 'draft-1' });
    expectWholeFile(size);
  });

  it('refreshes an access token that expires mid-upload and keeps going', async () => {
    const size = 3 * FIRST_CHUNK_BYTES;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ accessToken: 'tok-fresh', refreshToken: 'rt-next', expiresIn: 900 }), { status: 200 }),
    );
    server.rotateAfter = 1;

    await expect(resumableUpload('/api/draft_video/resumable', file(size), { retryBaseMs: 1 })).resolves.toMatchObject({ draftId: 'draft-1' });
    expect(fetchSpy).toHaveBeenCalled();
    expect(MockXhr.sent[MockXhr.sent.length - 1].headers.Authorization).toBe('Bearer tok-fresh');
    expect(server.sessions).toBe(1);
    expectWholeFile(size);
  });

  it('stops with AuthenticationError when the session is really over', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 401 }));
    server.token = 'someone-else';

    await expect(resumableUpload('/api/draft_video/resumable', file(1000), { retryBaseMs: 1 })).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('starts a new session when the server has dropped the old one', async () => {
    const size = 3 * FIRST_CHUNK_BYTES;
    server.faults = [undefined, 404];

    await expect(resumableUpload('/api/draft_video/resumable', file(size), { retryBaseMs: 1 })).resolves.toMatchObject({
      draftId: 'draft-1',
    });
    expect(server.sessions).toBe(2);
    expect(server.held).toBe(size);
  });

  it('hands over to the single-request upload when the server keeps erroring, instead of holding Post', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    server.faults = [503, 500, 502, 500];

    await expect(
      resumableUpload('/api/draft_video/resumable', file(3 * FIRST_CHUNK_BYTES), { retryBaseMs: 1 }),
    ).rejects.toBeInstanceOf(ResumableUnsupportedError);
    expect(chunkPuts()).toHaveLength(4);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('upload_id=s1'), expect.objectContaining({ method: 'DELETE' }));
  });

  it('keeps going through server errors that are not back to back', async () => {
    server.faults = [503, 500, 502, undefined, 500, 500, 500];

    await expect(
      resumableUpload('/api/draft_video/resumable', file(3 * FIRST_CHUNK_BYTES), { retryBaseMs: 1 }),
    ).resolves.toMatchObject({ draftId: 'draft-1' });
  });

  it('says so when the API has no resumable endpoint, so the caller can send it the old way', async () => {
    server.createStatus = 404;
    await expect(resumableUpload('/api/draft_video/resumable', file(1000))).rejects.toBeInstanceOf(
      ResumableUnsupportedError,
    );
  });

  it('passes the tier limit refusal through untouched', async () => {
    server.createStatus = 413;
    const error = (await resumableUpload('/api/draft_video/resumable', file(1000)).catch((e) => e)) as UploadHttpError;
    expect(error).toBeInstanceOf(UploadHttpError);
    expect(error.status).toBe(413);
  });

  it('passes an unreadable-video refusal on the last chunk through untouched', async () => {
    server.finishStatus = 400;
    const error = (await resumableUpload('/api/draft_video/resumable', file(1000)).catch((e) => e)) as UploadHttpError;
    expect(error).toBeInstanceOf(UploadHttpError);
    expect(error.status).toBe(400);
    expect(error.serverMessage).toContain('readable video');
  });

  it('cancels the session on the server when aborted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    server.faults = ['hang'];
    const controller = new AbortController();
    const upload = resumableUpload('/api/draft_video/resumable', file(2 * FIRST_CHUNK_BYTES), {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(chunkPuts()).toHaveLength(1));
    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('upload_id=s1'),
      expect.objectContaining({ method: 'DELETE', keepalive: true }),
    );
  });
});

describe('chunk sizing', () => {
  it('reads the offset from a Range header', () => {
    expect(heldBytes('bytes=0-1048575')).toBe(1048576);
    expect(heldBytes('bytes=0--1')).toBe(0);
    expect(heldBytes(null)).toBe(0);
  });

  it('grows on a fast line, shrinks on a slow one, and stays in bounds', () => {
    expect(nextChunkSize(FIRST_CHUNK_BYTES, FIRST_CHUNK_BYTES, 100)).toBe(2 * FIRST_CHUNK_BYTES);
    expect(nextChunkSize(FIRST_CHUNK_BYTES, FIRST_CHUNK_BYTES, 60_000)).toBe(FIRST_CHUNK_BYTES / 2);
    expect(nextChunkSize(MAX_CHUNK_BYTES, MAX_CHUNK_BYTES, 1)).toBe(MAX_CHUNK_BYTES);
    expect(nextChunkSize(MIN_CHUNK_BYTES, MIN_CHUNK_BYTES, 1_000_000)).toBe(MIN_CHUNK_BYTES);
  });
});
