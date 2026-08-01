const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Kind = "photo" | "video" | "animation" | "graphic" | "gif" | "audio";
type Orientation = "all" | "landscape" | "portrait" | "square";

interface Asset {
  id: string;
  source: "Openverse" | "Wikimedia Commons" | "Pexels" | "Pixabay";
  kind: Kind;
  title: string;
  creator: string;
  creatorUrl?: string;
  thumbnailUrl: string;
  previewUrl?: string;
  downloadUrl: string;
  landingUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  license: string;
  licenseUrl?: string;
  attributionRequired: boolean;
  attributionText: string;
}

interface ProviderResult {
  items: Asset[];
  hasMore: boolean;
  total?: number;
  provider: string;
}

// Openverse anonymous requests reject page sizes above 20.
const PAGE_SIZE = 20;
const DEFAULT_QUERY: Record<Kind, string> = {
  photo: "nature",
  video: "ocean",
  animation: "abstract",
  graphic: "illustration",
  gif: "funny",
  audio: "whoosh",
};

function text(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function fileTitle(value: string): string {
  return value.replace(/^File:/i, "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").trim();
}

function matchesOrientation(asset: Asset, orientation: Orientation): boolean {
  if (orientation === "all" || !asset.width || !asset.height) return true;
  const ratio = asset.width / asset.height;
  if (orientation === "square") return ratio >= 0.86 && ratio <= 1.14;
  return orientation === "landscape" ? ratio > 1.14 : ratio < 0.86;
}

async function json(url: URL | string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${new URL(String(url)).hostname} returned ${response.status}`);
  return response.json();
}

async function openverse(kind: Kind, query: string, page: number, orientation: Orientation): Promise<ProviderResult> {
  const endpoint = kind === "audio" ? "audio" : "images";
  const url = new URL(`https://api.openverse.org/v1/${endpoint}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("license", "cc0,pdm,by,by-sa");
  url.searchParams.set("mature", "false");
  if (kind === "photo") url.searchParams.set("categories", "photograph");
  if (kind === "graphic") url.searchParams.set("categories", "illustration,digitized_art");
  const data = await json(url);
  const items = (data.results || []).flatMap((row: Record<string, unknown>): Asset[] => {
    const downloadUrl = String(row.url || "");
    const landingUrl = String(row.foreign_landing_url || row.detail_url || "");
    if (!downloadUrl || !landingUrl) return [];
    const size = Number(info.size) || 0;
    const duration = Number(info.duration) || 0;
    const mimeType = String(info.mime || "");
    if ((kind === "video" || kind === "animation") && (mimeType !== "video/webm" || duration > 180 || size > 250 * 1024 * 1024)) return [];
    if (kind === "gif" && size > 50 * 1024 * 1024) return [];
    if (kind === "audio" && duration > 600) return [];
    const code = String(row.license || "").toUpperCase();
    const version = String(row.license_version || "");
    const license = code === "PDM" ? "Public domain" : `${code}${version ? ` ${version}` : ""}`;
    const creator = text(row.creator) || "Unknown creator";
    const title = text(row.title) || "Untitled";
    const asset: Asset = {
      id: `openverse:${String(row.id)}`,
      source: "Openverse",
      kind,
      title,
      creator,
      creatorUrl: String(row.creator_url || "") || undefined,
      thumbnailUrl: String(row.thumbnail || (kind === "audio" ? "" : downloadUrl)),
      previewUrl: kind === "audio" ? downloadUrl : undefined,
      downloadUrl,
      landingUrl,
      mimeType: String(row.mime_type || (kind === "audio" ? "audio/mpeg" : "image/jpeg")),
      width: Number(row.width) || undefined,
      height: Number(row.height) || undefined,
      duration: kind === "audio" && Number(row.duration) ? Number(row.duration) / 1000 : undefined,
      license,
      licenseUrl: String(row.license_url || "") || undefined,
      attributionRequired: !["CC0", "PDM"].includes(code),
      attributionText: `${title} by ${creator}, ${license}, via Openverse`,
    };
    return matchesOrientation(asset, orientation) ? [asset] : [];
  });
  return { items, hasMore: page < Number(data.page_count || page), total: Number(data.result_count) || undefined, provider: "Openverse" };
}

async function commons(kind: Kind, query: string, page: number, orientation: Orientation): Promise<ProviderResult> {
  const filter = kind === "gif" ? "filemime:image/gif" : `filetype:${kind === "animation" ? "video" : kind}`;
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `${kind === "animation" ? "animation " : ""}${query} ${filter}`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(PAGE_SIZE));
  url.searchParams.set("gsroffset", String((page - 1) * PAGE_SIZE));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("iiurlwidth", "480");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");
  const data = await json(url);
  const items = (data.query?.pages || []).flatMap((row: Record<string, unknown>): Asset[] => {
    const info = (row.imageinfo as Array<Record<string, unknown>> | undefined)?.[0];
    if (!info) return [];
    const meta = (info.extmetadata || {}) as Record<string, { value?: unknown }>;
    const downloadUrl = String(info.url || "");
    const landingUrl = String(info.descriptionurl || "");
    if (!downloadUrl || !landingUrl) return [];
    const title = text(meta.ObjectName?.value) || fileTitle(String(row.title || "Untitled"));
    const creator = text(meta.Artist?.value) || "Wikimedia Commons contributor";
    const license = text(meta.LicenseShortName?.value) || text(meta.UsageTerms?.value) || "Free licence";
    const asset: Asset = {
      id: `wikimedia:${String(row.pageid)}`,
      source: "Wikimedia Commons",
      kind,
      title,
      creator,
      thumbnailUrl: String(info.thumburl || (kind === "audio" ? "" : downloadUrl)),
      previewUrl: kind === "audio" ? downloadUrl : undefined,
      downloadUrl,
      landingUrl,
      mimeType: mimeType || (kind === "audio" ? "audio/ogg" : kind === "gif" ? "image/gif" : "video/webm"),
      width: Number(info.width) || undefined,
      height: Number(info.height) || undefined,
      duration: duration || undefined,
      license,
      licenseUrl: text(meta.LicenseUrl?.value) || undefined,
      attributionRequired: String(meta.AttributionRequired?.value).toLowerCase() === "true",
      attributionText: `${title} by ${creator}, ${license}, via Wikimedia Commons`,
    };
    return matchesOrientation(asset, orientation) ? [asset] : [];
  });
  return { items, hasMore: Boolean(data.continue), provider: "Wikimedia Commons" };
}

