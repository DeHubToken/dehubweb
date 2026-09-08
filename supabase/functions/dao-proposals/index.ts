// DAO proposals, contribution-weighted voting, and manual buy-offer payment.
//
// No client is trusted for identity or voting power. `create` snapshots every
// historic DHB contribution into dao_proposal_voters; later votes can only use
// the weight in that snapshot. Accepted buyers send funds directly to the DAO
// and this function records the transaction as evidence for manual review.

import {
  guardPaidEndpoint,
  handleCorsPreflight,
  jsonResponse,
  serviceClient,
} from "../_shared/auth.ts";

const DAO_TREASURY = "0xb6fcacda06676b775188dfc9c4d7c4aeb564d3c4";
const DHB_BASE = "0xd20ab1015f6a2de4a6fddebab270113f689c2f7c";
const DHB_BNB = "0x680d3113caf77b61b510f332d5ef4cf5b41a761d";
const VOTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type ProposalAction = "create" | "vote" | "submit_payment";
type ContributionMap = Map<string, number>;

interface AlchemyTransfer {
  from?: string;
  to?: string;
  value?: number | string;
}

interface AlchemyPage {
  transfers?: AlchemyTransfer[];
  pageKey?: string;
}

async function fetchTransferPage(
  rpcUrl: string,
  contract: string,
  pageKey?: string,
): Promise<AlchemyPage> {
  const params: Record<string, unknown> = {
    fromBlock: "0x0",
    toBlock: "latest",
    toAddress: DAO_TREASURY,
    contractAddresses: [contract],
    category: ["erc20"],
    withMetadata: false,
    order: "asc",
    maxCount: "0x3e8",
  };
  if (pageKey) params.pageKey = pageKey;

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [params],
    }),
  });
  if (!response.ok) throw new Error(`Contribution index returned ${response.status}.`);
  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error.message || "Contribution index failed.");
  return payload?.result ?? {};
}

