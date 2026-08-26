// Submit a governance proposal, once the 10,000 DHB fee is on the chain.
//
// The fee was charged entirely in the browser: transfer, wait a confirmation,
// then insert the row. The insert never knew a payment existed, so posting
// straight to PostgREST created a free proposal — and the RLS policy that
// guarded it only compared the author address to the caller's own header.
//
// Both halves move here. The wallet comes from a verified DeHub token, the
// transfer is confirmed against the chain by `verifyDhbPayment`, and the hash
// is stored on the row: `governance_proposals.fee_tx_hash` is unique, so one
// transfer buys exactly one proposal even inside the claim window.

import { handleCorsPreflight, jsonResponse, guardPaidEndpoint, serviceClient } from "../_shared/auth.ts";
import { verifyDhbPayment } from "../_shared/dhb-transfer.ts";

const PROPOSAL_FEE_DHB = 10000;
const VOTING_WINDOW_DAYS = 7;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const auth = await guardPaidEndpoint(req, "governance-proposal", { limit: 10, windowMs: 24 * 60 * 60 * 1000 });
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet;

  let body: { title?: unknown; description?: unknown; txHash?: unknown };
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

  const payment = await verifyDhbPayment(txHash, wallet, PROPOSAL_FEE_DHB);
  if (!payment.ok) return jsonResponse({ error: payment.reason }, 402);

  const supabase = serviceClient();

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

  const { data, error } = await supabase
    .from("governance_proposals")
    .insert({
      title,
      description,
      author_wallet_address: wallet,
      author_username: username,
      author_avatar: avatar,
      fee_tx_hash: payment.hash.toLowerCase(),
      voting_ends_at: votingEndsAt,
    })
    .select()
    .single();

  if (error) {
    // 23505 is the unique index on fee_tx_hash: the transfer already bought a
    // proposal. Say so rather than letting a retry look like a server fault.
    if ((error as { code?: string }).code === "23505") {
      return jsonResponse({ error: "That transfer has already been used for a proposal." }, 409);
    }
    console.error("governance-proposal: insert failed", error);
    return jsonResponse({ error: "Fee confirmed but the proposal could not be saved. Contact support with your transaction hash." }, 500);
  }

  return jsonResponse({ success: true, proposal: data });
});