async function pexels(kind: Kind, query: string, page: number, orientation: Orientation, key: string): Promise<ProviderResult> {
  const requested = orientation === "all" ? undefined : orientation;
  const endpoint = kind === "video" ? "videos/search" : "search";
  const url = new URL(`https://api.pexels.com/v1/${endpoint}`);
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PAGE_SIZE));
  if (requested) url.searchParams.set("orientation", requested);
  const data = await json(url, { headers: { Authorization: key } });
  const rows = kind === "video" ? data.videos || [] : data.photos || [];
  const items = rows.flatMap((row: Record<string, any>): Asset[] => {
    if (kind === "video") {
      const files = [...(row.video_files || [])].filter((file) => file.link && file.file_type?.startsWith("video/"));
      files.sort((a, b) => Math.abs((a.width || 0) - 1920) - Math.abs((b.width || 0) - 1920));
      const file = files[0];
      if (!file) return [];
      const creator = text(row.user?.name) || "Pexels creator";
      return [{
        id: `pexels:${row.id}`, source: "Pexels", kind, title: `Pexels video ${row.id}`, creator,
        creatorUrl: row.user?.url, thumbnailUrl: String(row.image || ""), downloadUrl: file.link,
        landingUrl: String(row.url || "https://www.pexels.com/videos/"), mimeType: file.file_type || "video/mp4",
        width: Number(file.width) || Number(row.width) || undefined, height: Number(file.height) || Number(row.height) || undefined,
        duration: Number(row.duration) || undefined, license: "Pexels licence", licenseUrl: "https://www.pexels.com/license/",
        attributionRequired: false, attributionText: `Video by ${creator} on Pexels`,
      }];
    }
    const creator = text(row.photographer) || "Pexels photographer";
    const title = text(row.alt) || `Pexels photo ${row.id}`;
    return [{
      id: `pexels:${row.id}`, source: "Pexels", kind, title, creator, creatorUrl: row.photographer_url,
      thumbnailUrl: String(row.src?.medium || row.src?.small || ""), downloadUrl: String(row.src?.large2x || row.src?.original || ""),
      landingUrl: String(row.url || "https://www.pexels.com/"), mimeType: "image/jpeg", width: Number(row.width) || undefined,
      height: Number(row.height) || undefined, license: "Pexels licence", licenseUrl: "https://www.pexels.com/license/",
      attributionRequired: false, attributionText: `${title} by ${creator} on Pexels`,
    }];
  });
  return { items, hasMore: Boolean(data.next_page), total: Number(data.total_results) || undefined, provider: "Pexels" };
}

