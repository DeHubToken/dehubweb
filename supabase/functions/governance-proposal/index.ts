// Submit a governance proposal, once the 10,000 DHB fee is on the chain.
//
// The fee was charged entirely in the browser: transfer, wait a confirmation,
// then insert the row. The insert never knew a payment existed, so posting
// straight to PostgREST created a free proposal — and the RLS policy that
// guarded it only compared the author address to the caller's own header.
//
// Both halves move here. The wallet comes from a verified DeHub token, the
// transfer is confirmed against the chain by `claimDhbPayment`, and the hash
// is stored on the row: `governance_proposals.fee_tx_hash` is unique, so one
// transfer buys exactly one proposal even inside the claim window.
//
// Badge holders post free: anyone the vote weight ladder already counts as a
// voter can propose without the fee. Everyone else still pays it.
//
// A proposal may carry one image or video, uploaded by the browser to the
// public `feature-media` bucket under the author's own wallet folder. Only a
// URL in that folder is accepted.

import { handleCorsPreflight, jsonResponse, guardPaidEndpoint, serviceClient } from "../_shared/auth.ts";
import { claimDhbPayment } from "../_shared/dhb-transfer.ts";
import { resolveVoteWeight } from "../_shared/badge-weight.ts";

const PROPOSAL_FEE_DHB = 10000;
const VOTING_WINDOW_DAYS = 7;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const auth = await guardPaidEndpoint(req, "governance-proposal", { limit: 10, windowMs: 24 * 60 * 60 * 1000 });
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet;

  let body: { title?: unknown; description?: unknown; txHash?: unknown; mediaUrl?: unknown; mediaType?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const txHash = typeof body.txHash === "string" ? body.txHash.trim() : "";

  if (!title || title.length > 200) return jsonResponse({ error: "A title of up to 200 characters is required." }, 400);
  if (!description || description.length > 5000) {
    return jsonResponse({ error: "A description of up to 5000 characters is required." }, 400);
  }

  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  const mediaType = body.mediaType === "image" || body.mediaType === "video" ? body.mediaType : null;
  if (mediaUrl) {
    const folder = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/feature-media/${wallet.toLowerCase()}/`;
    if (!mediaType || !mediaUrl.toLowerCase().startsWith(folder.toLowerCase()) || mediaUrl.length > 500) {
      return jsonResponse({ error: "That attachment could not be used. Upload it again." }, 400);
    }
  }

  const supabase = serviceClient();

  // Badge holders skip the fee. A failed badge lookup falls back to the fee
  // rather than letting the proposal through free.
  const { weight } = await resolveVoteWeight(wallet);
  let feeHash: string | null = null;
  if (weight <= 0) {
    if (!txHash) {
      return jsonResponse({ error: `Proposals cost ${PROPOSAL_FEE_DHB.toLocaleString()} DHB without a staking badge.`, feeRequired: true }, 402);
    }
    const payment = await claimDhbPayment(txHash, wallet, PROPOSAL_FEE_DHB, "governance", supabase);
    if (!payment.ok) return jsonResponse({ error: payment.reason, feeRequired: true }, 402);
    feeHash = payment.hash.toLowerCase();
  }

  // The API holds the display fields; taking them from the request would let a
  // proposal be posted under someone else's name and avatar.
  let username: string | null = null;
  let avatar: string | null = null;
  try {
    const res = await fetch(`https://api.dehub.io/api/account_info/${encodeURIComponent(wallet)}`);
    if (res.ok) {
      const payload = await res.json();
      const account = (payload && typeof payload === "object" && "result" in payload ? payload.result : payload) ?? {};
      username = typeof account.username === "string" ? account.username : null;
      avatar = typeof account.avatarImageUrl === "string" ? account.avatarImageUrl : null;
    }
  } catch { /* display fields are cosmetic — a failed lookup must not eat a paid fee */ }

  const votingEndsAt = new Date(Date.now() + VOTING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const row: Record<string, unknown> = {
    title,
    description,
    author_wallet_address: wallet,
    author_username: username,
    author_avatar: avatar,
    fee_tx_hash: feeHash,
    voting_ends_at: votingEndsAt,
  };
  if (mediaUrl) {
    row.media_url = mediaUrl;
    row.media_type = mediaType;
  }

  const insert = (values: Record<string, unknown>) =>
    supabase.from("governance_proposals").insert(values).select().single();

  let { data, error } = await insert(row);

  // Media columns not migrated yet: keep the proposal, drop the attachment.
  const code = (error as { code?: string } | null)?.code;
  if (error && mediaUrl && (code === "PGRST204" || code === "42703")) {
    delete row.media_url;
    delete row.media_type;
    ({ data, error } = await insert(row));
  }

  if (error) {
    // 23505 is the unique index on fee_tx_hash: the transfer already bought a
    // proposal. Say so rather than letting a retry look like a server fault.
    if ((error as { code?: string }).code === "23505") {
      return jsonResponse({ error: "That transfer has already been used for a proposal." }, 409);
    }
    console.error("governance-proposal: insert failed", error);
    return jsonResponse({
      error: feeHash
        ? "Fee confirmed but the proposal could not be saved. Your draft is kept — press Submit again to retry without paying twice."
        : "The proposal could not be saved. Your draft is kept — press Submit again.",
    }, 500);
  }

  return jsonResponse({ success: true, proposal: data });
});
