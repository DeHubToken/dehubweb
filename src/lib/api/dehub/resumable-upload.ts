/**
 * Chunked, resumable uploads — the node-uploadx protocol PeerTube uses.
 *
 *   POST   {endpoint}  X-Upload-Content-Length + JSON metadata → 201, Location: …?upload_id=…
 *   PUT    Location    Content-Range: bytes a-b/size            → 308 Range: bytes=0-n, or 200 + result
 *   PUT    Location    Content-Range: bytes * /size (no body)   → where to carry on from
 *   DELETE Location                                             → cancel
 *
 * One multipart POST lost the whole file to a dropped connection, a timeout or
 * an access token that expired halfway through. Here each chunk is its own
 * request, so any of those costs one chunk at most: the server says how much
 * it holds and the upload carries on from there.
 */
import {
  AuthenticationError,
  DEHUB_API_BASE,
  UploadHttpError,
  ensureFreshToken,
  refreshTokenSharedDetailed,
} from './core';
import { translateCopy as _translateCopy } from '@/i18n/copy';

/** Server has no resumable endpoint (an older API). Send the file the old way instead. */
export class ResumableUnsupportedError extends Error {
  constructor() {
    super('Resumable uploads are not available');
    this.name = 'ResumableUnsupportedError';
  }
}

export interface ResumableUploadOptions {
  /** Sent with the file's name, type, size and lastModified when the session is created. */
  metadata?: Record<string, unknown>;
  /** 0–100 across the whole file. */
  onProgress?: (percent: number) => void;
  /** Aborting cancels the session on the server and rejects with an AbortError. */
  signal?: AbortSignal;
  /** First retry delay; doubles per failure up to 30s. */
  retryBaseMs?: number;
}

export const MIN_CHUNK_BYTES = 256 * 1024;
export const FIRST_CHUNK_BYTES = 1024 * 1024;
export const MAX_CHUNK_BYTES = 50 * 1024 * 1024;
/** Chunks are sized so one takes about this long on the current connection. */
const TARGET_CHUNK_MS = 8_000;
/** A chunk that has not finished in this long is treated as a dropped connection. */
const CHUNK_TIMEOUT_MS = 2 * 60_000;
const MAX_RETRY_MS = 30_000;
/**
 * Give up once nothing has got through for this long. Post waits on this
 * upload, so it is long enough to ride out a dropped connection, not an hour:
 * past it the post sends the file itself.
 */
const GIVE_UP_AFTER_MS = 10 * 60_000;
/** Consecutive 5xx answers before handing over to the single-request upload. */
const MAX_SERVER_ERRORS = 4;
/** A fresh session that cannot even be opened this many times means the endpoint is unreachable, not the network. */
const CREATE_ATTEMPTS = 3;

interface Reply {
  status: number;
  header: (name: string) => string | null;
  text: string;
}

/** The request never got an answer: offline, dropped, timed out. Worth retrying after a pause. */
class TransientError extends Error {}

/** The token was refreshed after a 401: send again straight away. */
class RetryNowError extends TransientError {}

/** The server answered, with a 5xx. Retried, but only a few times in a row. */
class ServerError extends TransientError {}

/** The server no longer knows the session (expired after an hour idle): start a new one. */
class SessionGoneError extends Error {}

const abortError = () => new DOMException('Upload aborted', 'AbortError');

function send(
  method: string,
  url: string,
  token: string,
  opts: {
    headers?: Record<string, string>;
    body?: Blob | string | null;
    signal?: AbortSignal;
    timeoutMs?: number;
    onProgress?: (loaded: number) => void;
  } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    let wentOffline = false;
    const onAbort = () => xhr.abort();
    // The browser knows the network is gone before the request does; a
    // half-sent chunk would otherwise sit until the timeout.
    const onOffline = () => {
      wentOffline = true;
      xhr.abort();
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    if (typeof window !== 'undefined') window.addEventListener('offline', onOffline);
    xhr.onloadend = () => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (typeof window !== 'undefined') window.removeEventListener('offline', onOffline);
    };
    xhr.onabort = () => reject(wentOffline ? new TransientError('offline') : abortError());
    xhr.onerror = () => reject(new TransientError('network error'));
    xhr.ontimeout = () => reject(new TransientError('timed out'));
    xhr.onload = () =>
      resolve({ status: xhr.status, header: (name) => xhr.getResponseHeader(name), text: xhr.responseText });
    if (opts.onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => opts.onProgress?.(event.loaded);
    }
    xhr.timeout = opts.timeoutMs ?? 30_000;
    xhr.open(method, url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    for (const [key, value] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(key, value);
    xhr.send(opts.body ?? null);
  });
}

/** Bytes the server holds, from `Range: bytes=0-<last>`. No header (or `0--1`) is none. */
export function heldBytes(range: string | null): number {
  const match = /bytes=0-(\d+)/.exec(range ?? '');
  return match ? Number(match[1]) + 1 : 0;
}