async function pixabay(kind: Kind, query: string, page: number, orientation: Orientation, key: string): Promise<ProviderResult> {
  const isVideo = kind === "video" || kind === "animation";
  const url = new URL(`https://pixabay.com/api/${isVideo ? "videos/" : ""}`);
  url.searchParams.set("key", key);
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PAGE_SIZE));
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("order", "popular");
  if (orientation !== "all" && !isVideo) url.searchParams.set("orientation", orientation === "square" ? "all" : orientation === "landscape" ? "horizontal" : "vertical");
  if (kind === "graphic") url.searchParams.set("image_type", "illustration");
  if (kind === "animation") url.searchParams.set("video_type", "animation");
  const data = await json(url);
  const items = (data.hits || []).flatMap((row: Record<string, any>): Asset[] => {
    const creator = text(row.user) || "Pixabay creator";
    const title = text(row.tags)?.split(",")[0] || `Pixabay ${isVideo ? "video" : "image"} ${row.id}`;
    if (isVideo) {
      const file = row.videos?.medium || row.videos?.small || row.videos?.large;
      if (!file?.url) return [];
      const asset: Asset = {
        id: `pixabay:${row.id}`, source: "Pixabay", kind, title, creator,
        creatorUrl: row.user_id ? `https://pixabay.com/users/${encodeURIComponent(row.user)}-${row.user_id}/` : undefined,
        thumbnailUrl: file.thumbnail || "", downloadUrl: file.url, landingUrl: row.pageURL, mimeType: "video/mp4",
        width: Number(file.width) || undefined, height: Number(file.height) || undefined, duration: Number(row.duration) || undefined,
        license: "Pixabay Content License", licenseUrl: "https://pixabay.com/service/license-summary/",
        attributionRequired: false, attributionText: `${title} by ${creator} on Pixabay`,
      };
      return matchesOrientation(asset, orientation) ? [asset] : [];
    }
    const asset: Asset = {
      id: `pixabay:${row.id}`, source: "Pixabay", kind, title, creator,
      creatorUrl: row.user_id ? `https://pixabay.com/users/${encodeURIComponent(row.user)}-${row.user_id}/` : undefined,
      thumbnailUrl: row.webformatURL || row.previewURL, downloadUrl: row.largeImageURL || row.webformatURL,
      landingUrl: row.pageURL, mimeType: "image/jpeg", width: Number(row.imageWidth || row.webformatWidth) || undefined,
      height: Number(row.imageHeight || row.webformatHeight) || undefined, license: "Pixabay Content License",
      licenseUrl: "https://pixabay.com/service/license-summary/", attributionRequired: false,
      attributionText: `${title} by ${creator} on Pixabay`,
    };
    return matchesOrientation(asset, orientation) ? [asset] : [];
  });
  return { items, hasMore: page * PAGE_SIZE < Number(data.totalHits || 0), total: Number(data.totalHits) || undefined, provider: "Pixabay" };
}

function interleave(groups: Asset[][]): Asset[] {
  const result: Asset[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const asset = group[index];
      if (asset && !seen.has(asset.downloadUrl)) {
        seen.add(asset.downloadUrl);
        result.push(asset);
      }
    }
  }
  return result;
}

async function search(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const kind = (["photo", "video", "animation", "graphic", "gif", "audio"].includes(body.kind) ? body.kind : "photo") as Kind;
  const query = String(body.query || DEFAULT_QUERY[kind]).trim().slice(0, 100) || DEFAULT_QUERY[kind];
  const page = Math.max(1, Math.min(100, Number(body.page) || 1));
  const orientation = (["all", "landscape", "portrait", "square"].includes(body.orientation) ? body.orientation : "all") as Orientation;
  const pexelsKey = Deno.env.get("PEXELS_API_KEY") || "";
  const pixabayKey = Deno.env.get("PIXABAY_API_KEY") || "";
  const calls: Array<Promise<ProviderResult>> = [];

  if (["photo", "graphic", "audio"].includes(kind)) calls.push(openverse(kind, query, page, orientation));
  if (["video", "animation", "gif", "audio"].includes(kind)) calls.push(commons(kind, query, page, orientation));
  if (pexelsKey && ["photo", "video"].includes(kind)) calls.push(pexels(kind, query, page, orientation, pexelsKey));
  if (pixabayKey && ["photo", "video", "animation", "graphic"].includes(kind)) calls.push(pixabay(kind, query, page, orientation, pixabayKey));

  const settled = await Promise.allSettled(calls);
  const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!results.length) {
    const reasons = settled.flatMap((result) => result.status === "rejected" ? [String(result.reason)] : []);
    throw new Error(reasons[0] || "No asset providers are available");
  }
  const items = interleave(results.map((result) => result.items));
  const total = results.reduce((sum, result) => sum + (result.total || 0), 0) || undefined;
  return new Response(JSON.stringify({
    items,
    page,
    hasMore: results.some((result) => result.hasMore),
    total,
    providers: results.map((result) => result.provider),
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400" },
  });
}

const proxyHosts = [
  "api.openverse.org", "upload.wikimedia.org", "images.pexels.com", "videos.pexels.com",
  "cdn.pixabay.com", "live.staticflickr.com", "cdn.freesound.org", "freemusicarchive.org", "archive.org",
];

function allowedDownload(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    return proxyHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)) ? url : null;
  } catch {
    return null;
  }
}

async function proxyDownload(req: Request): Promise<Response> {
  const target = allowedDownload(new URL(req.url).searchParams.get("download") || "");
  if (!target) return new Response(JSON.stringify({ error: "Download host is not allowed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const upstream = await fetch(target, { headers: { "User-Agent": "DeHub-Editor/1.0" }, redirect: "follow" });
  if (!upstream.ok || !upstream.body) return new Response(JSON.stringify({ error: "Provider download failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/octet-stream");
  const length = upstream.headers.get("Content-Length");
  if (length) headers.set("Content-Length", length);
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(upstream.body, { status: 200, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (req.method === "GET" && new URL(req.url).searchParams.has("download")) return await proxyDownload(req);
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return await search(req);
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Asset search failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
