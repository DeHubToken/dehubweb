// DeHub Builder API — prompt → AI-generated static web app → hosted preview.
//
// Ported from the open-source Rilable build pipeline (github.com/rbrown101010/rilable,
// MIT): same strict ===FILE=== generation protocol and generate/edit/self-status loop,
// re-hosted on DeHub's stack — Lovable AI Gateway for codegen (no Anthropic key
// needed), Postgres for projects/messages/files, and the builder-serve edge function
// as the static host (no Daytona sandboxes).
//
// Auth: wallet-native (x-wallet-address + x-dehub-token, verified against
// api.dehub.io), or the DeHub API building for someone who asked @assistant in
// a DM (x-assistant-secret + x-wallet-address). Metering: each generation
// consumes 1 build from a daily allowance derived from the caller's DHB staking
// badge (builder_usage table) — the same allowance either way.
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  checkRateLimit,
  rateLimitByIp,
  serviceClient,
} from "../_shared/auth.ts";
import { appOrigin, contentTypeFor, signPreviewToken, slugify, slugProblem } from "../_shared/builder-host.ts";

const DEHUB_API_BASE = "https://api.dehub.io";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Model picker: "best" (default) for the hard codegen path, "fast" for quick edits.
const BUILD_MODELS: Record<string, string> = {
  best: "google/gemini-2.5-pro",
  fast: "google/gemini-2.5-flash",
};

function resolveModel(key: string | undefined): string {
  return BUILD_MODELS[key ?? "best"] ?? BUILD_MODELS.best;
}

// ---------------------------------------------------------------------------
// Build allowance — DHB staking badge → builds per day.
// Keep in sync with src/lib/builder/allowance.ts (client-side display copy).
// ---------------------------------------------------------------------------

const BUILDS_BY_BADGE: Array<{ name: string; min: number; builds: number }> = [
  { name: "Megalodon", min: 50_000_000, builds: 120 },
  { name: "Blue Whale", min: 25_000_000, builds: 90 },
  { name: "Killer Whale", min: 10_000_000, builds: 75 },
  { name: "Great White Shark", min: 5_000_000, builds: 60 },
  { name: "Tiger Shark", min: 3_000_000, builds: 50 },
  { name: "Dolphin", min: 2_000_000, builds: 40 },
  { name: "Crocodile", min: 1_000_000, builds: 30 },
  { name: "Octopus", min: 500_000, builds: 25 },
  { name: "King Cobra", min: 250_000, builds: 20 },
  { name: "Giant Tortoise", min: 100_000, builds: 15 },
  { name: "Piranha", min: 50_000, builds: 10 },
  { name: "Ghost Lobster", min: 25_000, builds: 8 },
  { name: "Crab", min: 10_000, builds: 5 },
];

const BASELINE_BUILDS = 3;

function allowanceForBalance(badgeBalance: number): { tierName: string; buildsPerDay: number } {
  for (const tier of BUILDS_BY_BADGE) {
    if (badgeBalance >= tier.min) return { tierName: tier.name, buildsPerDay: tier.builds };
  }
  return { tierName: "Starter", buildsPerDay: BASELINE_BUILDS };
}