/** Next chunk size: aim for TARGET_CHUNK_MS at the speed just seen, at most doubling or halving per step. */
export function nextChunkSize(current: number, sentBytes: number, elapsedMs: number): number {
  if (sentBytes <= 0 || elapsedMs <= 0) return current;
  const ideal = (sentBytes / elapsedMs) * TARGET_CHUNK_MS;
  const bounded = Math.min(current * 2, Math.max(current / 2, ideal));
  const rounded = Math.round(bounded / MIN_CHUNK_BYTES) * MIN_CHUNK_BYTES;
  return Math.min(MAX_CHUNK_BYTES, Math.max(MIN_CHUNK_BYTES, rounded));
}

function waitToRetry(failures: number, baseMs: number, signal?: AbortSignal): Promise<void> {
  const delay = Math.min(MAX_RETRY_MS, baseMs * 2 ** Math.min(failures - 1, 5)) * (0.75 + Math.random() * 0.5);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      if (typeof window !== 'undefined') window.removeEventListener('online', done);
      signal?.removeEventListener('abort', onAbort);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const timer = setTimeout(done, delay);
    // Back the moment the connection is, rather than at the end of the wait.
    if (typeof window !== 'undefined') window.addEventListener('online', done);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function errorFrom(reply: Reply): UploadHttpError {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(reply.text);
  } catch {
    /* not JSON */
  }
  const message = [body.message, body.error].find((v): v is string => typeof v === 'string') || _translateCopy("copy.27c2ccd962c2", { defaultValue: "Unknown error" });
  return new UploadHttpError(
    `Upload failed (HTTP ${reply.status}): ${message}`,
    reply.status,
    typeof body.code === 'string' ? body.code : undefined,
    message,
  );
}

function resultFrom<T>(reply: Reply): T {
  try {
    const parsed = JSON.parse(reply.text);
    return (parsed?.result ?? parsed) as T;
  } catch {
    throw new Error('Invalid response from server');
  }
}

/**
 * Upload `file` to a node-uploadx endpoint, resuming across dropped
 * connections, timeouts and token refreshes. Resolves with the JSON the server
 * sends after the last byte.
 */
