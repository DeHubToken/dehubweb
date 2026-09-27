// Creator packs: emoji, sticker and GIF packs published by badge holders.
//
// Every write to `creator_packs`, `creator_pack_items` and `custom_emojis`
// comes through here — the tables grant clients SELECT only. Two things are
// decided on the server and never taken from the request:
//
//   · Who is acting — `guardPaidEndpoint` resolves the wallet from a verified
//     DeHub token.
//   · What they may publish — `resolveVoteWeight` reads the badge the API holds
//     for that wallet, and `packLimitsFor` turns the tier into pack and item
//     caps. No badge means no packs.
//
// A holder who drops a tier keeps what they already published; they just
// cannot add past the new caps until they are back under them.

import { handleCorsPreflight, jsonResponse, guardPaidEndpoint, serviceClient } from "../_shared/auth.ts";
import { resolveVoteWeight } from "../_shared/badge-weight.ts";
import { PACK_KINDS, packLimitsFor, type PackKind } from "../_shared/creator-pack-limits.ts";

const SHORTCODE_RE = /^[a-z0-9_+-]*[a-z][a-z0-9_+-]*$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_BATCH = 200;

interface IncomingItem {
  imageUrl?: unknown;
  animated?: unknown;
  shortcode?: unknown;
  emoji?: unknown;
}

