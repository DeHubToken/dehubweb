import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEHUB_API_BASE = "https://api.dehub.io";
const DEHUB_CDN_BASE = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/";
const APP_URL = "https://dehub.io"; // Change to actual production URL if different

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const IMAGE_PROXY_BASE = `${SUPABASE_URL}/functions/v1/ssr-seo`;
const DEHUB_LOGO = "https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/default-icon.png";

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
    minterDisplayName?: string;
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

function buildPostImageUrl(nft: DeHubNFT): string {
    // 1. Multi-image feed posts: imageUrls array → cdn/feed-images/{filename}
    if (nft.imageUrls && nft.imageUrls.length > 0) {
        const firstImg = nft.imageUrls[0];
        if (firstImg.startsWith("http")) return firstImg;
        const filename = firstImg.split("/").pop() || "";
        if (filename) return `${DEHUB_CDN_BASE}feed-images/${filename}`;
    }

    // 2. Single NFT image: imageUrl → cdn/images/{tokenId}.{ext}
    const apiPath = nft.imageUrl || nft.thumbnail_url;
    if (!apiPath) return "https://dehub.io/og-image.png";
    if (apiPath.startsWith("http")) return apiPath;
    const ext = getExtension(apiPath);
    return `${DEHUB_CDN_BASE}images/${nft.tokenId}.${ext}`;
}

