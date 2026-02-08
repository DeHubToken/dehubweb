import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================================
// TYPES
// ============================================================================

interface ParsedChannel {
  id: string;
  name: string;
  logo: string | null;
  category: string;
  streamUrl: string;
  country: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FREE_TV_PLAYLIST_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

const BATCH_SIZE = 20;
const STREAM_TIMEOUT = 5000;

const COUNTRY_TO_CATEGORY: Record<string, string> = {
  "united states": "us",
  usa: "us",
  "united kingdom": "uk",
  uk: "uk",
  germany: "de",
  deutschland: "de",
  france: "fr",
  spain: "es",
  "españa": "es",
  italy: "it",
  italia: "it",
  india: "in",
  brazil: "br",
  brasil: "br",
  mexico: "mx",
  "méxico": "mx",
  canada: "ca",
  australia: "au",
};

// ============================================================================
// HELPERS
// ============================================================================

function generateIdFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `ch-${Math.abs(hash).toString(36)}`;
}

function mapCountryToCategory(groupTitle: string): string {
  const normalized = groupTitle.toLowerCase().trim();
  return COUNTRY_TO_CATEGORY[normalized] || "other";
}

function isValidStreamUrl(url: string, name: string): boolean {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".mpd")) return false;
  if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) return false;
  if (lowerUrl.includes("twitch.tv")) return false;
  if (lowerUrl.includes("dailymotion.com")) return false;
  if (url.startsWith("http://")) return false;
  if (name.includes("Ⓖ")) return false;
  return lowerUrl.includes(".m3u8");
}

function parseM3U8Playlist(content: string): ParsedChannel[] {
  const lines = content.split("\n");
  const channels: ParsedChannel[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      const nameMatch = line.match(/tvg-name="([^"]+)"/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const titleMatch = line.match(/,(.+)$/);

      let streamUrl = "";
      for (let j = i + 1; j < lines.length && j < i + 3; j++) {
        const nextLine = lines[j]?.trim();
        if (nextLine && !nextLine.startsWith("#")) {
          streamUrl = nextLine;
          break;
        }
      }

      const name = nameMatch?.[1] || titleMatch?.[1] || "Unknown Channel";
      if (!streamUrl || seenUrls.has(streamUrl)) continue;
      if (!isValidStreamUrl(streamUrl, name)) continue;

      seenUrls.add(streamUrl);
      const groupTitle = groupMatch?.[1] || "Other";

      channels.push({
        id: generateIdFromUrl(streamUrl),
        name: name.trim(),
        logo: logoMatch?.[1] || null,
        category: mapCountryToCategory(groupTitle),
        streamUrl,
        country: groupTitle,
      });
    }
  }
  return channels;
}

async function testStreamUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StreamValidator/1.0)" },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      await response.text().catch(() => {});
      return false;
    }

    const text = await response.text();
    return text.includes("#EXTM3U") && (text.includes("#EXTINF") || text.includes("#EXT-X-STREAM-INF"));
  } catch {
    return false;
  }
}

// ============================================================================
// HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const hasValidAuth = authHeader.includes(serviceKey);
    const triggerKey = req.headers.get("x-validate-trigger");

    if (!hasValidAuth && triggerKey !== "run") {
      let body: Record<string, unknown> = {};
      if (req.method === "POST") {
        body = await req.json().catch(() => ({}));
      }
      if (body?.admin_key !== serviceKey) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    console.log("[validate-tv] Starting channel validation...");

    // Fetch and parse playlist
    const playlistRes = await fetch(`${FREE_TV_PLAYLIST_URL}?_=${Date.now()}`);
    if (!playlistRes.ok) throw new Error(`Playlist fetch failed: ${playlistRes.status}`);
    const playlistContent = await playlistRes.text();
    const parsedChannels = parseM3U8Playlist(playlistContent);
    console.log(`[validate-tv] Parsed ${parsedChannels.length} channels`);

    // Track all valid IDs for cleanup
    const validIds: string[] = [];
    let totalTested = 0;

    // Process in batches — validate AND write each batch immediately
    for (let i = 0; i < parsedChannels.length; i += BATCH_SIZE) {
      const batch = parsedChannels.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(parsedChannels.length / BATCH_SIZE);

      console.log(`[validate-tv] Batch ${batchNum}/${totalBatches} - testing ${batch.length} channels...`);

      const results = await Promise.allSettled(
        batch.map(async (channel) => {
          const isValid = await testStreamUrl(channel.streamUrl);
          return { channel, isValid };
        }),
      );

      const validInBatch: ParsedChannel[] = [];
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.isValid) {
          validInBatch.push(result.value.channel);
        }
      }

      // Immediately upsert this batch's valid channels to DB
      if (validInBatch.length > 0) {
        const rows = validInBatch.map((ch) => ({
          id: ch.id,
          name: ch.name,
          logo: ch.logo,
          category: ch.category,
          stream_url: ch.streamUrl,
          country: ch.country,
          last_verified_at: new Date().toISOString(),
          broken_reports: 0,
          is_active: true,
        }));

        const { error } = await supabase
          .from("tv_channels_verified")
          .upsert(rows, { onConflict: "id" });

        if (error) {
          console.error(`[validate-tv] Upsert error batch ${batchNum}:`, error);
        }

        validIds.push(...validInBatch.map((ch) => ch.id));
      }

      totalTested += batch.length;
      console.log(`[validate-tv] Batch ${batchNum} done. Valid so far: ${validIds.length}/${totalTested}`);
    }

    // Deactivate channels that weren't validated
    const validIdSet = new Set(validIds);
    const { data: existingChannels } = await supabase
      .from("tv_channels_verified")
      .select("id");

    const staleIds = (existingChannels || [])
      .map((c: { id: string }) => c.id)
      .filter((id: string) => !validIdSet.has(id));

    if (staleIds.length > 0) {
      console.log(`[validate-tv] Deactivating ${staleIds.length} stale channels`);
      await supabase
        .from("tv_channels_verified")
        .update({ is_active: false })
        .in("id", staleIds);
    }

    const summary = {
      total_parsed: parsedChannels.length,
      total_valid: validIds.length,
      total_deactivated: staleIds.length,
    };

    console.log("[validate-tv] DONE:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[validate-tv] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
