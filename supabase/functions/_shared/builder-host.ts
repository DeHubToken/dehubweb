// DeHub Builder app hosting — shared by builder-api and builder-serve.
//
// Every Builder app is served from its own subdomain, https://<slug>.dhb.gg,
// by the dehub-builder-apps Cloudflare Worker (workers/builder-apps). dhb.gg
// is a separate registrable domain on purpose: the apps run AI-written code, so
// they must never share a site with dehub.io (cookies, storage, link trust).
//
// Private apps are only reachable through a signed preview path the owner gets
// from builder-api: https://<slug>.dhb.gg/~t/<token>/ — the token sits in the
// path rather than a cookie so relative assets (app.js, style.css) inherit it,
// and so it still works inside a cross-site iframe where cookies are blocked.

export const BUILDER_APPS_DOMAIN = "dhb.gg";

/** Subdomains a Builder app may never take. */
const RESERVED_SLUGS = new Set([
  "www", "api", "app", "apps", "admin", "mail", "smtp", "ftp", "cdn", "static",
  "assets", "dehub", "staging", "dev", "test", "status", "help", "support",
  "docs", "blog", "store", "download", "downloads", "auth", "login", "id",
  "wallet", "pay", "billing", "ns1", "ns2", "mx", "origin",
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use 3-40 lowercase letters, numbers or dashes, starting and ending with a letter or number.";
  if (slug.includes("--")) return "No double dashes.";
  if (RESERVED_SLUGS.has(slug)) return "That name is reserved.";
  return null;
}

/** "My Cool App!" → "my-cool-app" (may be empty or too short; callers suffix). */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

export function appOrigin(slug: string): string {
  return `https://${slug}.${BUILDER_APPS_DOMAIN}`;
}

// ---------------------------------------------------------------------------
// Signed preview tokens: base64url("<projectId>.<expUnix>") + "." + HMAC
// ---------------------------------------------------------------------------

const PREVIEW_TTL_S = 6 * 60 * 60;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmac(data: string): Promise<string> {
  const secret = Deno.env.get("BUILDER_PREVIEW_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`builder-preview:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

export async function signPreviewToken(projectId: string, ttlS = PREVIEW_TTL_S): Promise<{ token: string; expiresAt: string }> {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  const payload = b64url(new TextEncoder().encode(`${projectId}.${exp}`));
  return { token: `${payload}.${await hmac(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** The project id a valid, unexpired token was issued for, else null. */
export async function verifyPreviewToken(token: string): Promise<string | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if ((await hmac(payload)) !== sig) return null;
  let decoded: string;
  try {
    decoded = fromB64url(payload);
  } catch {
    return null;
  }
  const [projectId, expRaw] = decoded.split(".");
  if (!projectId || Number(expRaw) * 1000 < Date.now()) return null;
  return projectId;
}

export const FILE_CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
};

export function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return FILE_CONTENT_TYPES[ext] ?? "text/plain; charset=utf-8";
}