export async function resumableUpload<T>(
  endpoint: string,
  file: Blob,
  options: ResumableUploadOptions = {},
): Promise<T> {
  const { signal, onProgress, metadata, retryBaseMs = 1_000 } = options;
  const size = file.size;
  const name = (file as File).name || 'upload';
  const contentType = file.type || 'application/octet-stream';

  let token = await ensureFreshToken();
  let sessionUrl: string | null = null;
  let offset = 0;
  /** Offset unknown after a failure: ask before sending more. */
  let resync = false;
  let chunk = FIRST_CHUNK_BYTES;
  let failures = 0;
  let createFailures = 0;
  let restarts = 0;
  let authRetries = 0;
  let serverErrors = 0;
  let lastProgressAt = Date.now();
  let reported = -1;

  const report = (bytes: number) => {
    const percent = size > 0 ? Math.min(100, Math.floor((bytes / size) * 100)) : 100;
    if (percent > reported) {
      reported = percent;
      onProgress?.(percent);
    }
  };

  /** A 401 means the token lapsed mid-upload: refresh it and go on, or stop if the session is dead. */
  const reauthenticate = async () => {
    const outcome = await refreshTokenSharedDetailed();
    if (outcome.ok) {
      token = outcome.tokens.accessToken;
      return;
    }
    if (outcome.reason === 'transient' || outcome.reason === 'malformed') throw new TransientError('refresh failed');
    throw new AuthenticationError('Session expired. Please sign in again.');
  };

  const create = async (): Promise<{ url: string; resumed: boolean }> => {
    const reply = await send('POST', new URL(endpoint, DEHUB_API_BASE).toString(), token, {
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': contentType,
      },
      body: JSON.stringify({
        name,
        mimeType: contentType,
        size,
        lastModified: (file as File).lastModified,
        ...metadata,
      }),
    });
    if (reply.status === 200 || reply.status === 201) {
      const location = reply.header('Location');
      let id: string | undefined;
      try {
        id = JSON.parse(reply.text)?.uploadId;
      } catch {
        /* Location is enough */
      }
      const url = location
        ? new URL(location, DEHUB_API_BASE).toString()
        : id
          ? new URL(`${endpoint}?upload_id=${encodeURIComponent(id)}`, DEHUB_API_BASE).toString()
          : null;
      if (!url) throw new Error('Invalid response from server');
      return { url, resumed: reply.status === 200 };
    }
    if (reply.status === 401) {
      await reauthenticate();
      throw new RetryNowError('retry with the new token');
    }
    if (reply.status === 404 || reply.status === 405) throw new ResumableUnsupportedError();
    if (reply.status >= 500 && reply.status !== 507) throw new ServerError(`HTTP ${reply.status}`);
    throw errorFrom(reply);
  };

  /** Ask the server what it holds. Resolves with the final result when it already has every byte. */
  // The `?: never` fillers keep both fields readable: with strictNullChecks
  // off, TypeScript does not narrow a union on a boolean (see TokenRefreshOutcome).
  const probe = async (): Promise<
    { done: true; result: T; offset?: never } | { done: false; offset: number; result?: never }
  > => {
    const reply = await send('PUT', sessionUrl as string, token, {
      signal,
      headers: { 'Content-Range': `bytes */${size}` },
    });
    if (reply.status === 200 || reply.status === 201) return { done: true, result: resultFrom<T>(reply) };
    if (reply.status === 308) return { done: false, offset: heldBytes(reply.header('Range')) };
    return handle(reply);
  };

  /** Every answer other than 308/200. Throws what the loop below acts on. */
  const handle = async (reply: Reply): Promise<never> => {
    if (reply.status === 401) {
      await reauthenticate();
      throw new RetryNowError('retry with the new token');
    }
    if (reply.status === 404) throw new SessionGoneError();
    if (reply.status >= 500) throw new ServerError(`HTTP ${reply.status}`);
    if (reply.status === 409) throw new TransientError('HTTP 409');
    throw errorFrom(reply);
  };

  const cancel = () => {
    if (!sessionUrl) return;
    // keepalive lets the cancel outlive a page being closed.
    void fetch(sessionUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(
      () => {},
    );
  };

  report(0);
  for (;;) {
    try {
      if (signal?.aborted) throw abortError();
      token = await ensureFreshToken().catch((err) => {
        if (err instanceof AuthenticationError) throw err;
        throw new TransientError('token refresh failed');
      });

      if (!sessionUrl) {
        const created = await create().catch((err) => {
          if (err instanceof TransientError && !(err instanceof RetryNowError) && ++createFailures >= CREATE_ATTEMPTS) {
            // A network that is down for the very first request looks the
            // same as an API that refuses this one (CORS, an old build). The
            // old single-request upload is the safe answer to both.
            throw new ResumableUnsupportedError();
          }
          throw err;
        });
        sessionUrl = created.url;
        offset = 0;
        resync = created.resumed;
      }

      if (resync || offset >= size) {
        const state = await probe();
        if (state.done) {
          report(size);
          return state.result;
        }
        offset = state.offset;
        resync = false;
        report(offset);
      }

      const start = offset;
      const end = Math.min(start + chunk, size);
      const startedAt = performance.now();
      const reply = await send('PUT', sessionUrl, token, {
        signal,
        timeoutMs: CHUNK_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${start}-${end - 1}/${size}`,
        },
        body: file.slice(start, end),
        onProgress: (loaded) => report(start + Math.min(loaded, end - start)),
      });

      if (reply.status === 200 || reply.status === 201) {
        report(size);
        return resultFrom<T>(reply);
      }
      if (reply.status !== 308) await handle(reply);

      offset = heldBytes(reply.header('Range'));
      // A 308 that does not move forward means the chunk did not land; ask again after a pause.
      if (offset <= start) throw new TransientError('no progress');
      chunk = nextChunkSize(chunk, offset - start, performance.now() - startedAt);
      failures = 0;
      authRetries = 0;
      serverErrors = 0;
      lastProgressAt = Date.now();
      report(offset);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        cancel();
        throw err;
      }
      if (err instanceof SessionGoneError) {
        // Expired or swept: start a fresh session from byte zero.
        if (++restarts > 2) throw new Error('Upload failed — please check your connection and try again');
        sessionUrl = null;
        offset = 0;
        resync = false;
        continue;
      }
      if (err instanceof RetryNowError) {
        // A server that keeps refusing a token it has just issued will not change its mind.
        if (++authRetries > 3) throw new AuthenticationError('Session expired. Please sign in again.');
        resync = sessionUrl !== null;
        continue;
      }
      if (!(err instanceof TransientError)) {
        if (!(err instanceof ResumableUnsupportedError)) cancel();
        throw err;
      }
      if (err instanceof ServerError && ++serverErrors >= MAX_SERVER_ERRORS) {
        // The old upload failed fast and fell back; a server that keeps
        // erroring should not hold Post for the whole retry window.
        cancel();
        throw new ResumableUnsupportedError();
      }
      failures++;
      resync = true;
      chunk = Math.max(MIN_CHUNK_BYTES, Math.floor(chunk / 2 / MIN_CHUNK_BYTES) * MIN_CHUNK_BYTES);
      if (Date.now() - lastProgressAt > GIVE_UP_AFTER_MS) {
        cancel();
        throw new Error('Upload failed — please check your connection and try again');
      }
      await waitToRetry(failures, retryBaseMs, signal).catch((abort) => {
        cancel();
        throw abort;
      });
    }
  }
}

