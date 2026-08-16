/**
 * Stream Products
 * ===============
 * The write path for a live stream's shopping rail: attach / detach / pin /
 * unpin / reorder.
 *
 * Why this is an edge function and not RLS. Every wallet-gated policy in this
 * project resolves the caller through get_request_wallet_address(), which reads
 * the unsigned `x-wallet-address` request header. That is enough to stop an
 * honest client from touching someone else's row, but anyone holding the public
 * anon key can set that header to any address. For a shopping rail bolted onto
 * a live broadcast, the thing a forger would do with that is obvious: pin their
 * own listings onto a popular creator's stream and take the sales. So writes
 * are service-role only, and identity comes from requireDeHubAuth(), which
 * resolves the wallet off a verified DeHub token rather than off a header.
 *
 * Ownership is checked twice, against two different sources:
 *   1. the stream — /api/nft_info/{tokenId}.minter must be the caller
 *   2. the goods  — store_listings.wallet_address must be the caller
 *
 * (2) is a deliberate v1 constraint: a creator may only pin listings from their
 * own store. Pinning someone else's goods is an affiliate feature and needs a
 * consent + payout split that does not exist yet; without it, "attach" would be
 * a way to advertise a stranger's shop, or to point buyers at a listing whose
 * seller never agreed to be sold live.
 */

import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from "../_shared/auth.ts";

const DEHUB_API_BASE = "https://api.dehub.io";

/** Hard cap on rail size — a stream is not a catalogue. */
const MAX_PRODUCTS_PER_STREAM = 20;

/**
 * The wallet that minted a token, or null.
 *
 * nft_info is public and unauthenticated, so this is a read of the same record
 * the post page renders — no privileged call, and no way for the caller to
 * influence the answer.
 */
async function resolveStreamOwner(tokenId: string): Promise<string | null> {
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/nft_info/${encodeURIComponent(tokenId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const minter = data?.result?.minter;
    return typeof minter === "string" ? minter.toLowerCase() : null;
  } catch {
    // Fail closed: if we cannot establish who owns the stream, nobody does.
    return null;
  }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = String(body.action || "");
  const tokenId = body.tokenId == null ? "" : String(body.tokenId);

  if (!tokenId) return jsonResponse({ error: "tokenId is required" }, 400);

  // Every action mutates one stream's rail, so establish stream ownership once,
  // before looking at what the caller wants to do with it.
  const owner = await resolveStreamOwner(tokenId);
  if (!owner) {
    return jsonResponse({ error: "Stream not found" }, 404);
  }
  if (owner !== wallet) {
    return jsonResponse({ error: "You do not own this stream" }, 403);
  }

  const supabase = serviceClient();

  try {
    switch (action) {
      case "attach": {
        const listingId = String(body.listingId || "");
        if (!listingId) return jsonResponse({ error: "listingId is required" }, 400);

        // The listing must exist, be sellable, and belong to the caller.
        const { data: listing, error: listingErr } = await supabase
          .from("store_listings")
          .select("id, wallet_address, status, price")
          .eq("id", listingId)
          .maybeSingle();

        if (listingErr) throw listingErr;
        if (!listing) return jsonResponse({ error: "Listing not found" }, 404);
        if (String(listing.wallet_address).toLowerCase() !== wallet) {
          return jsonResponse({ error: "You can only attach your own listings" }, 403);
        }
        if (listing.status !== "active") {
          return jsonResponse({ error: "That listing is not active" }, 400);
        }

        const { count } = await supabase
          .from("stream_products")
          .select("id", { count: "exact", head: true })
          .eq("token_id", tokenId);

        if ((count ?? 0) >= MAX_PRODUCTS_PER_STREAM) {
          return jsonResponse(
            { error: `A stream can hold ${MAX_PRODUCTS_PER_STREAM} products.` },
            400,
          );
        }

        // A live price override is optional, but if given it has to be a real
        // price — a NaN or negative here would reach the buyer's quote.
        let livePrice: number | null = null;
        if (body.livePrice != null && body.livePrice !== "") {
          const parsed = Number(body.livePrice);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            return jsonResponse({ error: "livePrice must be a positive number" }, 400);
          }
          if (parsed > Number(listing.price)) {
            return jsonResponse(
              { error: "A live price can only be lower than the listing price." },
              400,
            );
          }
          livePrice = parsed;
        }

        const { data, error } = await supabase
          .from("stream_products")
          .upsert(
            {
              token_id: tokenId,
              listing_id: listingId,
              creator_address: wallet,
              live_price: livePrice,
              position: count ?? 0,
            },
            { onConflict: "token_id,listing_id" },
          )
          .select()
          .single();

        if (error) throw error;
        return jsonResponse({ success: true, product: data });
      }

      case "detach": {
        const listingId = String(body.listingId || "");
        if (!listingId) return jsonResponse({ error: "listingId is required" }, 400);

        const { error } = await supabase
          .from("stream_products")
          .delete()
          .eq("token_id", tokenId)
          .eq("listing_id", listingId);

        if (error) throw error;
        return jsonResponse({ success: true });
      }

      case "pin": {
        const listingId = String(body.listingId || "");
        if (!listingId) return jsonResponse({ error: "listingId is required" }, 400);

        // Clear first: idx_stream_products_one_pin is a partial unique index,
        // so setting a second pin before dropping the first is a constraint
        // violation, not a silent overwrite. The gap between the two writes
        // shows the rail with nothing highlighted, which is the honest state.
        const { error: clearErr } = await supabase
          .from("stream_products")
          .update({ is_pinned: false, pinned_at: null })
          .eq("token_id", tokenId)
          .eq("is_pinned", true);
        if (clearErr) throw clearErr;

        const { data, error } = await supabase
          .from("stream_products")
          .update({ is_pinned: true, pinned_at: new Date().toISOString() })
          .eq("token_id", tokenId)
          .eq("listing_id", listingId)
          .select()
          .maybeSingle();

        if (error) throw error;
        if (!data) return jsonResponse({ error: "That product is not on this stream" }, 404);
        return jsonResponse({ success: true, product: data });
      }

      case "unpin": {
        const { error } = await supabase
          .from("stream_products")
          .update({ is_pinned: false, pinned_at: null })
          .eq("token_id", tokenId)
          .eq("is_pinned", true);

        if (error) throw error;
        return jsonResponse({ success: true });
      }

      case "reorder": {
        const ids = Array.isArray(body.listingIds) ? body.listingIds.map(String) : [];
        if (!ids.length) return jsonResponse({ error: "listingIds is required" }, 400);

        // Position is per-stream, so scoping each write to token_id is what
        // keeps a reorder from renumbering a row on another stream.
        await Promise.all(
          ids.map((listingId, index) =>
            supabase
              .from("stream_products")
              .update({ position: index })
              .eq("token_id", tokenId)
              .eq("listing_id", listingId),
          ),
        );

        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[stream-products] error", err);
    return jsonResponse({ error: "Failed to update stream products" }, 500);
  }
});