async function readDaoContributors(): Promise<ContributionMap> {
  const key = Deno.env.get("ALCHEMY_API_KEY");
  if (!key) throw new Error("DAO contribution verification is not configured.");

  const chains = [
    { rpc: `https://base-mainnet.g.alchemy.com/v2/${key}`, contract: DHB_BASE },
    { rpc: `https://bnb-mainnet.g.alchemy.com/v2/${key}`, contract: DHB_BNB },
  ];
  const totals: ContributionMap = new Map();

  for (const chain of chains) {
    let pageKey: string | undefined;
    do {
      const page = await fetchTransferPage(chain.rpc, chain.contract, pageKey);
      for (const transfer of page.transfers ?? []) {
        const from = transfer.from?.toLowerCase() ?? "";
        const amount = Number(transfer.value ?? 0);
        if (!/^0x[a-f0-9]{40}$/.test(from) || from === DAO_TREASURY) continue;
        if (!Number.isFinite(amount) || amount <= 0) continue;
        totals.set(from, (totals.get(from) ?? 0) + amount);
      }
      pageKey = page.pageKey;
    } while (pageKey);
  }

  return totals;
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function validRecipient(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

async function profileFor(wallet: string): Promise<{ username: string | null; avatar: string | null }> {
  try {
    const response = await fetch(`https://api.dehub.io/api/account_info/${encodeURIComponent(wallet)}`);
    if (!response.ok) return { username: null, avatar: null };
    const payload = await response.json();
    const account = payload && typeof payload === "object" && "result" in payload
      ? payload.result
      : payload;
    return {
      username: typeof account?.username === "string" ? account.username : null,
      avatar: typeof account?.avatarImageUrl === "string" ? account.avatarImageUrl : null,
    };
  } catch {
    return { username: null, avatar: null };
  }
}

function actionLimit(action: ProposalAction) {
  if (action === "create") return { limit: 12, windowMs: 24 * 60 * 60 * 1000 };
  if (action === "vote") return { limit: 120, windowMs: 60 * 60 * 1000 };
  return { limit: 12, windowMs: 24 * 60 * 60 * 1000 };
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const action = body.action;
  if (action !== "create" && action !== "vote" && action !== "submit_payment") {
    return jsonResponse({ error: "Unknown DAO proposal action." }, 400);
  }

  const auth = await guardPaidEndpoint(req, `dao-proposals-${action}`, actionLimit(action));
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet.toLowerCase();
  const db = serviceClient();

  if (action === "create") {
    const kind = body.kind;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (kind !== "buy" && kind !== "spend") return jsonResponse({ error: "Choose buy or spend." }, 400);
    if (!title || title.length > 160) return jsonResponse({ error: "A title of up to 160 characters is required." }, 400);
    if (!description || description.length > 4000) return jsonResponse({ error: "A description of up to 4,000 characters is required." }, 400);

    const row: Record<string, unknown> = {
      proposer_address: wallet,
      kind,
      title,
      description,
      voting_ends_at: new Date(Date.now() + VOTING_WINDOW_MS).toISOString(),
    };

    if (kind === "buy") {
      const dhbAmount = positiveNumber(body.dhbAmount);
      const priceUsd = positiveNumber(body.priceUsd);
      if (!dhbAmount || !priceUsd) return jsonResponse({ error: "Enter a DHB amount and price." }, 400);
      const totalUsd = Math.round(dhbAmount * priceUsd * 100) / 100;
      if (!Number.isFinite(totalUsd) || totalUsd <= 0 || totalUsd > 1_000_000_000) {
        return jsonResponse({ error: "That offer total is outside the supported range." }, 400);
      }
      row.dhb_amount = dhbAmount;
      row.price_usd = priceUsd;
      row.total_usd = totalUsd;
    } else {
      const spendAsset = typeof body.spendAsset === "string" ? body.spendAsset.trim().toUpperCase() : "";
      const spendAmount = positiveNumber(body.spendAmount);
      const recipient = typeof body.recipientAddress === "string" ? body.recipientAddress.trim() : "";
      if (!spendAsset || spendAsset.length > 16 || !spendAmount) {
        return jsonResponse({ error: "Enter the asset and amount to spend." }, 400);
      }
      if (!validRecipient(recipient)) return jsonResponse({ error: "Enter a valid EVM or Solana recipient address." }, 400);
      row.spend_asset = spendAsset;
      row.spend_amount = spendAmount;
      row.recipient_address = recipient;
    }

    let contributors: ContributionMap;
    try {
      contributors = await readDaoContributors();
    } catch (error) {
      console.error("dao-proposals: contribution snapshot failed", error);
      return jsonResponse({ error: "Could not snapshot DAO voting power. Please try again." }, 503);
    }

    const electorate = [...contributors.values()].reduce((sum, amount) => sum + amount, 0);
    row.electorate_dhb = electorate;
    const profile = await profileFor(wallet);
    row.proposer_username = profile.username;
    row.proposer_avatar = profile.avatar;

    const { data: proposal, error: insertError } = await db
      .from("dao_proposals")
      .insert(row)
      .select()
      .single();
    if (insertError || !proposal) {
      console.error("dao-proposals: proposal insert failed", insertError);
      return jsonResponse({ error: "Could not save that proposal." }, 500);
    }

    const eligible = [...contributors.entries()].map(([address, weight]) => ({
      proposal_id: proposal.id,
      wallet_address: address,
      vote_weight: weight,
    }));
    if (eligible.length) {
      const { error: voterError } = await db.from("dao_proposal_voters").insert(eligible);
      if (voterError) {
        await db.from("dao_proposals").delete().eq("id", proposal.id);
        console.error("dao-proposals: voter snapshot insert failed", voterError);
        return jsonResponse({ error: "Could not save the contributor snapshot." }, 500);
      }

      const notifications = eligible
        .filter((voter) => voter.wallet_address !== wallet)
        .map((voter) => ({
          recipient_address: voter.wallet_address,
          actor_address: wallet,
          actor_username: profile.username,
          actor_avatar: profile.avatar,
          type: "dao_proposal_open",
          content: `A new DAO ${kind} proposal is open for seven days.`,
          reference_id: proposal.id,
          reference_title: title,
        }));
      if (notifications.length) {
        const { error: notificationError } = await db.from("custom_notifications").insert(notifications);
        if (notificationError) console.warn("dao-proposals: open notifications failed", notificationError);
      }
    }

    return jsonResponse({ success: true, proposal });
  }

  const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) return jsonResponse({ error: "A proposal id is required." }, 400);

  if (action === "vote") {
    const voteType = body.voteType;
    if (voteType !== 1 && voteType !== -1 && voteType !== 0) {
      return jsonResponse({ error: "Vote must be accept, reject, or withdraw." }, 400);
    }
    const { data: proposal, error: proposalError } = await db
      .from("dao_proposals")
      .select("id,status,voting_ends_at")
      .eq("id", proposalId)
      .maybeSingle();
    if (proposalError) return jsonResponse({ error: "Could not read that proposal." }, 500);
    if (!proposal) return jsonResponse({ error: "That proposal no longer exists." }, 404);
    if (proposal.status !== "open" || Date.parse(proposal.voting_ends_at) <= Date.now()) {
      return jsonResponse({ error: "Voting on this proposal has closed." }, 409);
    }

    const { data: eligible } = await db
      .from("dao_proposal_voters")
      .select("vote_weight")
      .eq("proposal_id", proposalId)
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (!eligible) return jsonResponse({ error: "Only contributors in this proposal's snapshot can vote." }, 403);

    const { data: current } = await db
      .from("dao_proposal_votes")
      .select("vote_type")
      .eq("proposal_id", proposalId)
      .eq("wallet_address", wallet)
      .maybeSingle();
    const withdrawing = voteType === 0 || current?.vote_type === voteType;
    const mutation = withdrawing
      ? db.from("dao_proposal_votes").delete().eq("proposal_id", proposalId).eq("wallet_address", wallet)
      : db.from("dao_proposal_votes").upsert({
          proposal_id: proposalId,
          wallet_address: wallet,
          vote_type: voteType,
          vote_weight: eligible.vote_weight,
          updated_at: new Date().toISOString(),
        }, { onConflict: "proposal_id,wallet_address" });
    const { error } = await mutation;
    if (error) {
      console.error("dao-proposals: vote failed", error);
      return jsonResponse({ error: "Could not record that vote." }, 500);
    }
    return jsonResponse({ success: true, action: withdrawing ? "removed" : "voted", weight: eligible.vote_weight });
  }

  // A just-expired vote can wait up to ten minutes for cron. Resolve it here
  // too so the accepted buyer's first payment tap never hits a stale status.
  await db.rpc("resolve_due_dao_proposals");
  const { data: proposal, error: proposalError } = await db
    .from("dao_proposals")
    .select("id,kind,status,proposer_address,payment_due_at,payment_tx_hash")
    .eq("id", proposalId)
    .maybeSingle();
  if (proposalError) return jsonResponse({ error: "Could not read that proposal." }, 500);
  if (!proposal) return jsonResponse({ error: "That proposal no longer exists." }, 404);
  if (proposal.kind !== "buy") return jsonResponse({ error: "Only buy offers have a buyer payment." }, 409);
  if (proposal.proposer_address.toLowerCase() !== wallet) return jsonResponse({ error: "Only the buyer can submit this payment." }, 403);
  if (proposal.status !== "accepted") return jsonResponse({ error: "This buy offer is not awaiting payment." }, 409);
  if (proposal.payment_due_at && Date.parse(proposal.payment_due_at) <= Date.now()) {
    return jsonResponse({ error: "The 72-hour payment window has closed." }, 409);
  }
  if (proposal.payment_tx_hash) return jsonResponse({ error: "Payment has already been submitted for review." }, 409);

  const chainId = Number(body.chainId);
  const asset = typeof body.asset === "string" ? body.asset.trim().toUpperCase() : "";
  const amount = positiveNumber(body.amount);
  const txHash = typeof body.txHash === "string" ? body.txHash.trim() : "";
  const allowed: Record<number, string[]> = {
    1: ["ETH", "USDC", "USDT"],
    56: ["BNB", "USDC", "USDT"],
    101: ["SOL", "USDC", "USDT"],
    4663: ["ETH", "USDC", "USDT"],
    8453: ["ETH", "USDC", "USDT"],
  };
  if (!allowed[chainId]?.includes(asset)) return jsonResponse({ error: "That asset is not supported on the selected chain." }, 400);
  if (!amount) return jsonResponse({ error: "Enter the amount that was transferred." }, 400);
  const validHash = chainId === 101
    ? /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(txHash)
    : /^0x[a-fA-F0-9]{64}$/.test(txHash);
  if (!validHash) return jsonResponse({ error: "Enter a valid transaction hash." }, 400);

  const { data: updated, error: updateError } = await db
    .from("dao_proposals")
    .update({
      status: "payment_submitted",
      payment_chain_id: chainId,
      payment_asset: asset,
      payment_amount: amount,
      payment_tx_hash: txHash,
      payment_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .eq("status", "accepted")
    .select()
    .single();
  if (updateError || !updated) {
    const duplicate = (updateError as { code?: string } | null)?.code === "23505";
    return jsonResponse({ error: duplicate ? "That transaction is already attached to another proposal." : "Could not submit payment proof." }, duplicate ? 409 : 500);
  }
  return jsonResponse({ success: true, proposal: updated });
});