function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^https:\/\/\S+$/i.test(s) && s.length <= 2048 ? s : null;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${base.length >= 2 ? base : "pack"}-${suffix}`;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const auth = await guardPaidEndpoint(req, "creator-packs", { limit: 300, windowMs: 60 * 60 * 1000 });
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const db = serviceClient();
  const { badgeName } = await resolveVoteWeight(wallet);
  const limits = packLimitsFor(badgeName);

  const ownedPack = async (packId: unknown) => {
    if (typeof packId !== "string" || !UUID_RE.test(packId)) return null;
    const { data } = await db
      .from("creator_packs")
      .select("id, kind, owner, item_count, cover_url, slug")
      .eq("id", packId)
      .maybeSingle();
    return data && data.owner === wallet ? data : null;
  };

  switch (body.action) {
    case "status": {
      const { data } = await db.from("creator_packs").select("kind").eq("owner", wallet);
      const usage: Record<PackKind, number> = { emoji: 0, sticker: 0, gif: 0 };
      for (const row of data ?? []) usage[row.kind as PackKind] += 1;
      return jsonResponse({ tier: badgeName, limits, usage });
    }

    case "create_pack": {
      const kind = body.kind as PackKind;
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 64) : "";
      if (!PACK_KINDS.includes(kind)) return jsonResponse({ error: "Unknown pack kind.", code: "BAD_KIND" }, 400);
      if (!name) return jsonResponse({ error: "A pack needs a name.", code: "NO_NAME" }, 400);
      if (!limits.packs) {
        return jsonResponse({ error: "Creating packs needs a staking badge.", code: "NO_BADGE" }, 403);
      }
      const { count } = await db
        .from("creator_packs")
        .select("id", { count: "exact", head: true })
        .eq("owner", wallet)
        .eq("kind", kind);
      if ((count ?? 0) >= limits.packs) {
        return jsonResponse({ error: "Your badge tier has no free pack slots.", code: "PACK_LIMIT", limits }, 403);
      }
      const { data, error } = await db
        .from("creator_packs")
        .insert({ kind, name, slug: slugify(name), owner: wallet })
        .select("*")
        .single();
      if (error) {
        console.error("creator-packs: create failed", error);
        return jsonResponse({ error: "Could not create that pack." }, 500);
      }
      return jsonResponse({ pack: data });
    }

    case "rename_pack": {
      const pack = await ownedPack(body.packId);
      if (!pack) return jsonResponse({ error: "Pack not found.", code: "NOT_FOUND" }, 404);
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 64) : "";
      if (!name) return jsonResponse({ error: "A pack needs a name.", code: "NO_NAME" }, 400);
      const { data, error } = await db.from("creator_packs").update({ name }).eq("id", pack.id).select("*").single();
      if (error) return jsonResponse({ error: "Could not rename that pack." }, 500);
      return jsonResponse({ pack: data });
    }

    case "delete_pack": {
      const pack = await ownedPack(body.packId);
      if (!pack) return jsonResponse({ error: "Pack not found.", code: "NOT_FOUND" }, 404);
      const { error } = await db.from("creator_packs").delete().eq("id", pack.id);
      if (error) return jsonResponse({ error: "Could not delete that pack." }, 500);
      return jsonResponse({ deleted: pack.id });
    }

    case "add_items": {
      const pack = await ownedPack(body.packId);
      if (!pack) return jsonResponse({ error: "Pack not found.", code: "NOT_FOUND" }, 404);
      const kind = pack.kind as PackKind;
      if (!limits.packs) {
        return jsonResponse({ error: "Adding to packs needs a staking badge.", code: "NO_BADGE" }, 403);
      }
      const room = Math.max(0, limits.items[kind] - (pack.item_count ?? 0));
      if (!room) {
        return jsonResponse({ error: "This pack is full for your badge tier.", code: "ITEM_LIMIT", limits }, 403);
      }
      const raw = Array.isArray(body.items) ? (body.items as IncomingItem[]).slice(0, MAX_BATCH) : [];
      const valid = raw
        .map((it) => ({
          imageUrl: httpsUrl(it?.imageUrl),
          animated: it?.animated === true,
          shortcode: typeof it?.shortcode === "string" ? it.shortcode.trim().toLowerCase() : "",
          emoji: typeof it?.emoji === "string" && it.emoji.trim() ? it.emoji.trim().slice(0, 16) : null,
        }))
        .filter((it) => it.imageUrl && (kind !== "emoji" || (SHORTCODE_RE.test(it.shortcode) && it.shortcode.length >= 2 && it.shortcode.length <= 64)));

      let added: unknown[] = [];
      let skipped = raw.length - valid.length;

      if (kind === "emoji") {
        // Shortcodes are one global namespace — `:name:` has to mean the same
        // image in every message — so names already taken are skipped, not
        // an error for the whole batch.
        const seen = new Set<string>();
        const unique = valid.filter((v) => !seen.has(v.shortcode) && seen.add(v.shortcode));
        const { data: taken } = await db
          .from("custom_emojis")
          .select("shortcode")
          .in("shortcode", unique.map((v) => v.shortcode));
        const takenSet = new Set((taken ?? []).map((r) => r.shortcode));
        const fresh = unique.filter((v) => !takenSet.has(v.shortcode)).slice(0, room);
        skipped += valid.length - fresh.length;
        if (fresh.length) {
          const { data, error } = await db
            .from("custom_emojis")
            .insert(fresh.map((v) => ({
              shortcode: v.shortcode,
              image_url: v.imageUrl,
              animated: v.animated,
              source: typeof body.source === "string" ? body.source.slice(0, 32) : "upload",
              created_by: wallet,
              pack_id: pack.id,
            })))
            .select("id, shortcode, image_url, animated, source, category, created_by, pack_id");
          if (error) {
            console.error("creator-packs: emoji insert failed", error);
            return jsonResponse({ error: "Could not add those emoji.", code: "INSERT_FAILED" }, 409);
          }
          added = data ?? [];
        }
      } else {
        const fresh = valid.slice(0, room);
        skipped += valid.length - fresh.length;
        const start = pack.item_count ?? 0;
        const { data, error } = await db
          .from("creator_pack_items")
          .insert(fresh.map((v, i) => ({
            pack_id: pack.id,
            image_url: v.imageUrl,
            animated: v.animated,
            emoji: v.emoji,
            position: start + i,
          })))
          .select("*");
        if (error) {
          console.error("creator-packs: item insert failed", error);
          return jsonResponse({ error: "Could not add those items." }, 500);
        }
        added = data ?? [];
      }

      if (!pack.cover_url && added.length) {
        const first = added[0] as { image_url: string };
        await db.from("creator_packs").update({ cover_url: first.image_url }).eq("id", pack.id);
      }
      return jsonResponse({ added, skipped });
    }

    case "remove_item": {
      const pack = await ownedPack(body.packId);
      if (!pack) return jsonResponse({ error: "Pack not found.", code: "NOT_FOUND" }, 404);
      const itemId = typeof body.itemId === "string" && UUID_RE.test(body.itemId) ? body.itemId : null;
      if (!itemId) return jsonResponse({ error: "An item id is required." }, 400);
      const table = pack.kind === "emoji" ? "custom_emojis" : "creator_pack_items";
      const { data: gone, error } = await db
        .from(table)
        .delete()
        .eq("id", itemId)
        .eq("pack_id", pack.id)
        .select("image_url");
      if (error) return jsonResponse({ error: "Could not remove that item." }, 500);
      // The cover pointed at the item just removed: fall back to whatever is left.
      if (gone?.[0] && gone[0].image_url === pack.cover_url) {
        const { data: next } = await db.from(table).select("image_url").eq("pack_id", pack.id).limit(1);
        await db.from("creator_packs").update({ cover_url: next?.[0]?.image_url ?? null }).eq("id", pack.id);
      }
      return jsonResponse({ removed: itemId });
    }

    default:
      return jsonResponse({ error: "Unknown action." }, 400);
  }
});