/** DHB badge balance (holdings + staked) as api.dehub.io reports it. */
async function fetchBadgeBalance(wallet: string, token: string): Promise<number> {
  try {
    // A public profile route, so a service call with no user token still reads it.
    const res = await fetch(`${DEHUB_API_BASE}/api/account_info/${wallet}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const info = data?.result ?? data;
    if (typeof info?.lnBalance === "number") return info.lnBalance;
    const rows: Array<{ walletBalance?: number; staked?: number }> = info?.balanceData ?? [];
    return rows.reduce((s, b) => s + (b.walletBalance || 0) + (b.staked || 0), 0);
  } catch {
    return 0;
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Generation protocol (from Rilable) — strict plain-text output the model
// must follow so we can parse complete files without a tool-calling layer.
// ---------------------------------------------------------------------------

const OUTPUT_FORMAT = `OUTPUT FORMAT — follow EXACTLY, with no markdown fences and no commentary before or after:
APP_NAME: <catchy app name, 18 characters max>
APP_EMOJI: <exactly one emoji>
SUMMARY: <one short sentence about what you built>
===FILE: index.html===
<complete file contents>
===END FILE===
===FILE: app.js===
<complete file contents>
===END FILE===`;

const DESIGN_RULES = `RULES:
- Static site only: HTML + CSS + JS. No build step, no npm, no server-side code. Files are served as-is by a static file server.
- index.html is REQUIRED. Put JS in app.js when it exceeds ~80 lines; add style.css for substantial custom CSS. 2-4 files total.
- Tailwind CSS is allowed via <script src="https://cdn.tailwindcss.com"></script>. CDN libraries (unpkg/jsdelivr) are allowed when genuinely useful: Chart.js, Three.js, Tone.js, canvas-confetti, marked, dayjs.
- Use localStorage when the app needs to remember things.
- DESIGN BAR IS HIGH. This must look like a polished product, not a demo: a deliberate color palette with one strong accent, generous spacing, smooth transitions and micro-animations, hover/active states, refined typography (Google Fonts allowed), tasteful gradients or glassmorphism. Default to a dark UI unless the request implies light.
- MOBILE-FIRST: most viewers open it on a phone. Include <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">. Big touch targets, no hover-only interactions.
- Everything must WORK. Every button does something real. No placeholders, no dead links, no TODOs, no console errors.
- Never embed API keys or secrets of any kind. Do not call external APIs that require keys.
- Keep the whole app under ~700 lines total.`;

const GENERATE_SYSTEM = `You are DeHub Builder, an elite web-app builder. You produce complete, beautiful, fully-working single-page web apps from a short request.

${OUTPUT_FORMAT}

${DESIGN_RULES}`;

const EDIT_SYSTEM = `You are DeHub Builder, an elite web-app builder. You are updating an existing app. You receive the app's current files, recent conversation, and a change request. Re-output the ENTIRE app — every file in full, including unchanged files. Files you omit will be DELETED. Keep the existing APP_NAME and APP_EMOJI unless the user asks to change them; SUMMARY should describe what you changed.

${OUTPUT_FORMAT}

${DESIGN_RULES}`;

type AppFile = { path: string; content: string };

type GeneratedApp = {
  name: string;
  emoji: string;
  summary: string;
  files: AppFile[];
};

/**
 * Defensive cleanup before parsing: some gateway models wrap the whole output
 * (or individual files) in markdown code fences despite the format contract.
 * Fence lines are never valid content on their own line in our protocol, so
 * dropping them is safe.
 */
function stripFences(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*```[a-zA-Z0-9_-]*\s*$/.test(line))
    .join("\n");
}

function parseGeneration(raw: string): GeneratedApp {
  const text = stripFences(raw);
  const name = /^APP_NAME:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "Untitled App";
  const emoji = /^APP_EMOJI:\s*(\S+)/m.exec(text)?.[1]?.trim() ?? "✨";
  const summary = /^SUMMARY:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "";
  const files: AppFile[] = [];
  const re = /===FILE:\s*([^=\n]+?)\s*===\n([\s\S]*?)\n?===END FILE===/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const path = match[1].trim().replace(/^\/+/, "");
    if (!path || path.includes("..") || files.length >= 8) continue;
    files.push({ path, content: match[2] });
  }
  if (!files.some((f) => f.path === "index.html")) {
    throw new Error("The generated app is missing index.html — try again");
  }
  return { name: name.slice(0, 30), emoji, summary, files };
}

function editUserPrompt(
  files: AppFile[],
  conversation: Array<{ role: string; content: string }>,
  request: string,
): string {
  const fileBlock = files
    .map((f) => `===FILE: ${f.path}===\n${f.content}\n===END FILE===`)
    .join("\n");
  const convo = conversation
    .filter((m) => m.role === "user" || m.role === "agent")
    .slice(-10)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  return `CURRENT FILES:\n${fileBlock}\n\nRECENT CONVERSATION:\n${convo}\n\nCHANGE REQUEST: ${request}`;
}

