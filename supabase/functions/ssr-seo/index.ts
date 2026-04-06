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
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
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
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
            }
        }

        // 3. Unified Post Handling (/app/post/{tokenId} for both image and video posts)
        if (cleanPath.includes("/post/")) {
            const postId = cleanPath.split("/post/")[1].split("/")[0];

            const response = await fetch(`${DEHUB_API_BASE}/api/nft_info/${postId}`);
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
                return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
            }
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
