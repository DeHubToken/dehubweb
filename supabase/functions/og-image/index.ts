/**
 * og-image — Dynamic OG card generator for DeHub text posts
 *
 * Generates a 1200×630 PNG image rendering the post text in a styled card,
 * similar to how X/Twitter shows "tweet screenshot" cards when sharing.
 *
 * Called by ssr-seo for text posts (feed-simple / no image / no video).
 * URL: /functions/v1/og-image?post_id=<tokenId>
 *
 * Uses satori (HTML/CSS → SVG) + @resvg/resvg-wasm (SVG → PNG).
 * Both run entirely in Deno — no external screenshot services needed.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// deno-lint-ignore-file no-explicit-any
import satori from "https://esm.sh/satori@0.10.13";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

let resvgInited = false;
async function ensureResvg() {
    if (resvgInited) return;
    const wasm = await fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm").then(r => r.arrayBuffer());
    await initWasm(wasm);
    resvgInited = true;
}

const DEHUB_API_BASE = "https://api.dehub.io";
const DEHUB_CDN_BASE = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/";
const DEHUB_LOGO = "https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo//new_logo_Dehub.jpg";

// Inter font — cached in module scope (survives across requests in the same worker)
let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;

async function loadFonts() {
    if (fontRegular && fontBold) return { fontRegular, fontBold };
    [fontRegular, fontBold] = await Promise.all([
        fetch("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2").then(r => r.arrayBuffer()),
        fetch("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff2").then(r => r.arrayBuffer()),
    ]);
    return { fontRegular: fontRegular!, fontBold: fontBold! };
}

function buildAvatarUrl(user: any): string {
    const apiPath = user?.avatarImageUrl;
    if (!apiPath) return DEHUB_LOGO;
    if (apiPath.startsWith("http")) return apiPath;
    if (user?.address) {
        const ext = apiPath.match(/\.([a-zA-Z0-9-]+)$/)?.[1]?.toLowerCase() || "png";
        return `${DEHUB_CDN_BASE}avatars/${user.address}.${ext}`;
    }
    return `${DEHUB_CDN_BASE}${apiPath.replace(/^statics\//, "")}`;
}

/** Convert a hex colour to an rgba string (for satori which needs valid CSS) */
const rgba = (hex: string, a: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    try {
        const url = new URL(req.url);
        const postId = url.searchParams.get("post_id");
        if (!postId) return new Response("post_id required", { status: 400 });

        // Fetch post data
        const postRes = await fetch(`${DEHUB_API_BASE}/api/nft_info/${postId}`);
        if (!postRes.ok) throw new Error(`Post API ${postRes.status}`);
        const postData = await postRes.json();
        const post = postData.result || postData;

        const rawText = (post.title || post.name || "").trim();
        if (!rawText) return Response.redirect(DEHUB_LOGO, 302);

        const authorName = post.minterDisplayName || post.mintername || post.minterUsername || "DeHub";
        const username = post.minterUsername || "";
        const avatarUrl = post.minterUser ? buildAvatarUrl(post.minterUser) : DEHUB_LOGO;

        // Clamp text length & pick font size
        const displayText = rawText.length > 320 ? rawText.slice(0, 317) + "…" : rawText;
        const fontSize = rawText.length > 220 ? 28 : rawText.length > 130 ? 34 : rawText.length > 70 ? 40 : 46;

        const { fontRegular: fr, fontBold: fb } = await loadFonts();

        // ── Card layout (1200 × 630) ──────────────────────────────────────────
        // All containers need display:"flex" — satori uses flexbox exclusively.
        const element = {
            type: "div",
            props: {
                style: {
                    display: "flex",
                    flexDirection: "column" as const,
                    width: "1200px",
                    height: "630px",
                    backgroundColor: "#09090b",
                    padding: "60px 72px 52px",
                    fontFamily: "Inter",
                    position: "relative" as const,
                },
                children: [
                    // ── Background glow (decorative) ──
                    {
                        type: "div",
                        props: {
                            style: {
                                position: "absolute" as const,
                                top: 0, left: 0, right: 0, bottom: 0,
                                display: "flex",
                                // satori doesn't support multi-stop radial-gradient shorthand,
                                // so we stack two absolutely-positioned blobs instead
                            },
                            children: [
                                {
                                    type: "div",
                                    props: {
                                        style: {
                                            position: "absolute" as const,
                                            width: "500px", height: "500px",
                                            left: "-80px", bottom: "-120px",
                                            borderRadius: "50%",
                                            backgroundColor: rgba("#6d28d9", 0.18),
                                            filter: "blur(120px)",
                                            display: "flex",
                                        },
                                    }
                                },
                                {
                                    type: "div",
                                    props: {
                                        style: {
                                            position: "absolute" as const,
                                            width: "400px", height: "400px",
                                            right: "-60px", top: "-80px",
                                            borderRadius: "50%",
                                            backgroundColor: rgba("#7c3aed", 0.12),
                                            filter: "blur(100px)",
                                            display: "flex",
                                        },
                                    }
                                },
                            ],
                        }
                    },

                    // ── Author row ──
                    {
                        type: "div",
                        props: {
                            style: {
                                display: "flex",
                                alignItems: "center",
                                gap: "16px",
                                marginBottom: "36px",
                                position: "relative" as const,
                            },
                            children: [
                                {
                                    type: "img",
                                    props: {
                                        src: avatarUrl,
                                        width: 60,
                                        height: 60,
                                        style: {
                                            borderRadius: "50%",
                                            border: `2px solid ${rgba("#ffffff", 0.12)}`,
                                        },
                                    }
                                },
                                {
                                    type: "div",
                                    props: {
                                        style: { display: "flex", flexDirection: "column" as const, gap: "3px" },
                                        children: [
                                            {
                                                type: "span",
                                                props: {
                                                    style: { fontSize: "24px", fontWeight: 700, color: "#f4f4f5", letterSpacing: "-0.4px" },
                                                    children: authorName,
                                                }
                                            },
                                            username
                                                ? {
                                                    type: "span",
                                                    props: {
                                                        style: { fontSize: "18px", color: "#71717a" },
                                                        children: `@${username}`,
                                                    }
                                                }
                                                : { type: "span", props: { style: { display: "none" }, children: "" } },
                                        ],
                                    }
                                },
                            ],
                        }
                    },

                    // ── Post text ──
                    {
                        type: "div",
                        props: {
                            style: {
                                display: "flex",
                                flex: 1,
                                position: "relative" as const,
                                fontSize: `${fontSize}px`,
                                fontWeight: 400,
                                lineHeight: 1.55,
                                color: "#fafafa",
                                letterSpacing: "-0.2px",
                                overflow: "hidden",
                                alignItems: "flex-start",
                                flexWrap: "wrap" as const,
                            },
                            children: displayText,
                        }
                    },

                    // ── Bottom branding bar ──
                    {
                        type: "div",
                        props: {
                            style: {
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginTop: "auto",
                                paddingTop: "24px",
                                borderTop: `1px solid ${rgba("#ffffff", 0.07)}`,
                                position: "relative" as const,
                            },
                            children: [
                                // DeHub logo + domain
                                {
                                    type: "div",
                                    props: {
                                        style: { display: "flex", alignItems: "center", gap: "10px" },
                                        children: [
                                            {
                                                type: "img",
                                                props: {
                                                    src: DEHUB_LOGO,
                                                    width: 30,
                                                    height: 30,
                                                    style: { borderRadius: "7px" },
                                                }
                                            },
                                            {
                                                type: "span",
                                                props: {
                                                    style: { fontSize: "20px", fontWeight: 600, color: "#a78bfa", letterSpacing: "-0.3px" },
                                                    children: "dehub.io",
                                                }
                                            },
                                        ],
                                    }
                                },
                                // Tagline
                                {
                                    type: "span",
                                    props: {
                                        style: { fontSize: "17px", color: "#3f3f46" },
                                        children: "Open Source Social Media",
                                    }
                                },
                            ],
                        }
                    },
                ],
            }
        };

        const { fontRegular: fr2, fontBold: fb2 } = { fontRegular: fr, fontBold: fb };
        const svg = await satori(element as any, {
            width: 1200,
            height: 630,
            fonts: [
                { name: "Inter", data: fr2, weight: 400, style: "normal" },
                { name: "Inter", data: fb2, weight: 700, style: "normal" },
            ],
        });

        // SVG → PNG via resvg-wasm
        await ensureResvg();
        const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
        const png = resvg.render().asPng();

        return new Response(png as BodyInit, {
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
                "Access-Control-Allow-Origin": "*",
            },
        });

    } catch (e) {
        console.error("[og-image]", e);
        // Fallback: redirect to DeHub logo
        return Response.redirect(DEHUB_LOGO, 302);
    }
});
