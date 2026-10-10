const RPC = "https://aigxuutjaqsywioxjefr.supabase.co/rest/v1/rpc/editor_cloud_live_checkpoint";
const PUBLIC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I";
const OWNER = "0x[a-f0-9]{40}", ID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const PATH = new RegExp("^/api/editor/presence/(" + OWNER + ")/(" + ID + ")$");
const TOKEN = /^(0x[a-f0-9]{40})\.([0-9]{1,12})\.[a-f0-9]{64}$/;
interface Peer { owner: string; projectId: string; deadline: number; wallet?: string; token?: string; authorized?: boolean; removed?: boolean; lastReceived?: number }
interface Socket { send(value: string): void; close(code?: number, reason?: string): void; serializeAttachment(value: Peer | null): void; deserializeAttachment(): Peer | null }
interface Context { getWebSockets(): Socket[]; acceptWebSocket(socket: Socket): void; storage: { setAlarm(at: number): Promise<void>; deleteAlarm(): Promise<void> } }
interface Namespace { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } }
export function presenceRoute(request: Request) {
  const url = new URL(request.url), match = PATH.exec(url.pathname);
  if (!match || url.search || !["dehub.io", "www.dehub.io"].includes(url.hostname)) return null;
  return { owner: match[1], projectId: match[2] };
}
export async function handleEditorPresence(request: Request, env: { EDITOR_PRESENCE?: Namespace }) {
  const target = presenceRoute(request);
  if (!target) return new Response("Unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426, headers: { "Cache-Control": "no-store" } });
  const origin = request.headers.get("Origin");
  // Native sockets have no Origin. Browser connections must come from the app.
  if (origin && !["https://dehub.io", "https://www.dehub.io"].includes(origin)) return new Response("Unavailable", { status: 403, headers: { "Cache-Control": "no-store" } });
  if (!env.EDITOR_PRESENCE) return new Response("Live sessions unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  const room = env.EDITOR_PRESENCE.get(env.EDITOR_PRESENCE.idFromName(target.owner + ":" + target.projectId));
  return room.fetch(request);
}
/** Only a signed, accepted editor can join. No documents or media enter this room. */
export class EditorPresenceRoom {
  private queue: Promise<unknown> = Promise.resolve();
  private depth = 0;
  constructor(private ctx: Context, _env: unknown, private fetcher: typeof fetch = (input, init) => fetch(input, init)) {}
  async fetch(request: Request) {
    const target = presenceRoute(request);
    if (!target || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Unavailable", { status: 404 });
    if (this.ctx.getWebSockets().filter(ws => !ws.deserializeAttachment()?.removed).length >= 32) return new Response("Live session is full", { status: 429 });
    const Pair = (globalThis as unknown as { WebSocketPair: new () => { 0: Socket; 1: Socket } }).WebSocketPair;
    const pair = new Pair(), client = pair[0], server = pair[1];
    server.serializeAttachment({ ...target, deadline: Date.now() + 10000 });
    this.ctx.acceptWebSocket(server); await this.schedule();
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }
  private discard(ws: Socket, code = 4403) {
    try { ws.send('{"type":"error"}'); } catch { /* disconnected */ }
    try { ws.serializeAttachment(null); ws.close(code, "Live session unavailable"); } catch { /* disconnected */ }
  }
  private async schedule() {
    const deadlines = this.ctx.getWebSockets().map(ws => ws.deserializeAttachment()).filter((peer): peer is Peer => !!peer && !peer.removed).map(peer => peer.deadline);
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  private enqueue(ws: Socket | null, action: () => Promise<void>) {
    if (this.depth >= 64) { if (ws) this.discard(ws, 1013); return Promise.resolve(); }
    this.depth++;
    const task = this.queue.then(action).catch(() => { if (ws) this.discard(ws); }).finally(() => { this.depth--; });
    this.queue = task; return task;
  }
  private async access(peer: Peer) {
    if (!peer.wallet || !peer.token || !Number.isInteger(value.draftRevision) || (value.draftRevision??-1)<0 || (value.draftRevision??0)>=2147483647 || peer.deadline <= Date.now()) throw new Error("access");
    const response = await this.fetcher(RPC, { method: "POST", headers: { "Content-Type": "application/json", apikey: PUBLIC_KEY, Authorization: "Bearer " + PUBLIC_KEY, "x-wallet-address": peer.wallet, "x-wallet-session": peer.token }, body: JSON.stringify({ p_owner: peer.owner, p_id: peer.projectId }), signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("access");
    const value = await response.json() as { wallet?: string; ownerWallet?: string; projectId?: string; role?: string; revision?: number; draftRevision?: number };
    if (value.wallet !== peer.wallet || value.ownerWallet !== peer.owner || value.projectId !== peer.projectId || (value.role !== "owner" && value.role !== "editor") || !Number.isInteger(value.revision) || (value.revision ?? 0) < 1 || !Number.isInteger(value.draftRevision) || (value.draftRevision??-1)<0 || (value.draftRevision??0)>=2147483647 || peer.deadline <= Date.now()) throw new Error("access");
    return {revision:value.revision!,draftRevision:value.draftRevision!};
  }
  /** Recheck every recipient before each private delivery, including after wakeup. */
  private async broadcast() {
    const checked = new Map<string, Promise<{revision:number;draftRevision:number}>>();
    const peers = await Promise.all(this.ctx.getWebSockets().map(async ws => {
      const peer = ws.deserializeAttachment(); if (!peer?.authorized) return null;
      try {
        const key = JSON.stringify([peer.owner, peer.projectId, peer.wallet, peer.token]);
        let check = checked.get(key); if (!check) { check = this.access(peer); checked.set(key, check); }
        const checkpoint = await check;
        if (ws.deserializeAttachment()?.token !== peer.token) return null;
        return { ws, peer, ...checkpoint };
      } catch { this.discard(ws); return null; }
    }));
    const allowed = peers.filter((p): p is NonNullable<typeof p> => p !== null);
    const participants = new Map<string, number>();
    for (const { peer } of allowed) participants.set(peer.wallet!, (participants.get(peer.wallet!) || 0) + 1);
    const message = JSON.stringify({ type: "presence", revision: Math.max(0, ...allowed.map(p => p.revision)), draftRevision:Math.max(0,...allowed.map(p=>p.draftRevision)), participants: [...participants].sort(([a], [b]) => a.localeCompare(b)).map(([wallet, connections]) => ({ wallet, connections })) });
    for (const { ws, peer } of allowed) { if (peer.deadline <= Date.now()) { this.discard(ws); continue; } try { ws.send(message); } catch { this.discard(ws); } }
    await this.schedule();
  }
  webSocketMessage(ws: Socket, message: string | ArrayBuffer) {
    const received = ws.deserializeAttachment(), now = Date.now();
    if (!received || (received.lastReceived !== undefined && now - received.lastReceived < 250)) { this.discard(ws); return Promise.resolve(); }
    received.lastReceived = now; ws.serializeAttachment(received);
    return this.enqueue(ws, async () => {
      const peer = ws.deserializeAttachment();
      if (!peer || typeof message !== "string" || message.length > 2048 || peer.deadline <= Date.now()) { this.discard(ws); await this.schedule(); return; }
      const data = JSON.parse(message);
      if (!peer.authorized) {
        const parts = typeof data.token === "string" ? TOKEN.exec(data.token) : null;
        if (data.type !== "join" || !parts || data.wallet !== parts[1] || Number(parts[2]) * 1000 <= Date.now() + 30000) { this.discard(ws); await this.schedule(); return; }
        peer.wallet = data.wallet; peer.token = data.token; peer.deadline = Number(parts[2]) * 1000; peer.authorized = true;
      } else if (data.type !== "refresh") { this.discard(ws); await this.schedule(); return; }
      ws.serializeAttachment(peer); await this.broadcast();
    });
  }
  webSocketClose(ws: Socket) { return this.enqueue(null, async () => { ws.serializeAttachment(null); await this.broadcast(); }); }
  webSocketError(ws: Socket) { return this.webSocketClose(ws); }
  alarm() { return this.enqueue(null, async () => { for (const ws of this.ctx.getWebSockets()) { const peer = ws.deserializeAttachment(); if (peer && peer.deadline <= Date.now()) this.discard(ws, 4408); } await this.broadcast(); }); }
}
