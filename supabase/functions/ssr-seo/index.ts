import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEHUB_API_BASE = "https://api.dehub.io";
const DEHUB_CDN_BASE = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/";
const APP_URL = "https://dehub.io"; // Change to actual production URL if different

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://aigxuutjaqsywioxjefr.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I";
const IMAGE_PROXY_BASE = `${SUPABASE_URL}/functions/v1/ssr-seo`;
const OG_IMAGE_BASE = `${SUPABASE_URL}/functions/v1/og-image`;
const DEHUB_LOGO = "https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/default-icon.png";
const AUDIO_OG_IMAGE = "https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/audio-wave%20(1).png";
const BLOG_SHARE_IMAGE_BASE = `${SUPABASE_URL}/functions/v1/blog-share-image`;

interface BlogManifestPost {
    slug: string;
    title: string;
    excerpt?: string;
    author?: string;
    publishedAt?: string;
    bannerImage?: string;
}

let _blogManifestCache: Map<string, BlogManifestPost> | null = null;
let _blogManifestFetchedAt = 0;

async function getBlogManifest(): Promise<Map<string, BlogManifestPost>> {
    const now = Date.now();
    if (_blogManifestCache && now - _blogManifestFetchedAt < 5 * 60 * 1000) {
        return _blogManifestCache;
    }
    // Try APP_URL (dehub.io) for the blog manifest.
    const origins = [
        APP_URL,
    ];
    for (const origin of origins) {
        try {
            const res = await fetch(`${origin}/blog-manifest.json`, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) continue;
            const ct = res.headers.get("content-type") || "";
            if (!ct.includes("json")) continue;
            const data: BlogManifestPost[] = await res.json();
            const map = new Map<string, BlogManifestPost>();
            for (const p of data) map.set(p.slug, p);
            _blogManifestCache = map;
            _blogManifestFetchedAt = now;
            return map;
        } catch (e) {
            console.error(`[SSR] blog manifest fetch failed for ${origin}`, e);
        }
    }
    return _blogManifestCache || new Map();
}


async function getBlogPost(slug: string): Promise<BlogManifestPost | null> {
    const m = await getBlogManifest();
    return m.get(slug) || null;
}

function buildBlogShareImage(post: BlogManifestPost): string {
    const p = new URLSearchParams();
    p.set("slug", post.slug);
    p.set("title", (post.title || "").slice(0, 240));
    if (post.author) p.set("author", String(post.author).slice(0, 60));
    if (post.publishedAt) {
        try {
            const d = new Date(post.publishedAt);
            p.set("date", d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));
        } catch { /* ignore */ }
    }
    if (post.bannerImage) {
        const banner = /^https?:\/\//i.test(post.bannerImage) ? post.bannerImage : `${APP_URL}${post.bannerImage.startsWith("/") ? "" : "/"}${post.bannerImage}`;
        p.set("banner", banner);
    }
    p.set("width", "1200");
    p.set("height", "630");
    p.set("format", "png");
    return `${BLOG_SHARE_IMAGE_BASE}?${p.toString()}`;
}


interface DeHubUser {
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
    aboutMe?: string;
    address?: string;
}

interface DeHubNFT {
    tokenId: number;
    name: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    imageUrls?: string[];
    videoUrl?: string;
    audioUrl?: string;
    thumbnail_url?: string;
    postType?: string;
    minterUsername?: string;
    mintername?: string;
    minterDisplayName?: string;
    minterAvatarUrl?: string;
    minterUser?: DeHubUser;
}

interface DeHubCommunity {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    member_count: number;
}

