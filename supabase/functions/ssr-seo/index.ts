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

function getMediaUrl(relativePath?: string): string {
    if (!relativePath) return "https://dehub.io/og-image.png"; // Default fallback
    if (relativePath.startsWith("http")) return relativePath;

    // Fix: Remove 'statics/' prefix if present
    const cleanPath = relativePath.replace(/^statics\//, '');

    return `${DEHUB_CDN_BASE}${cleanPath}`;
}

function generateMetaHTML(data: {
    title: string;
    description: string;
    image: string;
    url: string;
    type?: string;
    isBot: boolean;
}): string {
    // Escaping strings to prevent HTML breakage
    const title = data.title.replace(/"/g, '&quot;');
    const description = data.description.replace(/"/g, '&quot;');

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
  <meta property="fb:app_id" content="966242223397117"> <!-- Added DeHub App ID -->
  
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
<body style="font-family: sans-serif; background: black; color: white;">
  <div style="max-width: 600px; margin: 40px auto; text-align: center; padding: 20px;">
    <h1>${title}</h1>
    <p>${description}</p>
    <img src="${data.image}" style="max-width: 100%; border-radius: 12px; margin-top: 20px;" />
    <p><a href="${data.url}" style="color: #00ff00;">View on DeHub</a></p>
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
        // Better bot detection
        const isBot = /bot|facebook|twitter|linkedin|whatsapp|telegram|slack|discord|facebot|oggrabber/i.test(userAgent);

        // Path handling - Support both direct path and original_url query param
        let fullPath = url.searchParams.get('path') || '/';
        const originalUrl = url.searchParams.get('original_url');

        // Canonical URL for meta tags
        const canonicalUrl = originalUrl || `${APP_URL}${fullPath}`;

        // Normalize path for logic
        let cleanPath = fullPath.split('?')[0];
        if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
        const pathParts = cleanPath.split('/').filter(Boolean);

        console.log(`[SSR] FullPath: ${fullPath}, CleanPath: ${cleanPath}, Parts:`, pathParts);

        // 1. Profile Handling (/@username)
        // Check if the first part starts with @ or if the whole path is just the username
        const possibleUsername = pathParts[0] || '';
        if (possibleUsername.startsWith('@')) {
            const username = possibleUsername.substring(1);
            console.log(`[SSR] Profile detected for: ${username}`);

            const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${username}`);
            const userData = await response.json();
            const user: DeHubUser = userData.result || userData;

            if (user && (user.username || user.address)) {
                const displayName = user.displayName || user.username || 'DeHub User';
                const html = generateMetaHTML({
                    title: `Join @${user.username || username} on DeHub today!`,
                    description: user.aboutMe || `Connect with ${displayName} on DeHub, the open source alternative to legacy media.`,
                    image: getMediaUrl(user.avatarImageUrl),
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
            console.log(`[SSR] Post detected: ${postId}`);

            const response = await fetch(`${DEHUB_API_BASE}/api/nft_info/${postId}`);
            const nftData = await response.json();
            const nft: DeHubNFT = nftData.result || nftData;

            if (nft) {
                const title = nft.title || nft.name || "DeHub Post";
                const description = nft.description || "View this post on DeHub";
                const image = getMediaUrl(nft.imageUrl || nft.thumbnail_url);

                const html = generateMetaHTML({
                    title,
                    description,
                    image,
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