function getMimeType(url: string): string {
    if (url.includes("audio_og=")) return "image/svg+xml";
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

function escapeXml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** Deterministic LCG seeded by tokenId — produces a consistent waveform per post. */
function seededVal(seed: number, i: number): number {
    const x = Math.sin(seed * 9301 + i * 49297 + 233) * 100003;
    return x - Math.floor(x);
}

function generateAudioOgSvg(nft: DeHubNFT): string {
    const W = 1200;
    const H = 630;
    const BAR_COUNT = 80;
    const CENTER_Y = H / 2;
    const MAX_BAR_H = H * 0.52;
    const BAR_AREA_W = W * 0.84;
    const BAR_AREA_X = (W - BAR_AREA_W) / 2;
    const GAP = 3;
    const BAR_W = (BAR_AREA_W - GAP * (BAR_COUNT - 1)) / BAR_COUNT;
    const seed = nft.tokenId;

    let barsSvg = "";
    for (let i = 0; i < BAR_COUNT; i++) {
        // Smooth with neighbours, apply bell-curve envelope so edges taper
        const r0 = seededVal(seed, i - 1);
        const r1 = seededVal(seed, i);
        const r2 = seededVal(seed, i + 1);
        const smooth = (r0 + r1 * 2 + r2) / 4;
        // Bell envelope: peaks in the middle, lower at edges
        const t = i / (BAR_COUNT - 1);
        const envelope = 0.15 + 0.85 * Math.sin(Math.PI * t);
        const barH = Math.max(4, smooth * envelope * MAX_BAR_H * 0.9 + MAX_BAR_H * 0.06);
        const x = BAR_AREA_X + i * (BAR_W + GAP);
        const y = CENTER_Y - barH / 2;
        const rx = Math.min(2, BAR_W / 2);
        barsSvg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${BAR_W.toFixed(1)}" height="${barH.toFixed(1)}" rx="${rx}" fill="rgba(255,255,255,0.22)"/>`;
    }

    const posterName = escapeXml(nft.minterDisplayName || nft.minterUsername || "DeHub");
    const desc = escapeXml((nft.description || "").slice(0, 100));
    const cx = W / 2;
    const cy = H / 2;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#16161e"/>
      <stop offset="100%" stop-color="#080810"/>
    </radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="60" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="420" ry="200" fill="rgba(255,255,255,0.025)" filter="url(#glow)"/>
  ${barsSvg}
  <circle cx="${cx}" cy="${cy}" r="46" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>
  <polygon points="${(cx - 14).toFixed(1)},${(cy - 16).toFixed(1)} ${(cx + 18).toFixed(1)},${cy.toFixed(1)} ${(cx - 14).toFixed(1)},${(cy + 16).toFixed(1)}" fill="white" opacity="0.92"/>
  <text x="${cx}" y="${H - 88}" font-family="system-ui,-apple-system,sans-serif" font-size="28" font-weight="600" fill="rgba(255,255,255,0.88)" text-anchor="middle">${posterName}</text>
  ${desc ? `<text x="${cx}" y="${H - 52}" font-family="system-ui,-apple-system,sans-serif" font-size="19" fill="rgba(255,255,255,0.45)" text-anchor="middle">${desc}</text>` : ""}
  <text x="48" y="50" font-family="system-ui,-apple-system,sans-serif" font-size="20" font-weight="700" fill="rgba(255,255,255,0.28)">DeHub</text>
</svg>`;
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
</head>
<body style="font-family: sans-serif; background: black; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="max-width: 600px; text-align: center; padding: 20px;">
    <h1>${title}</h1>
    <p>${description}</p>
    <img src="${imageUrl}" style="max-width: 100%; border-radius: 12px; margin-top: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
    <p style="margin-top: 30px;"><a href="${data.url}" style="color: #00ff00; text-decoration: none; font-weight: bold; border: 1px solid #00ff00; padding: 10px 20px; border-radius: 5px;">View on DeHub</a></p>
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

        // Audio post OG image: returns a seeded SVG waveform for the given tokenId
        const audioOgId = url.searchParams.get("audio_og");
        if (audioOgId) {
            const response = await fetch(`${DEHUB_API_BASE}/api/nft_info/${audioOgId}`);
            const nftData = await response.json();
            const nft: DeHubNFT = nftData.result || nftData;
            const svg = generateAudioOgSvg(nft);
            return new Response(svg, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "image/svg+xml",
                    "Cache-Control": "public, max-age=86400",
                },
            });
        }

        // Facebook/Twitter scrapers need proper MIME types to display images
        const proxyImageUrl = url.searchParams.get("image_url");
        if (proxyImageUrl) {
            if (!proxyImageUrl.startsWith(DEHUB_CDN_BASE) && !proxyImageUrl.startsWith("https://dehub.io/")) {
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
        const isBot = /bot|facebook|twitter|linkedin|whatsapp|telegram|slack|discord|facebot|oggrabber/i.test(userAgent);

        const functionBaseUrl = IMAGE_PROXY_BASE;

        let fullPath = url.searchParams.get("path") || "/";
        const originalUrl = url.searchParams.get("original_url");
        const canonicalUrl = originalUrl || `${APP_URL}${fullPath}`;

        let cleanPath = fullPath.split("?")[0];
        if (cleanPath.startsWith("/")) cleanPath = cleanPath.substring(1);
        const pathParts = cleanPath.split("/").filter(Boolean);

        // 1. Profile Handling (/@username or /username)
        const possibleUsername = pathParts[0] || "";
        const isSystemRoute = ["post", "app", "explore", "notifications", "messages", "settings"].includes(
            possibleUsername.toLowerCase(),
        );

        if (possibleUsername && !isSystemRoute) {
            // Remove leading @ if present
            const username = possibleUsername.startsWith("@") ? possibleUsername.substring(1) : possibleUsername;
            console.log(`[SSR] Profile detected for: ${username}`);

            const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${username}`);
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
                });
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
            }
        }

        // 2. Unified Post Handling (/app/post/{tokenId} for both image and video posts)
        if (cleanPath.includes("/post/")) {
            const postId = cleanPath.split("/post/")[1].split("/")[0];

            const response = await fetch(`${DEHUB_API_BASE}/api/nft_info/${postId}`);
            const nftData = await response.json();
            const nft: DeHubNFT = nftData.result || nftData;

            if (nft) {
                const posterName = nft.minterDisplayName || nft.minterUsername || "someone";
                const title = nft.title || nft.name || `Post by ${posterName} on DeHub`;
                const description = `View this post by ${posterName} on DeHub` + (nft.description ? ` — ${nft.description}` : "");
                const postUrl = `${APP_URL}/app/post/${postId}`;

                const isAudio = nft.postType === "feed-audio";
                const videoUrl = isAudio ? null : buildVideoUrl(nft);

                let postImage: string;
                if (isAudio) {
                    // Use the audio waveform OG image served by this function
                    postImage = `${IMAGE_PROXY_BASE}?audio_og=${postId}`;
                } else if (videoUrl) {
                    postImage = ensureAbsoluteUrl(nft.thumbnail_url || nft.imageUrl || "") || DEHUB_LOGO;
                } else {
                    postImage = buildPostImageUrl(nft);
                }

                const html = generateMetaHTML({
                    title,
                    description,
                    image: postImage,
                    url: postUrl,
                    type: "article",
                    twitterCard: isAudio ? "summary_large_image" : "summary",
                    functionBaseUrl,
                    isBot,
                    videoUrl,
                });
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
            }
        }

        // Default Fallback
        const html = generateMetaHTML({
            title: "DeHub",
            description:
                "DeHub is an open source, user owned alternative to legacy media for true censorship resistance with freedom of speech and reach.",
            image: "https://dehub.io/og-image.png",
            url: canonicalUrl,
            functionBaseUrl,
            isBot,
        });
        return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
    } catch (e) {
        console.error("SSR SEO Error:", e);
        return new Response("Error", { status: 500 });
    }
});
