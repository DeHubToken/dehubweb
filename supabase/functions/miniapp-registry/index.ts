/**
 * miniapp-registry
 * ================
 * Reads and checks a mini app's manifest.
 *
 *   POST { action: 'validate', url }
 *
 * Fetches `/.well-known/dehub.json` from the app's origin, falling back to a
 * Farcaster `/.well-known/farcaster.json`, so an app built for Farcaster runs
 * here without a rewrite. Answers with the normalised manifest, the share card
 * found on the home page, and every problem as { field, message } — one
 * concrete line per field, because a single "invalid manifest" is the most
 * complained-about thing in every other mini app ecosystem.
 *
 *   POST { action: 'submit', url }   (x-dehub-token) register or update the app
 *   POST { action: 'mine' }          (x-dehub-token) the caller's apps
 *
 * Promoting an app into the store (tier) and suspending one are staff writes.
 */
import { verifyMessage } from "https://esm.sh/ethers@6.13.4";
import { handleCorsPreflight } from "../_shared/cors.ts";
import { checkRateLimit, jsonResponse, rateLimitByIp, requireDeHubAuth, serviceClient } from "../_shared/auth.ts";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 512_000;
const MAX_REDIRECTS = 3;

export const CATEGORIES = [
  "games", "social", "finance", "utility", "productivity", "health-fitness", "news-media",
  "music", "shopping", "education", "developer-tools", "entertainment", "art-creativity",
];
export const PERMISSIONS = ["wallet", "compose", "notifications", "camera"];

interface Problem {
  field: string;
  message: string;
}

/** Same literal-host guard as fetch-link-preview: public web pages only. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  return false;
}

/** GET with a manual redirect walk, so every hop passes the host guard. */
async function safeFetch(raw: string, method: "GET" | "HEAD" = "GET"): Promise<Response | null> {
  let url = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" || isBlockedHost(parsed.hostname)) return null;
    const res = await fetch(parsed.toString(), {
      method,
      redirect: "manual",
      headers: { "User-Agent": "dehub-miniapp-registry/1 (+https://dehub.io/apps/dev)", Accept: "*/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return res;
      url = new URL(next, parsed).toString();
      continue;
    }
    return res;
  }
  return null;
}

async function readText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

const str = (v: unknown, max = 2048): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : [];

export function ownershipMessage(domain: string): string {
  return `dehub mini app ownership\n${domain}`;
}

function normalise(json: Record<string, unknown>, source: "dehub" | "farcaster") {
  const app = (source === "dehub" ? json.app : json.miniapp ?? json.frame) as Record<string, unknown> | undefined;
  const a = app ?? {};
  return {
    source,
    name: str(a.name, 64),
    homeUrl: str(a.homeUrl),
    iconUrl: str(a.iconUrl),
    splashImageUrl: str(a.splashImageUrl),
    splashBackgroundColor: str(a.splashBackgroundColor, 16),
    subtitle: str(a.subtitle, 64),
    description: str(a.description, 400),
    category: str(a.category ?? a.primaryCategory, 32),
    tags: strList(a.tags, 10),
    screenshotUrls: strList(a.screenshotUrls, 6),
    ogImageUrl: str(a.ogImageUrl),
    webhookUrl: str(a.webhookUrl),
    permissions: strList(a.permissions, 10),
    requiredChains: strList(a.requiredChains, 10),
    requiredCapabilities: strList(a.requiredCapabilities, 30),
    locales: strList(a.locales, 120),
  };
}

type Manifest = ReturnType<typeof normalise>;

function isHttps(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function check(m: Manifest, domain: string): { errors: Problem[]; warnings: Problem[] } {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });
  const warn = (field: string, message: string) => warnings.push({ field, message });

  if (!m.name) err("name", "Required.");
  else if (m.name.length > 32) err("name", `Must be 32 characters or fewer (it is ${m.name.length}).`);

  if (!m.homeUrl) err("homeUrl", "Required.");
  else if (!isHttps(m.homeUrl)) err("homeUrl", "Must be an https:// URL.");
  else if (new URL(m.homeUrl).hostname !== domain) err("homeUrl", `Must be on ${domain}, the domain serving this manifest.`);

  if (!m.iconUrl) err("iconUrl", "Required. A 1024x1024 PNG with no transparency.");
  else if (!isHttps(m.iconUrl)) err("iconUrl", "Must be an https:// URL.");

  if (m.subtitle && m.subtitle.length > 30) err("subtitle", `Must be 30 characters or fewer (it is ${m.subtitle.length}).`);
  if (!m.description) warn("description", "Recommended: the store shows it on your listing.");
  else if (m.description.length > 170) err("description", `Must be 170 characters or fewer (it is ${m.description.length}).`);

  if (m.splashBackgroundColor && !/^#[0-9a-fA-F]{6}$/.test(m.splashBackgroundColor)) {
    err("splashBackgroundColor", "Must be a hex colour like #0B0B0B.");
  }
  if (m.splashImageUrl && !isHttps(m.splashImageUrl)) err("splashImageUrl", "Must be an https:// URL.");
  if (!m.category) warn("category", `Recommended. One of: ${CATEGORIES.join(", ")}.`);
  else if (!CATEGORIES.includes(m.category)) err("category", `Unknown category. One of: ${CATEGORIES.join(", ")}.`);

  if (m.tags.length > 5) err("tags", "At most 5 tags.");
  for (const tag of m.tags) {
    if (!/^[a-z0-9-]{1,20}$/.test(tag)) err("tags", `"${tag}" must be lowercase letters, digits or dashes, 20 characters at most.`);
  }
  if (m.screenshotUrls.length > 3) err("screenshotUrls", "At most 3 screenshots.");
  for (const p of m.permissions) {
    if (!PERMISSIONS.includes(p)) err("permissions", `Unknown permission "${p}". One of: ${PERMISSIONS.join(", ")}.`);
  }
  if (m.webhookUrl && !isHttps(m.webhookUrl)) err("webhookUrl", "Must be an https:// URL.");
  return { errors, warnings };
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const content = tag.match(/content='([^']*)'/i)?.[1] ?? tag.match(/content="([^"]*)"/i)?.[1];
  return content ? content.replace(/&quot;/g, '"').replace(/&amp;/g, "&") : null;
}

