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
    if (!url) return "https://dehub.io/og-image.png";
    if (url.startsWith("http")) return url;
    return `${DEHUB_CDN_BASE}${url.replace(/^statics\//, "")}`;
}

/**
 * Sync with frontend src/lib/media-url.ts
 */
function buildAvatarUrl(user: DeHubUser): string {
    const apiPath = user.avatarImageUrl;
    if (!apiPath) return "https://dehub.io/og-image.png";
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
    const ext = url.split("?")[0].match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
    switch (ext) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "gif":
            return "image/gif";
        case "webp":
            return "image/webp";
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
}): string {
    const title = data.title.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const description = data.description.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const imageUrl = ensureAbsoluteUrl(data.image);
    // For og:image tags, use proxied URL so scrapers get correct Content-Type
    const ogImageUrl = data.functionBaseUrl ? buildProxiedImageUrl(data.functionBaseUrl, imageUrl) : imageUrl;
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
  <meta property="fb:app_id" content="966242223397117">${videoTags}

  <!-- Twitter -->
  <meta name="twitter:card" content="${twitterCard}">
  <meta name="twitter:url" content="${data.url}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImageUrl}">
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
                const html = generateMetaHTML({
                    title: `Join @${user.username || username} on DeHub today!`,
                    description:
                        user.aboutMe || `Connect with ${displayName} on DeHub, the open source alternative to legacy media.`,
                    image: buildAvatarUrl(user),
                    url: profileUrl,
                    twitterCard: "summary",
                    imageWidth: 400,
                    imageHeight: 400,
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
                const description = nft.description || `View this post by ${posterName} on DeHub`;
                const postUrl = `${APP_URL}/app/post/${postId}`;
                const videoUrl = buildVideoUrl(nft);
                const html = generateMetaHTML({
                    title,
                    description,
                    image: videoUrl ? ensureAbsoluteUrl(nft.thumbnail_url || nft.imageUrl || "") : buildPostImageUrl(nft),
                    url: postUrl,
                    type: "article",
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
