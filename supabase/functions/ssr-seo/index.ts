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
    return `${DEHUB_CDN_BASE}${relativePath}`;
}

function generateMetaHTML(data: {
    title: string;
    description: string;
    image: string;
    url: string;
    type?: string;
    isBot: boolean;
}): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title}</title>
  
  <!-- SEO Meta Tags -->
  <meta name="description" content="${data.description}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${data.type || 'website'}">
  <meta property="og:url" content="${data.url}">
  <meta property="og:title" content="${data.title}">
  <meta property="og:description" content="${data.description}">
  <meta property="og:image" content="${data.image}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${data.url}">
  <meta name="twitter:title" content="${data.title}">
  <meta name="twitter:description" content="${data.description}">
  <meta name="twitter:image" content="${data.image}">

  ${!data.isBot ? `
  <meta http-equiv="refresh" content="0; url=${data.url}">
  <script>window.location.href = '${data.url}';</script>
  ` : ''}
</head>
<body>
  <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 20px;">
    <h1>${data.title}</h1>
    <p>${data.description}</p>
    <img src="${data.image}" style="max-width: 100%; border-radius: 12px; margin-top: 20px;" />
    <p><a href="${data.url}">View on DeHub</a></p>
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
        const isBot = /bot|facebook|twitter|linkedin|whatsapp|telegram|slack|discord/i.test(userAgent);

        // Path handling
        // Format: /functions/v1/ssr-seo?path=/username OR ?path=/post/123
        const fullPath = url.searchParams.get('path') || '/';
        const pathParts = fullPath.split('/').filter(Boolean);

        // 1. Profile handling (e.g. /@username or /username)
        if (pathParts.length === 1 && (pathParts[0].startsWith('@') || !['app', 'explore', 'notifications'].includes(pathParts[0]))) {
            const username = pathParts[0].replace('@', '');
            const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${username}`);
            const userData = await response.json();
            const user: DeHubUser = userData.result || userData;

            if (user && (user.username || user.address)) {
                const displayName = user.displayName || user.username || 'DeHub User';
                const handle = user.username ? `@${user.username}` : user.address?.slice(0, 6);
                const html = generateMetaHTML({
                    title: `Join ${handle} on DeHub today!`,
                    description: user.aboutMe || `Connect with ${displayName} on DeHub, the open source alternative to legacy media.`,
                    image: getMediaUrl(user.avatarImageUrl),
                    url: `${APP_URL}/${username}`,
                    isBot
                });
                return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
            }
        }

        // 2. Post handling (e.g. /post/123 or /app/post/123 or /video/123)
        if (fullPath.includes('/post/') || fullPath.includes('/video/')) {
            const postId = fullPath.split(/post\/|video\//)[1].split('/')[0];
            const response = await fetch(`${DEHUB_API_BASE}/api/nft_info/${postId}`);
            const nftData = await response.json();
            const nft: DeHubNFT = nftData.result || nftData;

            if (nft) {
                let title = nft.title || nft.name || "DeHub Post";
                let description = nft.description || "View this post on DeHub";
                let image = "";

                // Check if it's a media post (image/video) or text post
                const isMedia = nft.postType === 'video' || nft.postType === 'image' || nft.imageUrl || nft.videoUrl;

                if (isMedia) {
                    // for media posts it should give the post image/thumbnail and the description/title
                    image = getMediaUrl(nft.imageUrl || nft.thumbnail_url);
                    description = nft.description || description;
                    title = nft.title || nft.name || title;
                } else {
                    // for text posts use the profile picture as image and the text as seo/description
                    if (nft.minterUsername) {
                        const userRes = await fetch(`${DEHUB_API_BASE}/api/account_info/${nft.minterUsername}`);
                        const userJson = await userRes.json();
                        const user = userJson.result || userJson;
                        image = getMediaUrl(user?.avatarImageUrl);
                        title = `@${nft.minterUsername.replace('@', '')} on DeHub`;
                    }
                    description = nft.description || description;
                }

                const html = generateMetaHTML({
                    title,
                    description,
                    image: image || "https://dehub.io/og-image.png",
                    url: `${APP_URL}${fullPath}`,
                    type: 'article',
                    isBot
                });
                return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
            }
        }

        // Default Fallback
        const defaultHtml = generateMetaHTML({
            title: "DeHub",
            description: "DeHub is an open source, user owned alternative to legacy media for true censorship resistance with freedom of speech and reach.",
            image: "https://dehub.io/og-image.png",
            url: APP_URL + fullPath,
            isBot
        });
        return new Response(defaultHtml, { headers: { ...corsHeaders, 'Content-Type': 'text/html' } });

    } catch (error) {
        console.error("SSR SEO Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
});
