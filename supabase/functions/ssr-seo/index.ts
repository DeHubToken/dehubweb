import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEHUB_API_BASE = "https://api.dehub.io";
const DEHUB_CDN_BASE = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/";
const APP_URL = "https://dehub.io"; // Change to actual production URL if different

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
    videoUrl?: string;
    thumbnail_url?: string;
    postType?: string;
    minterUsername?: string;
}

function getExtension(path: string): string {
    const match = path.match(/\.([a-zA-Z0-9-]+)$/);
    if (!match) return 'png';
    return match[1].toLowerCase();
}

/**
 * Sync with frontend src/lib/media-url.ts
 */
function buildAvatarUrl(user: DeHubUser): string {
    const apiPath = user.avatarImageUrl;
    if (!apiPath) return "https://dehub.io/og-image.png";
    if (apiPath.startsWith('http')) return apiPath;

    // Frontend logic: cdn/avatars/{address}.{ext}
    if (user.address) {
        const ext = getExtension(apiPath);
        return `${DEHUB_CDN_BASE}avatars/${user.address}.${ext}`;
    }

    // Fallback: strip statics/ and append relative path
    return `${DEHUB_CDN_BASE}${apiPath.replace(/^statics\//, '')}`;
}

function buildPostImageUrl(nft: DeHubNFT): string {
    const apiPath = nft.imageUrl || nft.thumbnail_url;
    if (!apiPath) return "https://dehub.io/og-image.png";
    if (apiPath.startsWith('http')) return apiPath;

    // Frontend logic: cdn/images/{tokenId}.{ext}
    if (nft.tokenId) {
        const ext = getExtension(apiPath);
        return `${DEHUB_CDN_BASE}images/${nft.tokenId}.${ext}`;
    }

    return `${DEHUB_CDN_BASE}${apiPath.replace(/^statics\//, '')}`;
}

function generateMetaHTML(data: {
    title: string;
    description: string;
    image: string;
    url: string;
    type?: string;
    isBot: boolean;
}): string {
    const title = data.title.replace(/"/g, '&quot;');
    const description = data.description.replace(/"/g, '&quot;');
    const ext = getExtension(data.image);
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- SEO Meta Tags -->
  <meta name="description" content="${description}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${data.type || 'website'}">
  <meta property="og:url" content="${data.url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${data.image}">
  <meta property="og:image:secure_url" content="${data.image}">
  <meta property="og:image:type" content="${mimeType}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="fb:app_id" content="966242223397117">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${data.url}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${data.image}">
  <meta name="twitter:site" content="@DeHubApp">

  ${!data.isBot ? `
  <meta http-equiv="refresh" content="0; url=${data.url}">
  <script>window.location.href = '${data.url}';</script>
  ` : ''}
</head>
<body style="font-family: sans-serif; background: black; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="max-width: 600px; text-align: center; padding: 20px;">
    <h1>${title}</h1>
    <p>${description}</p>
    <img src="${data.image}" style="max-width: 100%; border-radius: 12px; margin-top: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
    <p style="margin-top: 30px;"><a href="${data.url}" style="color: #00ff00; text-decoration: none; font-weight: bold; border: 1px solid #00ff00; padding: 10px 20px; border-radius: 5px;">View on DeHub</a></p>
  </div>
</body>
</html>`;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const userAgent = req.headers.get('user-agent') || '';
        const isBot = /bot|facebook|twitter|linkedin|whatsapp|telegram|slack|discord|facebot|oggrabber/i.test(userAgent);

        let fullPath = url.searchParams.get('path') || '/';
        const originalUrl = url.searchParams.get('original_url');
        const canonicalUrl = originalUrl || `${APP_URL}${fullPath}`;

        let cleanPath = fullPath.split('?')[0];
        if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
        const pathParts = cleanPath.split('/').filter(Boolean);

        // 1. Profile Handling (/@username)
        const possibleUsername = pathParts[0] || '';
        if (possibleUsername.startsWith('@')) {
            const username = possibleUsername.substring(1);
            const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${username}`);
            const userData = await response.json();
            const user: DeHubUser = userData.result || userData;

            if (user && (user.username || user.address)) {
                const displayName = user.displayName || user.username || 'DeHub User';
                const html = generateMetaHTML({
                    title: `Join @${user.username || username} on DeHub today!`,
                    description: user.aboutMe || `Connect with ${displayName} on DeHub, the open source alternative to legacy media.`,
                    image: buildAvatarUrl(user),
                    url: canonicalUrl,
                    isBot
                });
                return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
            }
        }

        // 2. Post / Video Handling
        if (cleanPath.includes('/post/') || cleanPath.includes('/video/')) {
            const splitChar = cleanPath.includes('/post/') ? '/post/' : '/video/';
            const postId = cleanPath.split(splitChar)[1].split('/')[0];

            const response = await fetch(`${DEHUB_API_BASE}/api/nft_info/${postId}`);
            const nftData = await response.json();
            const nft: DeHubNFT = nftData.result || nftData;

            if (nft) {
                const title = nft.title || nft.name || "DeHub Post";
                const description = nft.description || "View this post on DeHub";
                const html = generateMetaHTML({
                    title,
                    description,
                    image: buildPostImageUrl(nft),
                    url: canonicalUrl,
                    type: 'article',
                    isBot
                });
                return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
            }
        }

        // Default Fallback
        const html = generateMetaHTML({
            title: "DeHub",
            description: "DeHub is an open source, user owned alternative to legacy media for true censorship resistance with freedom of speech and reach.",
            image: "https://dehub.io/og-image.png",
            url: canonicalUrl,
            isBot
        });
        return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (e) {
        console.error("SSR SEO Error:", e);
        return new Response("Error", { status: 500 });
    }
});
