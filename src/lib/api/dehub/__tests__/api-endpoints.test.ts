import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
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

// ===== BLOCKS =====
describe("blocks.ts", () => {
  it("blockUser calls POST /api/block", async () => {
    const { blockUser } = await import("../blocks");
    mockOk({ result: true });
    const res = await blockUser("0xABC");
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/block");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    expect(res).toEqual({ result: true });
  });

  it("unblockUser calls DELETE /api/block/{address}", async () => {
    const { unblockUser } = await import("../blocks");
    mockOk({ result: true });
    await unblockUser("0xABC");
    expect(mockFetch.mock.calls[0][0]).toContain("/api/block/0xabc");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("getBlockList calls GET /api/block", async () => {
    const { getBlockList } = await import("../blocks");
    mockOk({ result: [{ address: "0x1" }] });
    const res = await getBlockList();
    expect(res).toEqual([{ address: "0x1" }]);
  });

  it("getBlockedBy calls GET /api/block/blocked-by", async () => {
    const { getBlockedBy } = await import("../blocks");
    mockOk({ result: [] });
    const res = await getBlockedBy();
    expect(res).toEqual([]);
    expect(mockFetch.mock.calls[0][0]).toContain("/api/block/blocked-by");
  });

  it("getBlockStatus calls GET /api/block/status/{address}", async () => {
    const { getBlockStatus } = await import("../blocks");
    mockOk({ result: { isBlocked: false, isBlockedBy: false } });
    const res = await getBlockStatus("0xDEF");
    expect(res).toEqual({ isBlocked: false, isBlockedBy: false });
    expect(mockFetch.mock.calls[0][0]).toContain("/api/block/status/0xdef");
  });
});

// ===== PUSH =====
describe("push.ts", () => {
  it("registerPushToken calls POST /api/push/token", async () => {
    const { registerPushToken } = await import("../push");
    mockOk({ result: true });
    await registerPushToken({ token: "abc", deviceId: "d1", platform: "web" });
    expect(mockFetch.mock.calls[0][0]).toContain("/api/push/token");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });

  it("unregisterPushToken calls DELETE /api/push/token/{deviceId}", async () => {
    const { unregisterPushToken } = await import("../push");
    mockOk({ result: true });
    await unregisterPushToken("device123");
    expect(mockFetch.mock.calls[0][0]).toContain("/api/push/token/device123");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("unregisterAllPushTokens calls DELETE /api/push/tokens", async () => {
    const { unregisterAllPushTokens } = await import("../push");
    mockOk({ result: true });
    await unregisterAllPushTokens();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/push/tokens");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("getRegisteredDevices calls GET /api/push/devices", async () => {
    const { getRegisteredDevices } = await import("../push");
    mockOk({ result: [] });
    const res = await getRegisteredDevices();
    expect(res).toEqual([]);
  });

  it("getPushPreferences calls GET /api/push/preferences", async () => {
    const { getPushPreferences } = await import("../push");
    mockOk({ result: { likes: true, comments: true, follows: true, mentions: true, directMessages: true, liveStreams: true, tips: true, subscriptions: true } });
    const res = await getPushPreferences();
    expect(res.likes).toBe(true);
  });

  it("updatePushPreferences calls POST /api/push/preferences", async () => {
    const { updatePushPreferences } = await import("../push");
    mockOk({ result: true });
    await updatePushPreferences({ likes: false });
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });

  it("resetPushPreferences calls POST /api/push/preferences/reset", async () => {
    const { resetPushPreferences } = await import("../push");
    mockOk({ result: true });
    await resetPushPreferences();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/push/preferences/reset");
  });
});

// ===== PAYMENTS =====
describe("payments.ts", () => {
  it("getDHBPrice calls GET /api/dpay/price", async () => {
    const { getDHBPrice } = await import("../payments");
    mockOk({ price: 0.01, change_24h: 5.2 });
    const res = await getDHBPrice();
    expect(res.price).toBe(0.01);
  });

  it("getDHBPriceByChain calls GET /api/dpay/price/{chainId}", async () => {
    const { getDHBPriceByChain } = await import("../payments");
    mockOk({ price: 0.01, change_24h: 3.1 });
    await getDHBPriceByChain(8453);
    expect(mockFetch.mock.calls[0][0]).toContain("/api/dpay/price/8453");
  });

  it("getAvailableTokens calls GET /api/dpay/available/tokens", async () => {
    const { getAvailableTokens } = await import("../payments");
    mockOk({ result: [{ symbol: "DHB" }] });
    const res = await getAvailableTokens();
    expect(res[0].symbol).toBe("DHB");
  });

  it("getAvailableGas calls GET /api/dpay/available/gas", async () => {
    const { getAvailableGas } = await import("../payments");
    mockOk({ result: { eth: 0.01 } });
    const res = await getAvailableGas();
    expect(res.eth).toBe(0.01);
  });

  it("getDPayTransactions calls GET /api/dpay/tnxs", async () => {
    const { getDPayTransactions } = await import("../payments");
    mockOk({ result: [] });
    const res = await getDPayTransactions();
    expect(res).toEqual([]);
  });

  it("getDPayTotal calls GET /api/dpay/total", async () => {
    const { getDPayTotal } = await import("../payments");
    mockOk({ result: { totalVolume: 1000, totalTransactions: 50 } });
    const res = await getDPayTotal();
    expect(res.totalVolume).toBe(1000);
  });

  it("createCheckout calls POST /api/dpay/checkout", async () => {
    const { createCheckout } = await import("../payments");
    mockOk({ result: { sessionId: "s1", url: "https://pay.example.com" } });
    const res = await createCheckout({ amount: 100 });
    expect(res.sessionId).toBe("s1");
  });

  it("createDPayTicket calls POST /api/dpay/tk", async () => {
    const { createDPayTicket } = await import("../payments");
    mockOk({ result: { id: "t1" } });
    await createDPayTicket({ data: "test" });
    expect(mockFetch.mock.calls[0][0]).toContain("/api/dpay/tk");
  });

  it("createOnrampSession calls POST /api/dpay/create-onramp-session", async () => {
    const { createOnrampSession } = await import("../payments");
    mockOk({ result: { url: "https://onramp.example.com" } });
    await createOnrampSession({ currency: "USD" });
    expect(mockFetch.mock.calls[0][0]).toContain("/api/dpay/create-onramp-session");
  });
});

// ===== COMMENTS (new functions) =====
describe("comments.ts (new)", () => {
  it("addGifComment calls POST /api/comment_gif", async () => {
    const { addGifComment } = await import("../comments");
    mockOk({ result: { id: "c1", tokenId: 1, content: "", address: "0x1", createdAt: "", updatedAt: "" } });
    await addGifComment({ tokenId: 1, gifUrl: "https://giphy.com/test.gif" });
    expect(mockFetch.mock.calls[0][0]).toContain("/api/comment_gif");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });

  it("deleteComment calls DELETE /api/delete_comment", async () => {
    const { deleteComment } = await import("../comments");
    mockOk({ result: true });
    const res = await deleteComment(123);
    expect(res).toEqual({ result: true });
    expect(mockFetch.mock.calls[0][0]).toContain("/api/delete_comment");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });
});

// ===== USERS (new functions) =====
describe("users.ts (new)", () => {
  it("searchUsers calls GET /api/users_search", async () => {
    const { searchUsers } = await import("../users");
    mockOk({ data: [], total: 0, page: 1, limit: 20, has_more: false });
    await searchUsers({ q: "test" });
    expect(mockFetch.mock.calls[0][0]).toContain("/api/users_search");
    expect(mockFetch.mock.calls[0][0]).toContain("q=test");
  });

  it("getUserComments calls GET /api/users/{address}/comments", async () => {
    const { getUserComments } = await import("../users");
    mockOk({ data: [], total: 0, page: 1, limit: 20, has_more: false });
    await getUserComments("0xABC");
    expect(mockFetch.mock.calls[0][0]).toContain("/api/users/0xABC/comments");
  });

  it("getSuggestedAccounts calls GET /api/suggested-accounts", async () => {
    const { getSuggestedAccounts } = await import("../users");
    mockOk({ result: [{ address: "0x1", username: "test" }] });
    const res = await getSuggestedAccounts();
    expect(res[0].username).toBe("test");
    expect(mockFetch.mock.calls[0][0]).toContain("/api/suggested-accounts");
  });
});

// ===== FEED (new function) =====
describe("feed.ts (new)", () => {
  it("getMyPosts calls GET /api/myPosts", async () => {
    const { getMyPosts } = await import("../feed");
    mockOk({ result: [], pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0, hasMore: false } });
    const res = await getMyPosts();
    expect(res.result).toEqual([]);
    expect(mockFetch.mock.calls[0][0]).toContain("/api/myPosts");
  });
});

// ===== AUTH (new function) =====
describe("auth.ts (new)", () => {
  it("checkUsernameAvailabilityPost calls POST /api/username/check", async () => {
    const { checkUsernameAvailabilityPost } = await import("../auth");
    mockOk({ status: true, code: 200, available: true, username: "test" });
    const res = await checkUsernameAvailabilityPost("test");
    expect(res.available).toBe(true);
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });
});

// ===== BARREL EXPORT =====
describe("index.ts barrel exports", () => {
  it("exports all new modules", async () => {
    const barrel = await import("../index");
    // Blocks
    expect(barrel.blockUser).toBeDefined();
    expect(barrel.unblockUser).toBeDefined();
    expect(barrel.getBlockList).toBeDefined();
    expect(barrel.getBlockedBy).toBeDefined();
    expect(barrel.getBlockStatus).toBeDefined();
    // Push
    expect(barrel.registerPushToken).toBeDefined();
    expect(barrel.unregisterPushToken).toBeDefined();
    expect(barrel.unregisterAllPushTokens).toBeDefined();
    expect(barrel.getRegisteredDevices).toBeDefined();
    expect(barrel.getPushPreferences).toBeDefined();
    expect(barrel.updatePushPreferences).toBeDefined();
    expect(barrel.resetPushPreferences).toBeDefined();
    // Payments
    expect(barrel.getDHBPrice).toBeDefined();
    expect(barrel.getDHBPriceByChain).toBeDefined();
    expect(barrel.getAvailableTokens).toBeDefined();
    expect(barrel.getAvailableGas).toBeDefined();
    expect(barrel.getDPayTransactions).toBeDefined();
    expect(barrel.getDPayTotal).toBeDefined();
    expect(barrel.createCheckout).toBeDefined();
    expect(barrel.createDPayTicket).toBeDefined();
    expect(barrel.createOnrampSession).toBeDefined();
    // Comments new
    expect(barrel.addGifComment).toBeDefined();
    expect(barrel.deleteComment).toBeDefined();
    // Users new
    expect(barrel.searchUsers).toBeDefined();
    expect(barrel.getUserComments).toBeDefined();
    expect(barrel.getSuggestedAccounts).toBeDefined();
    // Feed new
    expect(barrel.getMyPosts).toBeDefined();
    // Auth new
    expect(barrel.checkUsernameAvailabilityPost).toBeDefined();
  });
});
