/**
 * addCommentWithImage() — the field names the reply-parent id travels under.
 *
 * The API's reqParam() only checks req.body.streamTokenId / req.body.commentId
 * (dehub-stream-backend/common/util/auth.ts) — there is no fallback to
 * tokenId / parentId. addCommentWithImage() used to send the wrong names,
 * which 404'd the token lookup for every image/GIF comment and, when the
 * lookup did resolve, silently dropped a reply's parent — landing the reply
 * as a fresh top-level comment instead of nesting under the comment it
 * replied to.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const store: Record<string, string> = { dehub_token: "test-token", dehub_token_timestamp: String(Date.now()) };
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
});

function mockOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("addCommentWithImage", () => {
  it("sends streamTokenId and commentId, not tokenId and parentId", async () => {
    const { addCommentWithImage } = await import("../comments");
    mockOk({ result: { id: "c1", tokenId: 1, content: "", address: "0x1", createdAt: "", updatedAt: "" } });
    await addCommentWithImage({ tokenId: 1, imageUrl: "https://cdn.example.com/x.jpg", parentId: "42" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.streamTokenId).toBe(1);
    expect(body.commentId).toBe("42");
    expect(body.tokenId).toBeUndefined();
    expect(body.parentId).toBeUndefined();
  });

  it("omits commentId for a fresh (non-reply) comment", async () => {
    const { addCommentWithImage } = await import("../comments");
    mockOk({ result: { id: "c1", tokenId: 1, content: "", address: "0x1", createdAt: "", updatedAt: "" } });
    await addCommentWithImage({ tokenId: 1, imageUrl: "https://cdn.example.com/x.jpg" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.streamTokenId).toBe(1);
    expect(body.commentId).toBeUndefined();
  });
});
