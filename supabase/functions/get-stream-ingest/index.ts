/**
 * Get Stream Ingest URL for OBS
 * =============================
 * Fetches stream credentials from DeHub nft_info and returns OBS-ready
 * ingest URL + stream key. Use when api.dehub.io /api/live/* endpoints fail.
 *
 * POST body: { tokenId: string }
 * Or: GET ?tokenId=xxx
 *
 * Returns: { ingestUrl, streamKey, playbackUrl, hlsUrl }
 */

const DEHUB_API_BASE = "https://api.dehub.io";
const LIVEPEER_RTMP_URL = "rtmp://rtmp.livepeer.com/live";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

interface NftInfoStream {
  streamKey?: string;
  playbackId?: string;
  _id?: string;
  id?: string;
  streamId?: string;
  [key: string]: unknown;
}

interface NftInfoResult {
  stream?: NftInfoStream;
  [key: string]: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let tokenId: string | null = null;

    if (req.method === "GET") {
      const url = new URL(req.url);
      tokenId = url.searchParams.get("tokenId");
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      tokenId = body?.tokenId ?? null;
    }

    if (!tokenId || typeof tokenId !== "string") {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "tokenId is required (query param or body)",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const authHeader = req.headers.get("Authorization");

    const nftRes = await fetch(`${DEHUB_API_BASE}/api/nft_info/${encodeURIComponent(tokenId)}`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    if (!nftRes.ok) {
      const errText = await nftRes.text();
      console.error("[get-stream-ingest] nft_info failed:", nftRes.status, errText);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch stream info",
          message: `nft_info returned ${nftRes.status}`,
        }),
        { status: 502, headers: corsHeaders }
      );
    }

    const nftData: NftInfoResult | { result?: NftInfoResult } = await nftRes.json();
    const nft = (nftData as { result?: NftInfoResult }).result ?? nftData;
    const stream = nft?.stream;

    if (!stream?.streamKey) {
      return new Response(
        JSON.stringify({
          error: "Stream not ready",
          message: "Stream key not available yet. The backend may still be provisioning.",
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    const playbackId = stream.playbackId || "";
    const hlsUrl = playbackId
      ? `https://livepeercdn.studio/hls/${playbackId}/index.m3u8`
      : "";

    const result = {
      ingestUrl: LIVEPEER_RTMP_URL,
      streamKey: stream.streamKey,
      playbackUrl: `https://dehub.io/app/post/${tokenId}`,
      hlsUrl,
      streamId: stream._id || stream.id || stream.streamId || tokenId,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("[get-stream-ingest] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
