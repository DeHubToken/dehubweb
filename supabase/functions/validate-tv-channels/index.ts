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

const PLAYLIST_SOURCES = [
  { name: "Free-TV", url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8" },
  { name: "iptv-org", url: "https://iptv-org.github.io/iptv/index.m3u" },
];

const BATCH_SIZE = 20;
const STREAM_TIMEOUT = 5000;

const COUNTRY_TO_CATEGORY: Record<string, string> = {
  // North America
  "united states": "us", "united states of america": "us", "usa": "us", "us": "us",
  "canada": "ca", "ca": "ca",
  "mexico": "mx", "méxico": "mx", "mx": "mx",
  // Europe
  "united kingdom": "uk", "uk": "uk", "gb": "uk",
  "germany": "de", "deutschland": "de", "de": "de",
  "france": "fr", "fr": "fr",
  "spain": "es", "españa": "es", "es": "es",
  "italy": "it", "italia": "it", "it": "it",
  "netherlands": "nl", "nl": "nl",
  "portugal": "pt", "pt": "pt",
  "poland": "pl", "pl": "pl",
  "sweden": "se", "se": "se",
  "norway": "no", "no": "no",
  "denmark": "dk", "dk": "dk",
  "finland": "fi", "fi": "fi",
  "belgium": "be", "be": "be",
  "austria": "at", "at": "at",
  "switzerland": "ch", "ch": "ch",
  "ireland": "ie", "ie": "ie",
  "greece": "gr", "gr": "gr",
  "romania": "ro", "ro": "ro",
  "czech republic": "cz", "czechia": "cz", "cz": "cz",
  "hungary": "hu", "hu": "hu",
  "ukraine": "ua", "ua": "ua",
  "russia": "ru", "ru": "ru",
  "turkey": "tr", "türkiye": "tr", "tr": "tr",
  // Asia
  "india": "in", "in": "in",
  "japan": "jp", "jp": "jp",
  "south korea": "kr", "korea": "kr", "kr": "kr",
  "china": "cn", "cn": "cn",
  "taiwan": "tw", "tw": "tw",
  "hong kong": "hk", "hk": "hk",
  "thailand": "th", "th": "th",
  "vietnam": "vn", "vn": "vn",
  "philippines": "ph", "ph": "ph",
  "indonesia": "id", "id": "id",
  "malaysia": "my", "my": "my",
  "singapore": "sg", "sg": "sg",
  "pakistan": "pk", "pk": "pk",
  "bangladesh": "bd", "bd": "bd",
  // Middle East
  "saudi arabia": "sa", "sa": "sa",
  "united arab emirates": "ae", "uae": "ae", "ae": "ae",
  "qatar": "qa", "qa": "qa",
  "israel": "il", "il": "il",
  "iran": "ir", "ir": "ir",
  "iraq": "iq", "iq": "iq",
  // Africa
  "south africa": "za", "za": "za",
  "nigeria": "ng", "ng": "ng",
  "egypt": "eg", "eg": "eg",
  "morocco": "ma", "ma": "ma",
  "kenya": "ke", "ke": "ke",
  // South America
  "brazil": "br", "brasil": "br", "br": "br",
  "argentina": "ar", "ar": "ar",
  "colombia": "co", "co": "co",
  "chile": "cl", "cl": "cl",
  "peru": "pe", "pe": "pe",
  "venezuela": "ve", "ve": "ve",
  // Oceania
  "australia": "au", "au": "au",
  "new zealand": "nz", "nz": "nz",
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
      const countryMatch = line.match(/tvg-country="([^"]+)"/);
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

      // Use tvg-country (iptv-org format) first, fall back to group-title (Free-TV format)
      const countryCode = countryMatch?.[1]?.toLowerCase().trim() || "";
      const groupTitle = groupMatch?.[1] || "Other";
      const category = COUNTRY_TO_CATEGORY[countryCode] || mapCountryToCategory(groupTitle);
      const countryLabel = countryCode
        ? (groupTitle !== "Other" ? groupTitle : countryCode.toUpperCase())
        : groupTitle;

      channels.push({
        id: generateIdFromUrl(streamUrl),
        name: name.trim(),
        logo: logoMatch?.[1] || null,
        category,
        streamUrl,
        country: countryLabel,
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

    // Fetch and parse all playlist sources
    const allParsed: ParsedChannel[] = [];
    const seenStreamUrls = new Set<string>();

    for (const source of PLAYLIST_SOURCES) {
      try {
        console.log(`[validate-tv] Fetching ${source.name}...`);
        const playlistRes = await fetch(`${source.url}?_=${Date.now()}`);
        if (!playlistRes.ok) {
          console.warn(`[validate-tv] ${source.name} fetch failed: ${playlistRes.status}`);
          continue;
        }
        const playlistContent = await playlistRes.text();
        const parsed = parseM3U8Playlist(playlistContent);
        console.log(`[validate-tv] ${source.name}: parsed ${parsed.length} channels`);

        // Deduplicate across sources by stream URL
        for (const ch of parsed) {
          if (!seenStreamUrls.has(ch.streamUrl)) {
            seenStreamUrls.add(ch.streamUrl);
            allParsed.push(ch);
          }
        }
      } catch (err) {
        console.warn(`[validate-tv] ${source.name} error:`, err);
      }
    }

    const parsedChannels = allParsed;
    console.log(`[validate-tv] Total unique channels: ${parsedChannels.length}`);

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
