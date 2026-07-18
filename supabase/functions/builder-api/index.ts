// DeHub Builder API — prompt → AI-generated static web app → hosted preview.
//
// Ported from the open-source Rilable build pipeline (github.com/rbrown101010/rilable,
// MIT): same strict ===FILE=== generation protocol and generate/edit/self-status loop,
// re-hosted on DeHub's stack — Lovable AI Gateway for codegen (no Anthropic key
// needed), Postgres for projects/messages/files, and the builder-serve edge function
// as the static host (no Daytona sandboxes).
//
// Auth: wallet-native (x-wallet-address + x-dehub-token, verified against
// api.dehub.io). Metering: each generation consumes 1 build from a daily
// allowance derived from the caller's DHB staking badge (builder_usage table).
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  checkRateLimit,
  serviceClient,
} from "../_shared/auth.ts";

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
  { name: "Meglodon", min: 50_000_000, builds: 120 },
  { name: "Blue Whale", min: 25_000_000, builds: 90 },
  { name: "Great White Shark", min: 10_000_000, builds: 75 },
  { name: "Killer Whale", min: 5_000_000, builds: 60 },
  { name: "Tiger Shark", min: 3_000_000, builds: 50 },
  { name: "Dolphin", min: 2_000_000, builds: 40 },
  { name: "Crocodite", min: 1_000_000, builds: 30 },
  { name: "Octopus", min: 500_000, builds: 25 },
  { name: "Cobra", min: 250_000, builds: 20 },
  { name: "Tortoise", min: 100_000, builds: 15 },
  { name: "Piranha", min: 50_000, builds: 10 },
  { name: "Lobster", min: 25_000, builds: 8 },
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
    const res = await fetch(`${DEHUB_API_BASE}/api/account_info/${wallet}`, {
      headers: { Authorization: `Bearer ${token}` },
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

async function saveFiles(db: Db, projectId: string, files: AppFile[]) {
  await db.from("builder_files").delete().eq("project_id", projectId);
  await db.from("builder_files").insert(
    files.map((f) => ({ project_id: projectId, path: f.path, content: f.content })),
  );
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
    await db
      .from("builder_projects")
      .update({
        name: app.name,
        emoji: app.emoji,
        status: "live",
        status_detail: "Live",
        error: null,
        version: (project?.version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    await log(
      db,
      projectId,
      app.summary ? `✅ ${app.name} is live! ${app.summary}` : `✅ ${app.name} is live!`,
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
    await db
      .from("builder_projects")
      .update({
        name: app.name,
        emoji: app.emoji,
        status: "live",
        status_detail: "Live",
        error: null,
        version: (project?.version ?? 0) + 1,
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

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST only" }, 405);
  }

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const { wallet, token } = auth;

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
          .select("id, name, emoji, prompt, status, status_detail, error, version, is_public, created_at, updated_at")
          .eq("wallet", wallet)
          .order("updated_at", { ascending: false })
          .limit(100);
        return jsonResponse({ projects: data ?? [] });
      }

      case "create": {
        const prompt = (body.prompt ?? "").trim();
        if (!prompt) return jsonResponse({ error: "Tell me what to build first." }, 400);
        if (prompt.length > 2000) return jsonResponse({ error: "Prompt too long (2000 chars max)." }, 400);

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

        const { data: project } = await db
          .from("builder_projects")
          .select("id, status, prompt")
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
            return jsonResponse({ ok: true, allowance: { ...allowance, used: allowance.used + 1 } });
          }
        }
        // @ts-ignore - EdgeRuntime is provided by Supabase
        EdgeRuntime.waitUntil(runEdit(db, projectId, content, model));
        return jsonResponse({ ok: true, allowance: { ...allowance, used: allowance.used + 1 } });
      }

      case "get": {
        const projectId = body.projectId ?? "";
        if (!projectId) return jsonResponse({ error: "projectId required" }, 400);
        const { data: project } = await db
          .from("builder_projects")
          .select("id, name, emoji, prompt, status, status_detail, error, version, is_public, created_at, updated_at")
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
        return jsonResponse({ project, messages: messages ?? [], files: files ?? [] });
      }

      case "remove": {
        const projectId = body.projectId ?? "";
        if (!projectId) return jsonResponse({ error: "projectId required" }, 400);
        await db.from("builder_projects").delete().eq("id", projectId).eq("wallet", wallet);
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
