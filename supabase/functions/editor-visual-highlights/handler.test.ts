import { test } from "node:test";
import assert from "node:assert/strict";
import { handleVisualHighlights } from "./handler.ts";
import { visualSampleTimes, type VisualBatch } from "./contract.ts";
import { JPEG } from "./fixture.ts";
const windows = [{ id: 0, start: 0, end: 6 }];
const batch: VisualBatch = { optIn: true, seconds: 15, duration: 6, focus: "A completed drawing", windows, frames: visualSampleTimes(windows[0]).map(at => ({ windowId: 0, at, dataUrl: JPEG })) };
const request = (body: unknown) => new Request("https://example.test/visual", { method: "POST", body: JSON.stringify(body) });

test("availability and nonconsenting or malformed inputs never ask a provider", async () => {
  let providers = 0, limits = 0;
  const deps = { headers: { "Access-Control-Allow-Origin": "*" }, preflight: () => null, limited: async () => { limits++; return null; }, complete: async () => { providers++; return new Response(); } };
  assert.equal((await handleVisualHighlights(new Request("https://example.test/visual"), deps)).status, 200);
  assert.equal((await handleVisualHighlights(request({ ...batch, optIn: false }), deps)).status, 403);
  assert.equal((await handleVisualHighlights(request({ ...batch, frames: [] }), deps)).status, 400);
  assert.equal((await handleVisualHighlights(request({ ...batch, frames: batch.frames.map(frame => ({ ...frame, dataUrl: "https://internal/private" })) }), deps)).status, 400);
  assert.equal((await handleVisualHighlights(request({ ...batch, frames: batch.frames.map(frame => ({ ...frame, at: 99 })) }), deps)).status, 400);
  assert.equal((await handleVisualHighlights(new Request("https://example.test/visual", { method: "POST", body: "x".repeat(3_000_001) }), deps)).status, 413);
  assert.equal(providers, 0); assert.equal(limits, 0);
});
test("a visual request sends actual image parts once, preserves route evidence and validates suggestions", async () => {
  let providers = 0;
  const deps = { headers: { "Access-Control-Allow-Origin": "*" }, preflight: () => null, limited: async () => null, complete: async (body: Record<string, unknown>) => {
    providers++; const messages = body.messages as { content: { type: string; image_url?: { url: string } }[] }[];
    assert.equal(messages[1].content.filter(part => part.type === "image_url").length, 6);
    assert.ok(messages[1].content.filter(part => part.type === "image_url").every(part => part.image_url?.url === JPEG));
    assert.equal(body.model, "google/gemini-2.5-flash");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ moments: [{ startWindow: 0, endWindow: 0, score: 0.96, description: "The finished drawing is shown", focusMatch: true }, { startWindow: 50, endWindow: 50, score: 1, description: "Invented footage", focusMatch: true }] }) } }] }, { headers: { "x-ai-provider": "google", "x-ai-route": "direct", "x-ai-fallback": "none" } });
  } };
  const result = await handleVisualHighlights(request(batch), deps);
  assert.equal(result.status, 200); assert.equal(providers, 1); assert.equal(result.headers.get("x-ai-provider"), "google");
  assert.deepEqual(await result.json(), { moments: [{ start: 0, end: 6, score: 0.96, text: "The finished drawing is shown" }], contract: 1 });
});
test("rate limits, provider failure and insufficient evidence preserve empty or failed results without retries", async () => {
  let providers = 0;
  const base = { headers: {}, preflight: () => null, limited: async () => null, complete: async () => { providers++; return new Response("failed", { status: 500 }); } };
  assert.equal((await handleVisualHighlights(request(batch), { ...base, limited: async () => new Response("limited", { status: 429 }) })).status, 429); assert.equal(providers, 0);
  assert.equal((await handleVisualHighlights(request(batch), base)).status, 502); assert.equal(providers, 1);
  const empty = await handleVisualHighlights(request(batch), { ...base, complete: async () => Response.json({ choices: [{ message: { content: '{"moments":[]}' } }] }) });
  assert.deepEqual(await empty.json(), { moments: [], contract: 1 });
});