async function readEmbed(homeUrl: string | undefined) {
  if (!homeUrl) return null;
  const res = await safeFetch(homeUrl);
  if (!res || !res.ok) return null;
  const html = await readText(res);
  for (const name of ["dehub:miniapp", "fc:miniapp", "fc:frame"]) {
    const raw = metaContent(html, name);
    if (!raw) continue;
    try {
      const embed = JSON.parse(raw);
      return {
        tag: name,
        imageUrl: str(embed?.imageUrl),
        buttonTitle: str(embed?.button?.title, 64),
        url: str(embed?.button?.url ?? embed?.button?.action?.url),
      };
    } catch {
      return { tag: name, invalid: true };
    }
  }
  return null;
}

async function isImage(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const res = (await safeFetch(url, "HEAD")) ?? (await safeFetch(url));
  return Boolean(res?.ok && (res.headers.get("content-type") || "").startsWith("image/"));
}

interface Inspection {
  status: number;
  body: Record<string, unknown> & { ok?: boolean; errors?: Problem[] };
}

async function inspect(raw: string): Promise<Inspection> {
  let origin: URL;
  try {
    origin = new URL(raw);
  } catch {
    return { body: { error: "That is not a URL." }, status: 400 };
  }
  if (origin.protocol !== "https:") return { body: { error: "The app must be served over https://." }, status: 400 };
  if (isBlockedHost(origin.hostname)) return { body: { error: "That host cannot be checked from the internet." }, status: 400 };
  const domain = origin.hostname.toLowerCase();

  let source: "dehub" | "farcaster" | null = null;
  let json: Record<string, unknown> | null = null;
  for (const [path, kind] of [["/.well-known/dehub.json", "dehub"], ["/.well-known/farcaster.json", "farcaster"]] as const) {
    const res = await safeFetch(`https://${domain}${path}`);
    if (!res?.ok) continue;
    try {
      json = JSON.parse(await readText(res));
      source = kind;
      break;
    } catch {
      return { body: {
        ok: false,
        domain,
        errors: [{ field: path, message: "Found, but it is not valid JSON." }],
        warnings: [],
      }, status: 200 };
    }
  }
  if (!json || !source) {
    return { body: {
      ok: false,
      domain,
      errors: [{ field: "/.well-known/dehub.json", message: `Not found at https://${domain}/.well-known/dehub.json (and no farcaster.json either).` }],
      warnings: [],
    }, status: 200 };
  }

  const manifest = normalise(json, source);
  const { errors, warnings } = check(manifest, domain);

  let owner: string | null = null;
  if (source === "dehub") {
    const own = json.ownership as Record<string, unknown> | undefined;
    const address = str(own?.address, 64)?.toLowerCase();
    const signature = str(own?.signature, 200);
    const signedDomain = str(own?.domain, 253)?.toLowerCase();
    if (!address || !signature) {
      errors.push({ field: "ownership", message: "Required: { address, domain, signature } signed by your dehub wallet." });
    } else if (signedDomain !== domain) {
      errors.push({ field: "ownership.domain", message: `Must be ${domain}.` });
    } else {
      try {
        const recovered = verifyMessage(ownershipMessage(domain), signature).toLowerCase();
        if (recovered === address) owner = address;
        else errors.push({ field: "ownership.signature", message: `Signed by ${recovered}, not ${address}.` });
      } catch {
        errors.push({ field: "ownership.signature", message: "Not a valid signature." });
      }
    }
  } else {
    warnings.push({
      field: "ownership",
      message: "Imported from farcaster.json. Add a dehub.json signed by your dehub wallet to link the app to your account and receive payouts.",
    });
  }

  const [iconOk, embed] = await Promise.all([isImage(manifest.iconUrl), readEmbed(manifest.homeUrl)]);
  if (manifest.iconUrl && !iconOk) errors.push({ field: "iconUrl", message: "Did not answer as an image." });
  if (!embed) {
    warnings.push({ field: "embed", message: 'No share card found. Add <meta name="dehub:miniapp"> to your home page so links unfurl in the feed.' });
  } else if ("invalid" in embed) {
    errors.push({ field: "embed", message: `${embed.tag} is present but its content is not valid JSON.` });
  } else if (!embed.imageUrl) {
    errors.push({ field: "embed.imageUrl", message: "Required: a 3:2 image." });
  }

  return { body: { ok: errors.length === 0, domain, source, owner, manifest, embed, errors, warnings }, status: 200 };
}