async function callGateway(system: string, user: string, model: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_completion_tokens: 32000,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI gateway error (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("The AI returned an empty response");
  return text;
}

// ---------------------------------------------------------------------------
// DB plumbing (service role — RLS has no client policies on builder_* tables)
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Db = any;

async function setStatus(db: Db, projectId: string, status: string, statusDetail: string) {
  await db
    .from("builder_projects")
    .update({ status, status_detail: statusDetail, updated_at: new Date().toISOString() })
    .eq("id", projectId);
}

async function log(db: Db, projectId: string, content: string, role = "log") {
  await db.from("builder_messages").insert({ project_id: projectId, role, content });
}

// Builder apps are served from https://<slug>.dehub.app (builder-serve reads
// builder_files directly). PUBLIC apps are also mirrored to the public
// `builder-apps` Storage bucket, because share links and app builds from before
// subdomains render from there. Private apps are never mirrored — the bucket is
// public, so a mirrored private app would not be private.
export const BUILDER_BUCKET = "builder-apps";

async function ensureBucket(db: Db) {
  // Idempotent: ignores the "already exists" error on every call after the first.
  await db.storage.createBucket(BUILDER_BUCKET, { public: true }).catch(() => {});
}

async function mirrorToStorage(db: Db, projectId: string, files: AppFile[]) {
  await ensureBucket(db);
  // Replace the whole prefix so deleted files don't linger.
  await removeStorage(db, projectId);
  await Promise.all(
    files.map((f) => {
      const type = contentTypeFor(f.path);
      // The Blob MUST carry the type: with a typeless Blob the storage client
      // ignores the contentType option and the object is served as
      // text/plain / octet-stream, so the app won't render.
      return db.storage.from(BUILDER_BUCKET).upload(`${projectId}/${f.path}`, new Blob([f.content], { type }), {
        contentType: type,
        cacheControl: "0",
        upsert: true,
      });
    }),
  );
}

async function saveFiles(db: Db, projectId: string, files: AppFile[]) {
  // Source of truth for the host, the code view and the edit loop.
  await db.from("builder_files").delete().eq("project_id", projectId);
  await db.from("builder_files").insert(
    files.map((f) => ({ project_id: projectId, path: f.path, content: f.content })),
  );
  const { data: project } = await db.from("builder_projects").select("is_public").eq("id", projectId).maybeSingle();
  if (project?.is_public) await mirrorToStorage(db, projectId, files);
  else await removeStorage(db, projectId);
}

async function loadFiles(db: Db, projectId: string): Promise<AppFile[]> {
  const { data } = await db.from("builder_files").select("path, content").eq("project_id", projectId).order("path");
  return data ?? [];
}

/** Give the app its subdomain the first time it builds (kept on later edits). */
async function ensureSlug(db: Db, projectId: string, name: string): Promise<string> {
  const { data: project } = await db.from("builder_projects").select("slug").eq("id", projectId).maybeSingle();
  if (project?.slug) return project.slug;
  let base = slugify(name);
  if (slugProblem(base)) base = "app";
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 && base !== "app" ? base : `${base.slice(0, 33)}-${crypto.randomUUID().slice(0, 5)}`;
    const { data } = await db
      .from("builder_projects")
      .update({ slug: candidate })
      .eq("id", projectId)
      .is("slug", null)
      .select("slug");
    if (data?.length) return candidate;
    const { data: now } = await db.from("builder_projects").select("slug").eq("id", projectId).maybeSingle();
    if (now?.slug) return now.slug;
  }
  throw new Error("Could not reserve an address for this app");
}

/** Keep every version a build or restore produced, so any of them can come back. */
async function snapshot(
  db: Db,
  projectId: string,
  version: number,
  app: { name: string; emoji: string; summary: string },
  files: AppFile[],
) {
  await db.from("builder_versions").upsert({
    project_id: projectId,
    version,
    name: app.name,
    emoji: app.emoji,
    summary: app.summary.slice(0, 500),
    files,
  });
}

