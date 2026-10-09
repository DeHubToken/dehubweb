import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

// Use the exact Workers engine and compiler already pinned by Wrangler.
const dependency = createRequire(realpathSync(new URL("../../node_modules/wrangler/package.json", import.meta.url)));
const { Miniflare, Response: WorkerResponse, convertV4MiniflareOptions } = dependency("miniflare");
const { build } = dependency("esbuild");
const bundle = await build({ entryPoints: ["CLOUDFLARE_WORKER_SEO.js"], bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:*"], target: "es2022" });
const owner = "0x" + "a".repeat(40), editor = "0x" + "b".repeat(40), denied = "0x" + "c".repeat(40);
const project = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const token = wallet => `${wallet}.${Math.floor(Date.now() / 1000) + 3600}.${"a".repeat(64)}`;
let allowed = true, head = 3, lookups = 0;
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2026-07-18", durableObjects: { EDITOR_PRESENCE: { className: "EditorPresenceRoom", useSQLite: true } }, outboundService: async request => {
  assert.equal(request.url, "https://aigxuutjaqsywioxjefr.supabase.co/rest/v1/rpc/editor_cloud_live_access");
  const wallet = request.headers.get("x-wallet-address"), signed = request.headers.get("x-wallet-session"), target = await request.json(); lookups++;
  const parts = signed?.split(".") || [];
  const valid = parts.length === 3 && parts[0] === wallet && Number(parts[1]) > Date.now() / 1000 && parts[2] === "a".repeat(64) && target.p_owner === owner && [project, other].includes(target.p_id) && (wallet === owner || (wallet === editor && allowed && target.p_id === project));
  return new WorkerResponse(JSON.stringify(valid ? { wallet, ownerWallet: owner, projectId: target.p_id, role: wallet === owner ? "owner" : "editor", revision: target.p_id === other ? 20 : head } : { code: "42501" }), { status: valid ? 200 : 401 });
} }));
const sockets = [];
async function connect(id = project) {
  const response = await mf.dispatchFetch(`https://dehub.io/api/editor/presence/${owner}/${id}`, { headers: { Upgrade: "websocket", Origin: "https://dehub.io" } });
  assert.equal(response.status, 101); assert(response.webSocket);
  const ws = response.webSocket, messages = [], waiters = [];
  ws.accept(); sockets.push(ws);
  ws.addEventListener("message", event => { const value = JSON.parse(event.data); messages.push(value); for (const waiter of [...waiters]) if (waiter.predicate(value)) { waiters.splice(waiters.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(value); } });
  const next = predicate => {
    const saved = messages.find(predicate); if (saved) return Promise.resolve(saved);
    return new Promise((resolve, reject) => { const waiter = { predicate, resolve, timer: setTimeout(() => reject(new Error("presence response timed out")), 6000) }; waiters.push(waiter); });
  };
  return { ws, next, messages, join: wallet => ws.send(JSON.stringify({ type: "join", wallet, token: token(wallet) })) };
}
try {
  const path = `https://dehub.io/api/editor/presence/${owner}/${project}`;
  assert.equal((await mf.dispatchFetch(path)).status, 426);
  assert.equal((await mf.dispatchFetch(path + "?token=private", { headers: { Upgrade: "websocket" } })).status, 404);
  assert.equal((await mf.dispatchFetch(path, { headers: { Upgrade: "websocket", Origin: "https://other.example" } })).status, 403);
  assert.equal(lookups, 0);
  const a = await connect(); a.join(owner); await a.next(v => v.type === "presence" && v.participants.length === 1);
  const b = await connect(); b.join(owner); await b.next(v => v.type === "presence" && v.participants[0]?.connections === 2);
  const c = await connect(); c.join(editor); const joined = await c.next(v => v.type === "presence" && v.participants.length === 2);
  assert.equal(joined.participants.find(p => p.wallet === owner).connections, 2);
  const secondRoom = await connect(other); secondRoom.join(owner); const isolated = await secondRoom.next(v => v.type === "presence"); assert.equal(isolated.revision, 20); assert.equal(isolated.participants.length, 1);
  await delay(300); head = 4; a.ws.send('{"type":"refresh"}'); await c.next(v => v.type === "presence" && v.revision === 4); await b.next(v => v.type === "presence" && v.revision === 4);
  await delay(300); allowed = false; head = 5; a.ws.send('{"type":"refresh"}'); await c.next(v => v.type === "error"); const revoked = await b.next(v => v.type === "presence" && v.revision === 5); assert.equal(revoked.participants.length, 1); assert.equal(revoked.participants[0].wallet, owner);
  const unauthenticated = await connect(); unauthenticated.ws.send('{"type":"refresh"}'); await unauthenticated.next(v => v.type === "error");
  const viewer = await connect(); viewer.join(denied); await viewer.next(v => v.type === "error"); assert(!viewer.messages.some(v => v.type === "presence"));
  const forged = await connect(); forged.ws.send(JSON.stringify({ type: "join", wallet: owner, token: token(editor) })); await forged.next(v => v.type === "error"); assert(!forged.messages.some(v => v.type === "presence"));
  b.ws.close(); await a.next(v => v.type === "presence" && v.revision === 5 && v.participants[0]?.connections === 1);
  const count = lookups; await delay(300); assert.equal(lookups, count, "idle presence must not poll the database");
  console.log(JSON.stringify({ engine: "workerd", productionEntryBundled: true, sqliteBinding: true, realWebSockets: true, joinsAndDuplicateConnections: true, roomIsolation: true, savedHeadBroadcast: true, revokedRecipientExcluded: true, forgedAndUnsignedDenied: true, disconnectUpdates: true, idleDatabasePolling: false, productionAccountUsed: false }));
} finally { for (const socket of sockets) { try { socket.close(); } catch {} } await mf.dispose(); }
