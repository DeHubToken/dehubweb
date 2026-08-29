/**
 * addImageComment() — multipart transport and the field names the
 * reply-parent id travels under.
 *
 * /api/comment_image only ever reads the image from an uploaded file
 * (files[0].buffer on the backend); a JSON imageUrl is silently ignored, so
 * this has to go over multipart/form-data, not a pre-upload-then-post-URL
 * flow. reqParam() also only checks streamTokenId / commentId — there is no
 * fallback to tokenId / parentId, so those still have to be right.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setAuthToken, setRefreshToken, setTokenExpiresAt } from "../core";

interface QueuedResponse {
  status: number;
  body: string;
}

class MockXhr {
  static sent: MockXhr[] = [];
  static queue: QueuedResponse[] = [];

  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  timeout = 0;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send(body: unknown) {
    this.body = body;
    MockXhr.sent.push(this);

    queueMicrotask(() => {
      const next = MockXhr.queue.shift();
      if (!next) throw new Error('MockXhr: no queued response');
      this.status = next.status;
      this.responseText = next.body;
      this.onload?.();
    });
  }

  static reset() {
    MockXhr.sent = [];
    MockXhr.queue = [];
  }
}

const originalXhr = globalThis.XMLHttpRequest;

describe("addImageComment", () => {
  beforeEach(() => {
    localStorage.clear();
    MockXhr.reset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.XMLHttpRequest = MockXhr as any;
    setAuthToken('tok-valid');
    setTokenExpiresAt(900);
    setRefreshToken('rt-valid');
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXhr;
    vi.restoreAllMocks();
  });

  it("sends streamTokenId and commentId, not tokenId and parentId, and attaches the file", async () => {
    const { addImageComment } = await import("../comments");
    MockXhr.queue.push({ status: 200, body: JSON.stringify({ result: true, commentId: 1 }) });

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await addImageComment({ tokenId: 1, imageFile: file, parentId: "42" });

    expect(MockXhr.sent).toHaveLength(1);
    const sent = MockXhr.sent[0];
    const params = new URL(sent.url, "https://api.dehub.io").searchParams;
    expect(params.get('streamTokenId')).toBe('1');
    expect(params.get('commentId')).toBe('42');
    expect(params.get('tokenId')).toBeNull();
    expect(params.get('parentId')).toBeNull();

    const formData = sent.body as FormData;
    expect(formData.get('file')).toBeInstanceOf(File);
  });

  it("omits commentId for a fresh (non-reply) comment", async () => {
    const { addImageComment } = await import("../comments");
    MockXhr.queue.push({ status: 200, body: JSON.stringify({ result: true, commentId: 2 }) });

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await addImageComment({ tokenId: 1, imageFile: file });

    const sent = MockXhr.sent[0];
    const params = new URL(sent.url, "https://api.dehub.io").searchParams;
    expect(params.get('streamTokenId')).toBe('1');
    expect(params.has('commentId')).toBe(false);
  });
});