async function removeStorage(db: Db, projectId: string) {
  const { data: existing } = await db.storage.from(BUILDER_BUCKET).list(projectId, { limit: 100 });
  if (existing?.length) {
    await db.storage
      .from(BUILDER_BUCKET)
      .remove(existing.map((o: { name: string }) => `${projectId}/${o.name}`))
      .catch(() => {});
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Build runners (fire-and-forget via EdgeRuntime.waitUntil; client polls `get`)
// ---------------------------------------------------------------------------

async function runBuild(db: Db, projectId: string, prompt: string, model: string) {
  try {
    await setStatus(db, projectId, "generating", "The AI is designing your app");
    await log(db, projectId, "🧠 Writing your app…");
    const raw = await callGateway(GENERATE_SYSTEM, `Build this web app: ${prompt}`, model);
    const app = parseGeneration(raw);
    await saveFiles(db, projectId, app.files);
    const slug = await ensureSlug(db, projectId, app.name);
    await log(
      db,
      projectId,
      `📁 Generated ${app.files.length} file${app.files.length === 1 ? "" : "s"}: ${app.files.map((f) => f.path).join(", ")}`,
    );
    await setStatus(db, projectId, "publishing", "Publishing your app");
    const { data: project } = await db
      .from("builder_projects")
      .select("version")
      .eq("id", projectId)
      .maybeSingle();
    const version = (project?.version ?? 0) + 1;
    await snapshot(db, projectId, version, app, app.files);
    await db
      .from("builder_projects")
      .update({
        name: app.name,
        emoji: app.emoji,
        status: "live",
        status_detail: "Live",
        error: null,
        version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    const home = `${appOrigin(slug)}/`;
    await log(
      db,
      projectId,
      app.summary ? `✅ ${app.name} is live at ${home} ${app.summary}` : `✅ ${app.name} is live at ${home}`,
      "agent",
    );
  } catch (err) {
    await db
      .from("builder_projects")
      .update({
        status: "error",
        status_detail: "Build failed",
        error: errorMessage(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    await log(db, projectId, `❌ Build failed: ${errorMessage(err)}`, "agent");
  }
}

async function runEdit(db: Db, projectId: string, request: string, model: string) {
  const { data: project } = await db
    .from("builder_projects")
    .select("name, emoji, version")
    .eq("id", projectId)
    .maybeSingle();
  try {
    const { data: fileRows } = await db
      .from("builder_files")
      .select("path, content")
      .eq("project_id", projectId);
    const files: AppFile[] = fileRows ?? [];
    if (files.length === 0) throw new Error("No files yet — rebuild the app first");
    const { data: msgRows } = await db
      .from("builder_messages")
      .select("role, content")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(30);
    const conversation = (msgRows ?? []).reverse();

    await setStatus(db, projectId, "updating", "The AI is applying your changes");
    await log(db, projectId, "🛠️ Updating your app…");
    const raw = await callGateway(EDIT_SYSTEM, editUserPrompt(files, conversation, request), model);
    const app = parseGeneration(raw);
    await saveFiles(db, projectId, app.files);
    await ensureSlug(db, projectId, app.name);
    const version = (project?.version ?? 0) + 1;
    await snapshot(db, projectId, version, app, app.files);
    await db
      .from("builder_projects")
      .update({
        name: app.name,
        emoji: app.emoji,
        status: "live",
        status_detail: "Live",
        error: null,
        version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    await log(db, projectId, app.summary ? `✅ Updated! ${app.summary}` : "✅ Updated!", "agent");
  } catch (err) {
    // Fall back to live if a previous version is still being served.
    const { data: existing } = await db
      .from("builder_files")
      .select("path")
      .eq("project_id", projectId)
      .limit(1);
    const stillLive = (existing ?? []).length > 0;
    await db
      .from("builder_projects")
      .update({
        status: stillLive ? "live" : "error",
        status_detail: stillLive ? "Live (last update failed)" : "Update failed",
        error: errorMessage(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    await log(db, projectId, `❌ Update failed: ${errorMessage(err)}`, "agent");
  }
}

// ---------------------------------------------------------------------------
// Allowance metering
// ---------------------------------------------------------------------------

async function getUsage(db: Db, wallet: string): Promise<number> {
  const { data } = await db
    .from("builder_usage")
    .select("builds")
    .eq("wallet", wallet)
    .eq("day", todayUtc())
    .maybeSingle();
  return data?.builds ?? 0;
}

async function bumpUsage(db: Db, wallet: string) {
  const day = todayUtc();
  const used = await getUsage(db, wallet);
  await db.from("builder_usage").upsert({ wallet, day, builds: used + 1 });
}

type Allowance = { used: number; limit: number; tierName: string };

async function loadAllowance(db: Db, wallet: string, token: string): Promise<Allowance> {
  const [balance, used] = await Promise.all([
    fetchBadgeBalance(wallet, token),
    getUsage(db, wallet),
  ]);
  const { tierName, buildsPerDay } = allowanceForBalance(balance);
  return { used, limit: buildsPerDay, tierName };
}

const BUSY_STATUSES = new Set(["queued", "generating", "publishing", "updating"]);

const PROJECT_FIELDS =
  "id, name, emoji, prompt, status, status_detail, error, version, is_public, slug, miniapp_app_id, created_at, updated_at";

// ---------------------------------------------------------------------------
// Ownership, publishing to the mini app store
// ---------------------------------------------------------------------------

type OwnedProject = {
  id: string;
  name: string;
  emoji: string;
  status: string;
  version: number;
  is_public: boolean;
  slug: string | null;
  miniapp_app_id: string | null;
};

const OWNED_FIELDS = "id, name, emoji, status, version, is_public, slug, miniapp_app_id";

async function ownedProject(db: Db, projectId: string | undefined, wallet: string): Promise<OwnedProject | null> {
  if (!projectId) return null;
  const { data } = await db
    .from("builder_projects")
    .select(OWNED_FIELDS)
    .eq("id", projectId)
    .eq("wallet", wallet)
    .maybeSingle();
  return data ?? null;
}

function listingFields(project: OwnedProject) {
  const origin = appOrigin(project.slug!);
  return {
    domain: new URL(origin).hostname,
    home_url: `${origin}/`,
    name: project.name,
    icon_url: `${origin}/icon.svg`,
    description: `${project.name} — built with DeHub Builder.`,
    manifest: { builderProjectId: project.id, name: project.name, homeUrl: `${origin}/` },
    updated_at: new Date().toISOString(),
  };
}

/**
 * List the app in the mini app store. A Builder app skips the dehub.json
 * ownership signature other apps need: the wallet that built it on DeHub is
 * its owner by definition. Like any new submission it starts `unlisted`
 * (shareable, marked Unreviewed) until staff promote it.
 */
async function publishListing(db: Db, project: OwnedProject, wallet: string) {
  const fields = listingFields(project);
  if (project.miniapp_app_id) {
    const { data: existing } = await db
      .from("miniapp_apps")
      .select("id, slug, status, tier")
      .eq("id", project.miniapp_app_id)
      .maybeSingle();
    if (existing) {
      if (existing.status === "suspended") throw new Error("This app is suspended from the store. Contact DeHub support.");
      await db.from("miniapp_apps").update({ ...fields, status: "live", review_note: null }).eq("id", existing.id);
      return { appSlug: existing.slug, tier: existing.tier, storeUrl: `https://dehub.io/apps/${existing.slug}` };
    }
  }
  let appSlug = project.slug!;
  const { data: clash } = await db.from("miniapp_apps").select("id").eq("slug", appSlug).maybeSingle();
  if (clash) appSlug = `${appSlug.slice(0, 33)}-${crypto.randomUUID().slice(0, 5)}`;
  const { data: created, error } = await db
    .from("miniapp_apps")
    .insert({
      ...fields,
      slug: appSlug,
      owner_wallet: wallet,
      submitted_by: wallet,
      source: "dehub",
      category: "utility",
      tier: "unlisted",
      status: "live",
    })
    .select("id, slug, tier")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not publish this app");
  await db.from("builder_projects").update({ miniapp_app_id: created.id }).eq("id", project.id);
  return { appSlug: created.slug, tier: created.tier, storeUrl: `https://dehub.io/apps/${created.slug}` };
}

/** Take the app out of the store, keeping its listing so republishing restores it. */
async function unpublish(db: Db, projectId: string) {
  const { data: project } = await db.from("builder_projects").select("miniapp_app_id").eq("id", projectId).maybeSingle();
  if (!project?.miniapp_app_id) return;
  await db
    .from("miniapp_apps")
    .update({ status: "pending", review_note: "Unpublished by its owner", updated_at: new Date().toISOString() })
    .eq("id", project.miniapp_app_id)
    .neq("status", "suspended");
}

/** After a rename, restore or new address, keep the store listing in step. */
async function syncListing(db: Db, projectId: string) {
  const { data: project } = await db.from("builder_projects").select(OWNED_FIELDS).eq("id", projectId).maybeSingle();
  if (!project?.miniapp_app_id || !project.slug) return;
  await db.from("miniapp_apps").update(listingFields(project)).eq("id", project.miniapp_app_id);
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST only" }, 405);
  }

  // The DeHub API builds on a user's behalf when they ask @assistant in a DM.
  // It has already verified who sent that DM and holds no token of theirs, so
  // it vouches for the wallet with the shared assistant secret instead. Every
  // one of those calls leaves the API from the same address, so the per-IP
  // build cap below would let twelve people an hour build from chat, platform
  // wide — the per-wallet allowance is the limit that applies to them.
  const serviceSecret = Deno.env.get("ASSISTANT_SERVICE_SECRET");
  const isServiceCall = !!serviceSecret && req.headers.get("x-assistant-secret") === serviceSecret;

  let wallet: string;
  let token: string;
  if (isServiceCall) {
    wallet = (req.headers.get("x-wallet-address") || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
      return jsonResponse({ error: "x-wallet-address required" }, 400);
    }
    token = "";
  } else {
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    ({ wallet, token } = auth);
  }

  const db = serviceClient();

  // Light per-wallet abuse guard over all actions (polling included).
  const rl = await checkRateLimit(db, wallet, "builder_api", { limit: 240, windowMs: 60_000 });
  if (!rl.allowed) {
    return jsonResponse({ error: "Rate limit exceeded — slow down." }, 429);
  }

  let body: {
    action?: string;
    projectId?: string;
    prompt?: string;
    content?: string;
    model?: string;
    isPublic?: boolean;
    slug?: string;
    version?: number;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  try {
    switch (body.action) {
      case "allowance": {
        return jsonResponse({ allowance: await loadAllowance(db, wallet, token) });
      }

      case "list": {
        const { data } = await db
          .from("builder_projects")
          .select(PROJECT_FIELDS)
          .eq("wallet", wallet)
          .order("updated_at", { ascending: false })
          .limit(100);
        return jsonResponse({ projects: data ?? [] });
      }

      case "create": {
        const prompt = (body.prompt ?? "").trim();
        if (!prompt) return jsonResponse({ error: "Tell me what to build first." }, 400);
        if (prompt.length > 2000) return jsonResponse({ error: "Prompt too long (2000 chars max)." }, 400);

        // Defense in depth: the per-wallet allowance already caps builds, but
        // requireDeHubAuth cannot currently distinguish spoofed wallets
        // (api.dehub.io accepts any token — platform-wide, see July audit), so
        // an attacker could rotate wallets for 3 free gateway builds each. Cap
        // the actual expensive path per IP too.
        if (!isServiceCall) {
          const ipLimited = await rateLimitByIp(req, "builder_build", { limit: 12, windowMs: 60 * 60 * 1000 });
          if (ipLimited) return ipLimited;
        }

        const allowance = await loadAllowance(db, wallet, token);
        if (allowance.used >= allowance.limit) {
          return jsonResponse(
            {
              error: `Daily build allowance reached (${allowance.limit}/day on the ${allowance.tierName} tier). Stake more DHB to raise it, or come back tomorrow.`,
              allowance,
            },
            402,
          );
        }

        const { data: project, error } = await db
          .from("builder_projects")
          .insert({ wallet, prompt, status: "queued", status_detail: "Queued for build" })
          .select("id")
          .single();
        if (error || !project) throw new Error(error?.message ?? "Could not create the project");
        await log(db, project.id, prompt, "user");
        await bumpUsage(db, wallet);

        // @ts-ignore - EdgeRuntime is provided by Supabase
        EdgeRuntime.waitUntil(runBuild(db, project.id, prompt, resolveModel(body.model)));
        return jsonResponse({
          projectId: project.id,
          allowance: { ...allowance, used: allowance.used + 1 },
        });
      }

      case "send": {
        const projectId = body.projectId ?? "";
        const content = (body.content ?? "").trim();
        if (!projectId || !content) return jsonResponse({ error: "projectId and content required" }, 400);
        if (content.length > 2000) return jsonResponse({ error: "Message too long (2000 chars max)." }, 400);

        if (!isServiceCall) {
          const ipLimited = await rateLimitByIp(req, "builder_build", { limit: 12, windowMs: 60 * 60 * 1000 });
          if (ipLimited) return ipLimited;
        }

        const { data: project } = await db
          .from("builder_projects")
          .select("id, status, prompt, version")
          .eq("id", projectId)
          .eq("wallet", wallet)
          .maybeSingle();
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        if (BUSY_STATUSES.has(project.status)) {
          return jsonResponse({ error: "Hold on — a build is already running for this app." }, 409);
        }

        const allowance = await loadAllowance(db, wallet, token);
        if (allowance.used >= allowance.limit) {
          return jsonResponse(
            {
              error: `Daily build allowance reached (${allowance.limit}/day on the ${allowance.tierName} tier). Stake more DHB to raise it, or come back tomorrow.`,
              allowance,
            },
            402,
          );
        }

        await log(db, projectId, content, "user");
        await bumpUsage(db, wallet);
        // Busy before this returns, not whenever the background run gets to
        // it. Until then the project still read "live" at its old version, so
        // anything watching for the result took the untouched app for a
        // finished edit.
        await setStatus(db, projectId, "queued", "Queued for build");

        const model = resolveModel(body.model);
        const isRetry = project.status === "error";
        if (isRetry) {
          const { data: files } = await db
            .from("builder_files")
            .select("path")
            .eq("project_id", projectId)
            .limit(1);
          if ((files ?? []).length === 0) {
            // Nothing was ever generated — rebuild from scratch. Build from the
            // project's ORIGINAL prompt plus the follow-up so a bare "try again"
            // doesn't become the app spec.
            const rebuildPrompt = `${project.prompt}\n\nAdditional note from the user: ${content}`;
            // @ts-ignore - EdgeRuntime is provided by Supabase
            EdgeRuntime.waitUntil(runBuild(db, projectId, rebuildPrompt, model));
            return jsonResponse({ ok: true, version: project.version, allowance: { ...allowance, used: allowance.used + 1 } });
          }
        }
        // @ts-ignore - EdgeRuntime is provided by Supabase
        EdgeRuntime.waitUntil(runEdit(db, projectId, content, model));
        return jsonResponse({ ok: true, version: project.version, allowance: { ...allowance, used: allowance.used + 1 } });
      }

      case "status": {
        // What a watcher polls: the project row and the latest agent line,
        // without the files `get` carries on every call.
        const projectId = body.projectId ?? "";
        if (!projectId) return jsonResponse({ error: "projectId required" }, 400);
        const { data: project } = await db
          .from("builder_projects")
          .select("id, name, emoji, status, status_detail, error, version, slug, is_public, updated_at")
          .eq("id", projectId)
          .eq("wallet", wallet)
          .maybeSingle();
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        const { data: last } = await db
          .from("builder_messages")
          .select("content")
          .eq("project_id", projectId)
          .eq("role", "agent")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return jsonResponse({ project, lastAgentMessage: last?.content ?? null });
      }

      case "get": {
        const projectId = body.projectId ?? "";
        if (!projectId) return jsonResponse({ error: "projectId required" }, 400);
        const { data: project } = await db
          .from("builder_projects")
          .select(PROJECT_FIELDS)
          .eq("id", projectId)
          .eq("wallet", wallet)
          .maybeSingle();
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        const { data: messages } = await db
          .from("builder_messages")
          .select("id, role, content, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true })
          .limit(200);
        const { data: files } = await db
          .from("builder_files")
          .select("path, content")
          .eq("project_id", projectId)
          .order("path");
        const { data: listing } = project.miniapp_app_id
          ? await db.from("miniapp_apps").select("slug, status, tier").eq("id", project.miniapp_app_id).maybeSingle()
          : { data: null };
        return jsonResponse({
          project,
          url: project.slug ? `${appOrigin(project.slug)}/` : null,
          listing: listing ? { ...listing, published: listing.status === "live" } : null,
          messages: messages ?? [],
          files: files ?? [],
        });
      }

      case "remove": {
        const projectId = body.projectId ?? "";
        if (!projectId) return jsonResponse({ error: "projectId required" }, 400);
        // Verify ownership before touching storage.
        const { data: owned } = await db
          .from("builder_projects")
          .select("id")
          .eq("id", projectId)
          .eq("wallet", wallet)
          .maybeSingle();
        if (!owned) return jsonResponse({ error: "Project not found" }, 404);
        await unpublish(db, projectId);
        await removeStorage(db, projectId);
        await db.from("builder_projects").delete().eq("id", projectId).eq("wallet", wallet);
        return jsonResponse({ ok: true });
      }

      case "versions": {
        const project = await ownedProject(db, body.projectId, wallet);
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        const { data } = await db
          .from("builder_versions")
          .select("version, name, emoji, summary, created_at")
          .eq("project_id", project.id)
          .order("version", { ascending: false })
          .limit(100);
        return jsonResponse({ current: project.version, versions: data ?? [] });
      }

      case "restore": {
        const project = await ownedProject(db, body.projectId, wallet);
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        if (BUSY_STATUSES.has(project.status)) {
          return jsonResponse({ error: "Hold on — a build is already running for this app." }, 409);
        }
        const { data: snap } = await db
          .from("builder_versions")
          .select("version, name, emoji, files")
          .eq("project_id", project.id)
          .eq("version", Number(body.version))
          .maybeSingle();
        if (!snap) return jsonResponse({ error: "That version does not exist" }, 404);
        await saveFiles(db, project.id, snap.files);
        const version = project.version + 1;
        await snapshot(db, project.id, version, { name: snap.name, emoji: snap.emoji, summary: `Restored v${snap.version}` }, snap.files);
        await db
          .from("builder_projects")
          .update({ name: snap.name, emoji: snap.emoji, version, status: "live", status_detail: "Live", error: null, updated_at: new Date().toISOString() })
          .eq("id", project.id);
        await log(db, project.id, `⏪ Restored version ${snap.version}`, "agent");
        await syncListing(db, project.id);
        return jsonResponse({ ok: true, version });
      }

      case "set_visibility": {
        const project = await ownedProject(db, body.projectId, wallet);
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        const isPublic = body.isPublic === true;
        await db.from("builder_projects").update({ is_public: isPublic, updated_at: new Date().toISOString() }).eq("id", project.id);
        if (isPublic) {
          await mirrorToStorage(db, project.id, await loadFiles(db, project.id));
        } else {
          // A private app cannot stay in the store.
          await unpublish(db, project.id);
          await removeStorage(db, project.id);
        }
        return jsonResponse({ ok: true, isPublic });
      }

      case "set_slug": {
        const project = await ownedProject(db, body.projectId, wallet);
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        const slug = (body.slug ?? "").trim().toLowerCase();
        const problem = slugProblem(slug);
        if (problem) return jsonResponse({ error: problem }, 400);
        if (slug !== project.slug) {
          const { error } = await db
            .from("builder_projects")
            .update({ slug, updated_at: new Date().toISOString() })
            .eq("id", project.id);
          // The unique index is the real check; two people racing for a name both get here.
          if (error) return jsonResponse({ error: "That address is taken." }, 409);
          await syncListing(db, project.id);
        }
        return jsonResponse({ ok: true, slug, url: `${appOrigin(slug)}/` });
      }

      case "preview_url": {
        const project = await ownedProject(db, body.projectId, wallet);
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        if (!project.slug) return jsonResponse({ error: "This app has not finished its first build yet." }, 409);
        const home = `${appOrigin(project.slug)}/`;
        if (project.is_public) return jsonResponse({ url: home, publicUrl: home, expiresAt: null });
        const { token, expiresAt } = await signPreviewToken(project.id);
        return jsonResponse({ url: `${appOrigin(project.slug)}/~t/${token}/`, publicUrl: home, expiresAt });
      }

      case "publish": {
        const project = await ownedProject(db, body.projectId, wallet);
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        if (!project.slug || project.version < 1) {
          return jsonResponse({ error: "Build the app before publishing it." }, 409);
        }
        if (!project.is_public) {
          await db.from("builder_projects").update({ is_public: true }).eq("id", project.id);
          await mirrorToStorage(db, project.id, await loadFiles(db, project.id));
        }
        const listing = await publishListing(db, { ...project, is_public: true }, wallet);
        return jsonResponse({ ok: true, ...listing });
      }

      case "unpublish": {
        const project = await ownedProject(db, body.projectId, wallet);
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        await unpublish(db, project.id);
        return jsonResponse({ ok: true });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error("builder-api error:", err);
    return jsonResponse({ error: errorMessage(err) }, 500);
  }
});
