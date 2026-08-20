// Mint a short-lived Deepgram credential so a stage speaker's browser can open
// a live speech-to-text socket for its own microphone.
//
// Why the browser talks to Deepgram directly: the audio never leaves the
// speaker's machine except to the transcriber, so there is no media server, no
// Agora recording add-on, and no relay of PCM through us. What that costs is
// that the page needs a credential, and DEEPGRAM_API_KEY (the same key
// transcribe-video uses for batch work) can obviously never be shipped to a
// page. So this function hands out a credential that expires in minutes and
// only after checking the caller actually holds a seat on the stage.
//
// The gate is deliberately the same shape as agora-token's publisher gate: a
// verified DeHub token, then a host/speaker participant row on that stage. A
// listener has nothing to transcribe — their microphone is not in the room —
// so refusing them costs no feature and closes the obvious "mint credentials
// against someone else's Deepgram balance" hole.
import { corsHeaders, handleCorsPreflight, jsonResponse, guardPaidEndpoint, serviceClient } from "../_shared/auth.ts";

const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY") ?? "";

/** How long a minted credential lives. Long enough to survive a reconnect, short enough to be worthless if leaked. */
const CREDENTIAL_TTL_SECONDS = 300;

/**
 * Live-transcription settings, served from here rather than hard-coded in the
 * bundle, so the model or the endpointing can be retuned without a web deploy.
 *
 * `language=multi` is the deliberate default. DeHub stages routinely run
 * English and Turkish in the same sentence, and nova-3's multilingual mode
 * handles the code-switch where a pinned `en` would transcribe Turkish as
 * nonsense English. The client falls back to `en` on its own if a socket is
 * refused for the language, so a plan without multilingual access degrades
 * instead of going silent.
 */
function listenParams(): Record<string, string> {
  return {
    model: Deno.env.get("DEEPGRAM_LIVE_MODEL") || "nova-3",
    language: Deno.env.get("DEEPGRAM_LIVE_LANGUAGE") || "multi",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    // Finalise an utterance after ~300ms of silence. Lower feels twitchy and
    // splits sentences mid-clause; higher leaves the last words of a sentence
    // hanging as an interim for noticeably too long.
    endpointing: "300",
  };
}

/** Does this wallet hold a seat entitling it to caption itself on this stage? */
async function maySpeak(stageId: string, wallet: string): Promise<boolean> {
  const admin = serviceClient();

  const { data: stage } = await admin
    .from("audio_spaces")
    .select("id, host_wallet_address")
    .eq("id", stageId)
    .maybeSingle();
  if (!stage) return false;

  if ((stage.host_wallet_address || "").toLowerCase() === wallet) return true;

  // ilike for the same reason agora-token uses it: older mobile builds wrote
  // participant rows with checksummed casing, and the verified wallet always
  // arrives lowercased. Without wildcards this is an exact, case-insensitive
  // match — the comparison every stage RLS policy already makes.
  const { data: seat } = await admin
    .from("space_participants")
    .select("role")
    .eq("space_id", stage.id)
    .ilike("wallet_address", wallet)
    .is("left_at", null)
    .maybeSingle();

  return seat?.role === "host" || seat?.role === "speaker";
}

/**
 * Ask Deepgram for a credential the browser may hold.
 *
 * Two routes, tried in order, because which one an account has depends on when
 * it was created: the newer short-lived access token (`/v1/auth/grant`), and
 * the older temporary project key. They authenticate the WebSocket with
 * different subprotocols — `bearer` vs `token` — so the scheme travels back to
 * the client with the credential rather than being assumed.
 */
async function mintCredential(): Promise<{ token: string; scheme: "bearer" | "token"; expiresIn: number }> {
  try {
    const grant = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: CREDENTIAL_TTL_SECONDS }),
    });
    if (grant.ok) {
      const json = await grant.json();
      if (typeof json?.access_token === "string" && json.access_token) {
        return {
          token: json.access_token,
          scheme: "bearer",
          expiresIn: Number(json.expires_in) || CREDENTIAL_TTL_SECONDS,
        };
      }
    } else {
      console.warn(`[stage-caption-token] auth/grant ${grant.status}; falling back to a temporary key`);
    }
  } catch (e) {
    console.warn("[stage-caption-token] auth/grant failed; falling back to a temporary key", e);
  }

  const projectsRes = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
  });
  if (!projectsRes.ok) throw new Error(`deepgram projects ${projectsRes.status}`);
  const projectId = (await projectsRes.json())?.projects?.[0]?.project_id;
  if (!projectId) throw new Error("no deepgram project on this account");

  const keyRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      comment: "dehub stage live captions",
      scopes: ["usage:write"],
      time_to_live_in_seconds: CREDENTIAL_TTL_SECONDS,
    }),
  });
  if (!keyRes.ok) throw new Error(`deepgram key ${keyRes.status}: ${(await keyRes.text()).slice(0, 200)}`);
  const key = (await keyRes.json())?.key;
  if (!key) throw new Error("deepgram returned no key");

  return { token: key, scheme: "token", expiresIn: CREDENTIAL_TTL_SECONDS };
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    if (!DEEPGRAM_API_KEY) {
      console.error("[stage-caption-token] DEEPGRAM_API_KEY is not set");
      return jsonResponse({ error: "Live captions are not configured." }, 500);
    }

    const { spaceId } = await req.json().catch(() => ({ spaceId: null }));
    if (!spaceId || typeof spaceId !== "string") {
      return jsonResponse({ error: "spaceId is required" }, 400);
    }

    // A credential lasts 5 minutes, and the client re-mints on reconnect and on
    // waking from a silence gap — a long stage legitimately asks a few dozen
    // times an hour. The cap is there to stop a loop, not to ration the feature.
    const guard = await guardPaidEndpoint(req, "stage-caption-token", {
      limit: 120,
      windowMs: 60 * 60 * 1000,
    });
    if (!guard.ok) return guard.response;

    if (!(await maySpeak(spaceId, guard.wallet))) {
      return jsonResponse({ error: "Not entitled to caption this stage." }, 403);
    }

    const { token, scheme, expiresIn } = await mintCredential();

    return new Response(
      JSON.stringify({ token, scheme, expiresIn, params: listenParams() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[stage-caption-token]", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