// ── Submissions ─────────────────────────────────────────────────────────────
//
// A manifest that passes goes live at once as UNLISTED: it opens from a
// shared /apps/<slug> link under an "Unreviewed" badge, the way any link works
// on Farcaster, but stays out of the store. Review promotes the tier to
// `listed`; `status = 'suspended'` is the kill switch. Both are staff writes.

const APP_COLUMNS =
  "slug, domain, home_url, name, subtitle, icon_url, tier, status, source, owner_wallet, review_note, updated_at";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base.length >= 2 ? base : `app-${base || "x"}`;
}

async function freeSlug(db: ReturnType<typeof serviceClient>, name: string): Promise<string> {
  const base = slugify(name);
  const { data } = await db.from("miniapp_apps").select("slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(base) && base !== "dev") return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 40);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

async function submit(req: Request, raw: string): Promise<Response> {
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const db = serviceClient();
  const rl = await checkRateLimit(db, auth.wallet, "miniapp-submit", { limit: 10, windowMs: 3600_000 });
  if (!rl.allowed) return jsonResponse({ error: "Too many submissions. Try again in an hour." }, 429);

  const inspection = await inspect(raw);
  const result = inspection.body as Record<string, any>;
  if (inspection.status !== 200) return jsonResponse(result, inspection.status);
  if (!result.ok) return jsonResponse({ ...result, error: "Fix the problems above, then submit again." }, 422);

  const m = result.manifest as ReturnType<typeof normalise>;
  const domain = result.domain as string;
  const owner = (result.owner as string | null) ?? null;
  const fields = {
    home_url: m.homeUrl,
    source: result.source,
    manifest: m,
    name: m.name,
    subtitle: m.subtitle ?? null,
    description: m.description ?? null,
    icon_url: m.iconUrl ?? null,
    splash_image_url: m.splashImageUrl ?? null,
    splash_background_color: m.splashBackgroundColor ?? null,
    category: m.category ?? null,
    tags: m.tags,
    permissions: m.permissions,
    crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await db.from("miniapp_apps").select("id, owner_wallet, submitted_by, status").eq("domain", domain).maybeSingle();
  if (existing) {
    // The domain's verified owner may always update it; so may whoever first
    // submitted an app nobody has claimed. A verified owner arriving later
    // claims an import that somebody else registered.
    const mayUpdate =
      (owner && (existing.owner_wallet === owner || !existing.owner_wallet)) ||
      (!existing.owner_wallet && existing.submitted_by === auth.wallet);
    if (!mayUpdate) {
      return jsonResponse({ error: `${domain} is already registered by its owner. Sign a dehub.json with the owning wallet to update it.` }, 409);
    }
    if (existing.status === "suspended") return jsonResponse({ error: "This app is suspended. Contact DeHub support." }, 403);
    const { data, error } = await db
      .from("miniapp_apps")
      .update({ ...fields, ...(owner ? { owner_wallet: owner } : {}), status: "live" })
      .eq("id", existing.id)
      .select(APP_COLUMNS)
      .single();
    if (error) throw error;
    return jsonResponse({ ok: true, app: data, updated: true });
  }

  const { data, error } = await db
    .from("miniapp_apps")
    .insert({
      ...fields,
      slug: await freeSlug(db, m.name ?? domain),
      domain,
      owner_wallet: owner,
      submitted_by: auth.wallet,
      tier: "unlisted",
      status: "live",
    })
    .select(APP_COLUMNS)
    .single();
  if (error) throw error;
  return jsonResponse({ ok: true, app: data, updated: false });
}

async function mine(req: Request): Promise<Response> {
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const { data, error } = await serviceClient()
    .from("miniapp_apps")
    .select(APP_COLUMNS)
    .or(`submitted_by.eq.${auth.wallet},owner_wallet.eq.${auth.wallet}`)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return jsonResponse({ apps: data ?? [] });
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const limited = await rateLimitByIp(req, "miniapp-registry", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.slice(0, 2048) : "";
    if (body?.action === "validate" && url) {
      const r = await inspect(url);
      return jsonResponse(r.body, r.status);
    }
    if (body?.action === "submit" && url) return await submit(req, url);
    if (body?.action === "mine") return await mine(req);
    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("[miniapp-registry]", error);
    return jsonResponse({ error: "The request failed. Try again." }, 500);
  }
});