async function fetchCommunity(slug: string): Promise<DeHubCommunity | null> {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/communities?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,description,avatar_url,banner_url,member_count&limit=1`,
            {
                headers: {
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                },
            }
        );
        if (!res.ok) return null;
        const rows: DeHubCommunity[] = await res.json();
        return rows[0] ?? null;
    } catch {
        return null;
    }
}

function getExtension(path: string): string {
    const match = path.match(/\.([a-zA-Z0-9-]+)$/);
    if (!match) return "png";
    return match[1].toLowerCase();
}

function ensureAbsoluteUrl(url: string): string {
    if (!url) return DEHUB_LOGO;
    if (url.startsWith("http")) return url;
    return `${DEHUB_CDN_BASE}${url.replace(/^statics\//, "")}`;
}

/**
 * Sync with frontend src/lib/media-url.ts
 */
function buildAvatarUrl(user: DeHubUser): string {
    const apiPath = user.avatarImageUrl;
    if (!apiPath) return DEHUB_LOGO;
    if (apiPath.startsWith("http")) return apiPath;

    // Frontend logic: cdn/avatars/{address}.{ext}
    if (user.address) {
        const ext = getExtension(apiPath);
        return `${DEHUB_CDN_BASE}avatars/${user.address}.${ext}`;
    }

    // Fallback: strip statics/ and append relative path
    return `${DEHUB_CDN_BASE}${apiPath.replace(/^statics\//, "")}`;
}

function buildPostImageUrl(nft: DeHubNFT): string | null {
    // 1. Multi-image feed posts: imageUrls array → cdn/feed-images/{filename}
    if (nft.imageUrls && nft.imageUrls.length > 0) {
        const firstImg = nft.imageUrls[0];
        if (firstImg.startsWith("http")) return firstImg;
        const filename = firstImg.split("/").pop() || "";
        if (filename) return `${DEHUB_CDN_BASE}feed-images/${filename}`;
    }

    // 2. Single NFT image: imageUrl → cdn/images/{tokenId}.{ext}
    const apiPath = nft.imageUrl || nft.thumbnail_url;
    if (!apiPath) return null; // No image — caller should fall back to minter avatar
    if (apiPath.startsWith("http")) return apiPath;
    const ext = getExtension(apiPath);
    return `${DEHUB_CDN_BASE}images/${nft.tokenId}.${ext}`;
}

function getMimeType(url: string): string {
    const ext = url.split("?")[0].match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
    switch (ext) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "gif":
            return "image/gif";
        case "webp":
            return "image/webp";
        case "svg":
            return "image/svg+xml";
        default:
            return "image/png";
    }
}

function buildProxiedImageUrl(functionBaseUrl: string, imageUrl: string): string {
    // Use our own edge function as image proxy to serve correct Content-Type
    return `${functionBaseUrl}?image_url=${encodeURIComponent(imageUrl)}`;
}

function buildVideoUrl(nft: DeHubNFT): string | null {
    const videoPath = nft.videoUrl;
    if (!videoPath) return null;
    if (videoPath.startsWith("http")) return videoPath;
    return `${DEHUB_CDN_BASE}videos/${nft.tokenId}.mp4`;
}

function getVideoMimeType(url: string): string {
    const ext = url.split("?")[0].match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
    switch (ext) {
        case "webm":
            return "video/webm";
        case "mov":
            return "video/quicktime";
        default:
            return "video/mp4";
    }
}

function generateMetaHTML(data: {
    title: string;
    description: string;
    image: string;
    url: string;
    type?: string;
    twitterCard?: string;
    imageWidth?: number;
    imageHeight?: number;
    functionBaseUrl?: string;
    isBot: boolean;
    videoUrl?: string | null;
    jsonLd?: Record<string, unknown>;
}): string {
    const title = data.title.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const description = data.description.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const imageUrl = ensureAbsoluteUrl(data.image);
    // Use direct CDN URL for both og:image and twitter:image.
    // Proxied Supabase URLs lack image extensions → validators reject them, and CDN already serves correct Content-Type.
    const ogImageUrl = imageUrl;
    const twitterImageUrl = imageUrl;
    const imgWidth = data.imageWidth;
    const imgHeight = data.imageHeight;
    const mimeType = getMimeType(imageUrl);

    const isVideo = !!data.videoUrl;
    const ogType = isVideo ? "video.other" : (data.type || "website");
    const twitterCard = isVideo ? "player" : (data.twitterCard || "summary_large_image");

    // Build video-specific OG tags
    let videoTags = "";
    if (isVideo && data.videoUrl) {
        const videoMime = getVideoMimeType(data.videoUrl);
        videoTags = `
  <!-- Video OG Tags -->
  <meta property="og:video" content="${data.videoUrl}">
  <meta property="og:video:secure_url" content="${data.videoUrl}">
  <meta property="og:video:type" content="${videoMime}">
  <meta property="og:video:width" content="1280">
  <meta property="og:video:height" content="720">`;
    }

    // Build Twitter player tags for video
    let twitterVideoTags = "";
    if (isVideo && data.videoUrl) {
        twitterVideoTags = `
  <meta name="twitter:player" content="${data.videoUrl}">
  <meta name="twitter:player:width" content="1280">
  <meta name="twitter:player:height" content="720">`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>

  <!-- SEO Meta Tags -->
  <meta name="description" content="${description}">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${ogType}">
  <meta property="og:url" content="${data.url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:secure_url" content="${ogImageUrl}">
  <meta property="og:image:type" content="${mimeType}">${imgWidth ? `
  <meta property="og:image:width" content="${imgWidth}">` : ""}${imgHeight ? `
  <meta property="og:image:height" content="${imgHeight}">` : ""}
  <meta property="og:image:alt" content="${title}">
  <meta property="fb:app_id" content="966242223397117">${videoTags}

  <!-- Twitter -->
  <meta name="twitter:card" content="${twitterCard}">
  <meta name="twitter:url" content="${data.url}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${twitterImageUrl}">
  <meta name="twitter:image:alt" content="${title}">
  <meta name="twitter:site" content="@DeHubApp">${twitterVideoTags}

  ${!data.isBot
            ? `
  <meta http-equiv="refresh" content="0; url=${data.url}">
  <script>window.location.href = '${data.url}';</script>
  `
            : ""
        }

  ${data.jsonLd ? `
  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">${JSON.stringify(data.jsonLd)}</script>
  ` : ""}
</head>
<body style="font-family: sans-serif; background: black; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="max-width: 600px; text-align: center; padding: 20px;">
    <h1>${title}</h1>
    <p>${description}</p>
    <img src="${imageUrl}" style="max-width: 100%; border-radius: 12px; margin-top: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" alt="${title}" />
    <p style="margin-top: 30px;"><a href="${data.url}" style="color: #00ff00; text-decoration: none; font-weight: bold; border: 1px solid #00ff00; padding: 10px 20px; border-radius: 5px;">View on DeHub</a></p>
    <nav style="margin-top: 20px; font-size: 14px;">
      <a href="${APP_URL}/app/explore" style="color: #aaa; margin: 0 8px;">Explore</a>
      <a href="${APP_URL}/app/stages" style="color: #aaa; margin: 0 8px;">Stages</a>
      <a href="${APP_URL}/app/tv" style="color: #aaa; margin: 0 8px;">Live TV</a>
      <a href="${APP_URL}/app/governance" style="color: #aaa; margin: 0 8px;">Governance</a>
      <a href="${APP_URL}/app/stake" style="color: #aaa; margin: 0 8px;">Staking</a>
      <a href="${APP_URL}/app/leaderboard" style="color: #aaa; margin: 0 8px;">Leaderboard</a>
      <a href="${APP_URL}/app/music" style="color: #aaa; margin: 0 8px;">Music</a>
      <a href="${APP_URL}/app/features" style="color: #aaa; margin: 0 8px;">Features</a>
      <a href="${APP_URL}/app/top-100" style="color: #aaa; margin: 0 8px;">Top 100 Cryptos</a>
      <a href="${APP_URL}/app/glossary" style="color: #aaa; margin: 0 8px;">Glossary</a>
      <a href="${APP_URL}/app/bridge" style="color: #aaa; margin: 0 8px;">Bridge</a>
      <a href="${APP_URL}/app/agents" style="color: #aaa; margin: 0 8px;">AI Agents</a>
      <a href="${APP_URL}/app/assistant" style="color: #aaa; margin: 0 8px;">AI Assistant</a>
      <a href="${APP_URL}/app/buy" style="color: #aaa; margin: 0 8px;">Buy Crypto</a>
      <a href="${APP_URL}/creators" style="color: #aaa; margin: 0 8px;">Become a Creator</a>
      <a href="${APP_URL}/jobs" style="color: #aaa; margin: 0 8px;">Careers</a>
    </nav>
  </div>
</body>
</html>`;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);

        // Facebook/Twitter scrapers need proper MIME types to display images
        const proxyImageUrl = url.searchParams.get("image_url");
        if (proxyImageUrl) {
            if (!proxyImageUrl.startsWith(DEHUB_CDN_BASE) && !proxyImageUrl.startsWith("https://dehub.io/") && !proxyImageUrl.startsWith("https://aigxuutjaqsywioxjefr.supabase.co/storage/")) {
                return new Response("Forbidden", { status: 403 });
            }
            const imgResp = await fetch(proxyImageUrl);
            if (!imgResp.ok) {
                return new Response("Image not found", { status: 404 });
            }
            const body = await imgResp.arrayBuffer();
            return new Response(body, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": getMimeType(proxyImageUrl),
                    "Cache-Control": "public, max-age=86400",
                },
            });
        }

        const userAgent = req.headers.get("user-agent") || "";
        // X-Is-Bot header set by Netlify edge function (more reliable than UA sniffing here)
        // because the edge function always serves SSR HTML for shareable routes — it knows
        // whether the original requester was a bot and tells us via this header.
        const xIsBot = req.headers.get("x-is-bot");
        const isBot = xIsBot !== null
            ? xIsBot === "1"
            : /bot|facebook|twitter|linkedin|whatsapp|telegram|slack|discord|facebot|oggrabber/i.test(userAgent);

        const functionBaseUrl = IMAGE_PROXY_BASE;

        let fullPath = url.searchParams.get("path") || "/";
        const originalUrl = url.searchParams.get("original_url");
        const canonicalUrl = originalUrl || `${APP_URL}${fullPath}`;

        let cleanPath = fullPath.split("?")[0];
        if (cleanPath.startsWith("/")) cleanPath = cleanPath.substring(1);
        const pathParts = cleanPath.split("/").filter(Boolean);

        // 0. Affiliate Referral Landing (/r/{CODE}) — must run BEFORE profile handler
        if (pathParts[0]?.toLowerCase() === "r" && pathParts[1]) {
            const code = pathParts[1].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
            if (code) {
                let inviter = "A creator";
                try {
                    const r = await fetch(
                        `${SUPABASE_URL}/rest/v1/affiliate_codes?code=eq.${code}&active=eq.true&select=share_name,owner_address&limit=1`,
                        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, signal: AbortSignal.timeout(5000) },
                    );
                    if (r.ok) {
                        const rows = await r.json();
                        const row = rows[0];
                        if (row?.share_name?.trim()) inviter = row.share_name.trim();
                        else if (row?.owner_address) inviter = `${row.owner_address.slice(0, 6)}…${row.owner_address.slice(-4)}`;
                    }
                } catch { /* keep default */ }

                const referralUrl = `${APP_URL}/r/${code}`;
                const shareImage = `${SUPABASE_URL}/functions/v1/affiliate-share-image?code=${encodeURIComponent(code)}&width=1200&height=630`;
                const title = `${inviter} invited you to DeHub — earn, post & build on-chain`;
                const description = `Use invite code ${code} to join DeHub. The decentralised creator network for video, music, social, jobs and Web3.`;

                const html = generateMetaHTML({
                    title,
                    description,
                    image: shareImage,
                    url: referralUrl,
                    type: "website",
                    twitterCard: "summary_large_image",
                    imageWidth: 1200,
                    imageHeight: 630,
                    functionBaseUrl,
                    isBot,
                    jsonLd: {
                        "@context": "https://schema.org",
                        "@type": "WebPage",
                        name: title,
                        description,
                        url: referralUrl,
                        image: shareImage,
                    },
                });
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } });
            }
        }

        // 0.5 Blog post handler (/docs/blog/:slug)
        if (pathParts[0]?.toLowerCase() === "docs" && pathParts[1]?.toLowerCase() === "blog" && pathParts[2]) {
            const slug = decodeURIComponent(pathParts[2]).split("?")[0];
            const post = await getBlogPost(slug);
            if (post) {
                const canonical = `${APP_URL}/docs/blog/${slug}`;
                const image = buildBlogShareImage(post);
                const title = `${post.title} — DeHub Blog`;
                const description = (post.excerpt || `${post.title} — read on DeHub.`).slice(0, 280);
                const html = generateMetaHTML({
                    title,
                    description,
                    image,
                    url: canonical,
                    type: "article",
                    twitterCard: "summary_large_image",
                    imageWidth: 1200,
                    imageHeight: 630,
                    functionBaseUrl,
                    isBot,
                    jsonLd: {
                        "@context": "https://schema.org",
                        "@type": "Article",
                        headline: post.title,
                        image: [image],
                        datePublished: post.publishedAt,
                        author: { "@type": "Person", name: post.author || "DeHub Team" },
                        publisher: { "@type": "Organization", name: "DeHub" },
                        mainEntityOfPage: canonical,
                    },
                });
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
            }
        }

        // 1. Profile Handling (/@username or /username)
        const possibleUsername = pathParts[0] || "";
        const isSystemRoute = ["post", "app", "explore", "notifications", "messages", "settings", "r", "docs", "prompt", "premium", "affiliate", "work", "editor", "creators", "jobs", "features", "radio", "tv", "governance", "stake", "leaderboard", "music", "top-100", "glossary", "bridge", "agents", "assistant", "buy"].includes(
            possibleUsername.toLowerCase(),
        );


        if (possibleUsername && !isSystemRoute) {
            // Remove leading @ if present
            const username = possibleUsername.startsWith("@") ? possibleUsername.substring(1) : possibleUsername;
            console.log(`[SSR] Profile detected for: ${username}`);

            const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${username}`, {
                signal: AbortSignal.timeout(7000),
            });
            const userData = await response.json();
            const user: DeHubUser = userData.result || userData;

            if (user && (user.username || user.address)) {
                const displayName = user.displayName || user.username || "DeHub User";
                const profileUrl = `${APP_URL}/${user.username || username}`;
                const avatarUrl = buildAvatarUrl(user);
                const isLogoFallback = avatarUrl === DEHUB_LOGO;
                const html = generateMetaHTML({
                    title: `Join @${user.username || username} on DeHub today!`,
                    description:
                        user.aboutMe || `Connect with ${displayName} on DeHub, the open source alternative to legacy media.`,
                    image: avatarUrl,
                    url: profileUrl,
                    twitterCard: "summary",
                    imageWidth: isLogoFallback ? 200 : 400,
                    imageHeight: isLogoFallback ? 200 : 400,
                    functionBaseUrl,
                    isBot,
                    jsonLd: {
                        '@context': 'https://schema.org',
                        '@type': 'Person',
                        name: displayName,
                        url: profileUrl,
                        ...(user.aboutMe && { description: user.aboutMe }),
                        ...(avatarUrl !== DEHUB_LOGO && { image: avatarUrl }),
                        sameAs: profileUrl,
                    },
                });
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } });
            }
        }

        // 2. Community Handling (/app/communities/{slug})
        if (cleanPath.includes("/communities/")) {
            const slug = cleanPath.split("/communities/")[1].split("/")[0];
            const community = await fetchCommunity(slug);

            if (community) {
                const communityUrl = `${APP_URL}/app/communities/${community.slug}`;
                // Use avatar (profile image) for community OG card
                const ogImage = community.avatar_url || DEHUB_LOGO;
                const hasRealImage = !!community.avatar_url;
                const twitterCard = "summary";
                const title = `Join ${community.name}'s community on DeHub today`;
                const memberText = community.member_count > 0 ? ` • ${community.member_count} members` : "";
                const description = community.description
                    ? `${community.description}${memberText}`
                    : `Join the ${community.name} community on DeHub — open source, censorship resistant media.${memberText}`;

                const html = generateMetaHTML({
                    title,
                    description,
                    image: ogImage,
                    url: communityUrl,
                    type: "website",
                    twitterCard,
                    imageWidth: 400,
                    imageHeight: 400,
                    functionBaseUrl,
                    isBot,
                    jsonLd: {
                        "@context": "https://schema.org",
                        "@type": "Organization",
                        name: community.name,
                        url: communityUrl,
                        ...(community.description && { description: community.description }),
                        ...(hasRealImage && { image: ogImage }),
                    },
                });
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } });
            }
        }

        // 3. Unified Post Handling (/app/post/{tokenId} for both image and video posts)
        if (cleanPath.includes("/post/")) {
            const postId = cleanPath.split("/post/")[1].split("/")[0];

            const response = await fetch(`${DEHUB_API_BASE}/api/nft_info/${postId}`, {
                signal: AbortSignal.timeout(7000),
            });
            const nftData = await response.json();
            const nft: DeHubNFT = nftData.result || nftData;

            if (nft) {
                const posterName = nft.minterDisplayName || nft.mintername || nft.minterUsername || "someone";
                // trim() prevents nft.name=" " (whitespace-only) from being used as title —
                // X/Twitter ignores cards with blank titles
                const title = (nft.title || nft.name || "").trim() || `Post by ${posterName} on DeHub`;
                const description = (`View this post by ${posterName} on DeHub` + (nft.description ? ` — ${nft.description}` : "")).trim();
                const postUrl = `${APP_URL}/app/post/${postId}`;

                const isAudio = nft.postType === "feed-audio";
                const videoUrl = isAudio ? null : buildVideoUrl(nft);

                let postImage: string;
                let hasRealImage = false;
                if (isAudio) {
                    postImage = buildProxiedImageUrl(IMAGE_PROXY_BASE, AUDIO_OG_IMAGE);
                    hasRealImage = true;
                } else if (videoUrl) {
                    postImage = ensureAbsoluteUrl(nft.thumbnail_url || nft.imageUrl || "") || DEHUB_LOGO;
                    hasRealImage = !!(nft.thumbnail_url || nft.imageUrl);
                } else {
                    const builtImage = buildPostImageUrl(nft);
                    if (builtImage) {
                        postImage = builtImage;
                        hasRealImage = true;
                    } else {
                        // Text post (no image, no video) — generate a dynamic OG card
                        // that renders the post text as a styled 1200×630 PNG, similar
                        // to how X/Twitter shows "tweet screenshot" cards when sharing.
                        const postText = (nft.title || nft.name || "").trim();
                        if (postText) {
                            postImage = `${OG_IMAGE_BASE}?post_id=${postId}`;
                            hasRealImage = true;
                        } else {
                            // Absolute fallback: minter avatar (no text to render)
                            const minter = nft.minterUser;
                            postImage = minter ? buildAvatarUrl(minter) : DEHUB_LOGO;
                            hasRealImage = false;
                        }
                    }
                }

                // summary_large_image expects landscape images (posts with real images/video)
                // summary works for square avatars and logo fallbacks
                const twitterCardType = hasRealImage ? "summary_large_image" : "summary";

                const html = generateMetaHTML({
                    title,
                    description,
                    image: postImage,
                    url: postUrl,
                    type: "article",
                    twitterCard: twitterCardType,
                    functionBaseUrl,
                    isBot,
                    videoUrl,
                    jsonLd: {
                        '@context': 'https://schema.org',
                        '@type': 'Article',
                        headline: title,
                        description,
                        url: postUrl,
                        ...(nft.minterDisplayName && { author: { '@type': 'Person', name: nft.minterDisplayName } }),
                        publisher: { '@type': 'Organization', name: 'DeHub', url: 'https://dehub.io' },
                        ...(postImage && { image: postImage }),
                    },
                });
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } });
            }
        }

        // 4. Static marketing/app routes — per-route title & description so shares
        // on Telegram/X/Facebook show the right preview instead of the sitewide default.
        const STATIC_ROUTES: Record<string, { title: string; description: string }> = {
            "features": {
                title: "Features — DeHub",
                description: "Every DeHub feature in one place: decentralized social feed, video, music, live TV, DHB token, AI creator studio, jobs and Web3 payments.",
            },
            "pricing": {
                title: "Pricing — DeHub Creator Studio",
                description: "DeHub Creator Studio pricing in GBP. Ultra, Team and Scale plans with monthly credits for AI image, video, music and poster generation.",
            },
            "creator": {
                title: "DeHub Creator Studio — AI Image, Video & Music",
                description: "Generate images, videos, songs and branded posters with the DeHub Creator Studio. One workspace for every AI tool a modern creator needs.",
            },
            "editor": {
                title: "DeHub Video Editor — In-Browser Timeline",
                description: "Edit video in your browser with the DeHub multi-track timeline, effects, transitions and one-click publish to the decentralized feed.",
            },
            "prompt": {
                title: "DeHub Prompt — Personalize Your Feed",
                description: "Tell DeHub what you want to see and shape a feed that actually matches your taste. Prompt-powered personalization for Web3 social.",
            },
            "work": {
                title: "DeHub Work — Web3 Jobs, Clipping & Escrow",
                description: "Open jobs for commenting, clipping (paid per view) and on-chain contracts with escrow and disputes on Base. Get paid to create on DeHub.",
            },
            "affiliate": {
                title: "DeHub Affiliate — Earn 20% Revenue Share",
                description: "Refer creators to DeHub and earn 20% of the revenue they generate, plus 5% from second-tier invites. Transparent on-chain payouts.",
            },
            "premium": {
                title: "DeHub Extra — Premium Membership",
                description: "Unlock DeHub Extra: bigger uploads, priority AI credits, exclusive drops and creator perks across DeHub.",
            },
            "governance": {
                title: "DeHub Governance — Vote with DHB",
                description: "Propose and vote on the future of DeHub with the DHB token. Transparent, on-chain governance for the decentralized social network.",
            },
            "leaderboard": {
                title: "DeHub Leaderboard — Top Creators & Stakers",
                description: "See the top DeHub creators, DHB stakers and community leaders across Base and BNB Chain.",
            },
            "top-100": {
                title: "Top 100 Cryptos — Live Prices on DeHub",
                description: "Track the top 100 cryptocurrencies with live prices, market cap and charts inside DeHub.",
            },
            "music": {
                title: "DeHub Music — Web3 Songs & Radio",
                description: "Discover songs and radio stations from Web3 artists on DeHub. Stream, tip and collect on-chain.",
            },
            "radio": {
                title: "DeHub Radio — 24/7 Web3 Stations",
                description: "Tune into DeHub Radio for 24/7 stations curated by the Web3 community.",
            },
            "tv": {
                title: "DeHub TV — Live Streams & Shows",
                description: "Watch live streams and shows from creators across DeHub TV.",
            },
            "glossary": {
                title: "DeHub Glossary — Web3 & DeFi Terms",
                description: "Plain-English definitions for Web3, DeFi and DeHub-specific terms.",
            },
            "bridge": {
                title: "DeHub Bridge — Move DHB Cross-Chain",
                description: "Bridge DHB between BNB Chain and Base securely from inside DeHub.",
            },
            "agents": {
                title: "DeHub Agents — AI Assistants for Creators",
                description: "Custom AI agents that help you post, edit, moderate and grow on DeHub.",
            },
            "assistant": {
                title: "DeHub Assistant — Your Creator AI",
                description: "Chat with the DeHub Assistant to generate posts, images, videos and songs in seconds.",
            },
            "creators": {
                title: "Creators on DeHub — Discover & Follow",
                description: "Discover creators building on DeHub and follow the ones that match your taste.",
            },
            "jobs": {
                title: "DeHub Jobs — Work with the Team",
                description: "Open roles at DeHub. Help build the decentralized social network.",
            },
            "delete-account": {
                title: "Delete Account and Data — DeHub",
                description: "Permanently delete your DeHub account and associated data.",
            },
            "guides/best-decentralized-social-media": {
                title: "Best Decentralized Social Media 2026 — DeHub Guide",
                description: "Compare DeHub, Mastodon, Bluesky, Farcaster and Lens — features, tokens, moderation and how to choose the right decentralized social network.",
            },
        };

        // Per-route OG share images (1200×630, dark mono, DeHub wordmark).
        // CDN-served via Lovable Assets so social crawlers get the right preview.
        const STATIC_ROUTE_IMAGES: Record<string, string> = {
            "features":    "https://dehub.io/__l5e/assets-v1/d8db86c9-6dac-4b0b-860f-fee14a965c91/features.png",
            "pricing":     "https://dehub.io/__l5e/assets-v1/bfd6d5d6-bacf-4dea-96a2-be3a1371d78d/pricing.png",
            "creator":     "https://dehub.io/__l5e/assets-v1/fcbce8b8-50a4-4c01-af3c-6d86bc53ea48/creator.png",
            "editor":      "https://dehub.io/__l5e/assets-v1/8e8c7196-4aca-4f40-b512-06c13d4db34d/editor.png",
            "prompt":      "https://dehub.io/__l5e/assets-v1/ebfafb49-db47-44e4-ad02-8fe40c12c412/prompt.png",
            "premium":     "https://dehub.io/__l5e/assets-v1/44996c46-ea77-462c-845f-3ebf22ed7ec0/premium.png",
            "affiliate":   "https://dehub.io/__l5e/assets-v1/f5e79149-e7ac-4eb3-a1fd-d007e2c0c673/affiliate.png",
            "governance":  "https://dehub.io/__l5e/assets-v1/d941d317-bdce-4210-8da3-63d5846e500b/governance.png",
            "leaderboard": "https://dehub.io/__l5e/assets-v1/18833790-70b5-4077-9ede-f2005b263e93/leaderboard.png",
            "top-100":     "https://dehub.io/__l5e/assets-v1/09bcace7-fe93-4176-a259-4cefd859b59e/top-100.png",
            "music":       "https://dehub.io/__l5e/assets-v1/50f08ba0-d4f2-4f48-8276-6161c70da966/music.png",
            "tv":          "https://dehub.io/__l5e/assets-v1/12b98dbb-bcba-429f-9956-7118c447985a/tv.png",
            "agents":      "https://dehub.io/__l5e/assets-v1/ef064781-7419-43d2-beda-747320a36a49/agents.png",
            "assistant":   "https://dehub.io/__l5e/assets-v1/4536d501-bc3a-403b-979b-ea7885c685ad/assistant.png",
            "creators":    "https://dehub.io/__l5e/assets-v1/fae9d28d-a391-4ddd-aed1-a91cbfee0ae5/creators.png",
            "bridge":      "https://dehub.io/__l5e/assets-v1/f1d02806-409b-498e-8c59-ff44b17ecd90/bridge.png",
            "guides/best-decentralized-social-media": "https://dehub.io/__l5e/assets-v1/c2d40758-fdae-4b6f-9f93-080061013b7a/guides-best-decentralized-social-media.png",
        };
        const DEFAULT_OG_IMAGE = "https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo//Screenshot%202026-03-20%20225233.png";

        const rawKey = cleanPath.replace(/^\/+|\/+$/g, "").toLowerCase();
        // Product pages live under /app/*; accept both `/slug` and `/app/slug`.
        const normalizedKey = STATIC_ROUTES[rawKey] ? rawKey : rawKey.replace(/^app\//, "");
        const staticMatch = STATIC_ROUTES[normalizedKey];
        if (staticMatch) {
            const routeImage = STATIC_ROUTE_IMAGES[normalizedKey] || DEFAULT_OG_IMAGE;
            const html = generateMetaHTML({
                title: staticMatch.title,
                description: staticMatch.description,
                image: routeImage,
                url: `${APP_URL}/${normalizedKey}`,
                twitterCard: "summary_large_image",
                imageWidth: 1200,
                imageHeight: 630,
                functionBaseUrl,
                isBot,
                jsonLd: {
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    name: staticMatch.title,
                    description: staticMatch.description,
                    url: `${APP_URL}/${normalizedKey}`,
                },
            });
            return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
        }

        // Default Fallback
        const html = generateMetaHTML({
            title: "DeHub — Open Source, User Owned & Censorship Resistant Media",
            description:
                "dehub.io is open source, user owned and censorship resistant media. Join the future of free speech and reach.",
            image: "https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo//Screenshot%202026-03-20%20225233.png",
            url: canonicalUrl,
            twitterCard: "summary_large_image",
            imageWidth: 1200,
            imageHeight: 628,
            functionBaseUrl,
            isBot,
            jsonLd: {
                '@context': 'https://schema.org',
                '@graph': [
                    {
                        '@type': 'WebSite',
                        name: 'DeHub',
                        url: 'https://dehub.io',
                        description: 'Open source, user owned and censorship resistant media.',
                        potentialAction: {
                            '@type': 'SearchAction',
                            target: 'https://dehub.io/app/explore?q={search_term_string}',
                            'query-input': 'required name=search_term_string',
                        },
                    },
                    {
                        '@type': 'Organization',
                        name: 'DeHub',
                        url: 'https://dehub.io',
                        logo: 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/default-icon.png',
                        sameAs: ['https://x.com/DeHubApp'],
                    },
                ],
            },
        });
        return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
    } catch (e) {
        console.error("SSR SEO Error:", e);
        return new Response("Error", { status: 500 });
    }
});
