/**
 * Fraction Checkout
 * =================
 * List, buy, and settle fractions of a post. Every upload mints 1000 ERC-1155
 * units of one token id; this is the function that moves them between wallets
 * without either side having to trust the other's client.
 *
 * It exists because the fraction panel used to do all of this in the browser:
 * the buyer sent DHB straight to the seller and the UI said "the seller will
 * then transfer the fractions to you". Nothing read the chain. A trade row was
 * an unauthenticated INSERT naming any two addresses, `filled_quantity` never
 * moved so a listing could be sold forever, and nothing checked the seller
 * still held what they were selling.
 *
 * The shape is deliberately the same as live-checkout — server quotes, buyer
 * pays, server reads the transfer back off-chain before any row exists — with
 * one thing that store checkout does not have to deal with:
 *
 *   **A fraction trade is a swap.** DHB goes one way and an ERC-1155 balance
 *   goes the other. With no escrow contract deployed, one leg necessarily
 *   lands before the other, and no amount of client code changes that. So the
 *   trade row is a two-leg state machine instead of a receipt: whoever moved
 *   first is recorded as having moved (verified on-chain), whoever owes the
 *   second leg is named, and the obligation has a deadline attached. Both
 *   first legs are verified before the row is written, so an open obligation
 *   is always backed by a transaction that really happened.
 *
 * That is honest escrowless settlement, not atomic settlement. Making it
 * atomic needs a swap contract on the collection — see the PR notes.
 */

import {
  handleCorsPreflight,
  jsonResponse,
  rateLimitByIp,
  requireDeHubAuth,
  resolveDeHubAddress,
  serviceClient,
} from "../_shared/auth.ts";

/** How long the second leg of a swap has before it counts as a default. */
const SETTLE_WINDOW_HOURS = 24;

/** Fractions minted per upload. Every token id is 1000 units, always. */
const TOTAL_FRACTIONS = 1000;

/** Sanity ceiling on a listing price, so a fat finger cannot post 1e30 DHB. */
const MAX_PRICE_PER_FRACTION = 1_000_000_000;

/**
 * Peg tolerance between quote and confirm, matching live-checkout. Prices here
 * are quoted in DHB directly rather than converted from USD, so this only
 * absorbs a wallet rounding the amount down by a hair.
 */
const UNDERPAY_TOLERANCE = 0.99;

/** keccak256("Transfer(address,address,uint256)") */
const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** keccak256("TransferSingle(address,address,address,uint256,uint256)") */
const ERC1155_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
/** keccak256("TransferBatch(address,address,address,uint256[],uint256[])") */
const ERC1155_BATCH_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

/** ERC20Pausable.paused() */
const PAUSED_SELECTOR = "0x5c975abb";
/** ERC1155.balanceOf(address,uint256) */
const BALANCE_OF_SELECTOR = "0x00fdd58e";

const DHB_DECIMALS = 18;

interface ChainConfig {
  name: string;
  dhb: string;
  collection: string;
  alchemy: string;
  fallbackRpc: string;
}

/**
 * Only the two chains the collection is actually deployed on. Ethereum and
 * Robinhood appear in the client's CHAIN_CONFIGS but no post has ever been
 * minted there, and quoting against a contract with no bytecode reads as
 * "seller holds zero" rather than as an error.
 */
const CHAINS: Record<number, ChainConfig> = {
  8453: {
    name: "Base",
    dhb: "0xd20ab1015f6a2de4a6fddebab270113f689c2f7c",
    collection: "0x9f8012074d27f8596c0e5038477acb52057bc934",
    alchemy: "base-mainnet",
    fallbackRpc: "https://mainnet.base.org",
  },
  56: {
    name: "BNB Chain",
    dhb: "0x680d3113caf77b61b510f332d5ef4cf5b41a761d",
    collection: "0x1065f5922a336c75623b55d22c4a0c760efce947",
    alchemy: "bnb-mainnet",
    fallbackRpc: "https://bsc-dataseed.binance.org",
  },
};

function rpcUrl(chainId: number): string {
  const chain = CHAINS[chainId];
  const key = Deno.env.get("ALCHEMY_API_KEY");
  return key
    ? `https://${chain.alchemy}.g.alchemy.com/v2/${key}`
    : chain.fallbackRpc;
}

async function rpc<T>(chainId: number, method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(rpcUrl(chainId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) {
      console.error(`[fraction-checkout] rpc ${method}`, json.error);
      return null;
    }
    return json.result as T;
  } catch (err) {
    console.error(`[fraction-checkout] rpc ${method} threw`, err);
    return null;
  }
}

/**
 * Is DHB transfer-frozen on this chain right now?
 *
 * DHB is ERC20Pausable and has spent long stretches paused on both chains with
 * no exemption for any address, so quoting a price while it is paused just
 * spends the buyer's gas on a guaranteed revert. Unknown reads as not paused:
 * an RPC outage should degrade to the wallet reporting the revert rather than
 * take the whole market down.
 */
async function isDhbPaused(chainId: number): Promise<boolean> {
  const result = await rpc<string>(chainId, "eth_call", [
    { to: CHAINS[chainId].dhb, data: PAUSED_SELECTOR },
    "latest",
  ]);
  if (!result) return false;
  try {
    return BigInt(result) === 1n;
  } catch {
    return false;
  }
}

function padAddress(address: string): string {
  return address.toLowerCase().replace("0x", "").padStart(64, "0");
}

function padUint(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

/**
 * How many fractions of `tokenId` does `address` hold right now?
 *
 * This is the check that stops a seller listing fractions they do not have.
 * Returns null when the read fails, which callers treat as "cannot confirm" —
 * refusing a listing is better than admitting one that can never be delivered.
 */
async function fractionBalance(
  chainId: number,
  address: string,
  tokenId: string,
): Promise<number | null> {
  let id: bigint;
  try {
    id = BigInt(tokenId);
  } catch {
    return null;
  }
  const data = `${BALANCE_OF_SELECTOR}${padAddress(address)}${padUint(id)}`;
  const result = await rpc<string>(chainId, "eth_call", [
    { to: CHAINS[chainId].collection, data },
    "latest",
  ]);
  if (!result || result === "0x") return null;
  try {
    return Number(BigInt(result));
  } catch {
    return null;
  }
}

interface TxReceipt {
  status: string;
  from: string;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}

/** Strip an indexed-address topic back to a 0x-address. */
function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/** Split a hex data blob into 32-byte words. */
function words(data: string): string[] {
  const body = data.replace(/^0x/, "");
  const out: string[] = [];
  for (let i = 0; i + 64 <= body.length; i += 64) out.push(body.slice(i, i + 64));
  return out;
}

type ReceiptCheck =
  | { ok: true; receipt: TxReceipt }
  | { ok: false; error: string; status: number; retryable?: boolean };

/**
 * Fetch a receipt and assert it succeeded and came from the expected wallet.
 *
 * The sender check is what stops someone harvesting a stranger's transfer:
 * without it, any transaction hash that happens to contain a matching transfer
 * could be claimed by whoever submitted it first.
 */
async function loadReceipt(
  chainId: number,
  txHash: string,
  expectedSender: string,
): Promise<ReceiptCheck> {
  const receipt = await rpc<TxReceipt>(chainId, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) {
    // Not mined yet, or the node has not caught up. The client retries.
    return { ok: false, error: "Transaction not found yet", status: 202, retryable: true };
  }
  if (BigInt(receipt.status) !== 1n) {
    return { ok: false, error: "That transaction failed on-chain", status: 400 };
  }
  if (String(receipt.from).toLowerCase() !== expectedSender) {
    return { ok: false, error: "That transaction was not sent from your wallet", status: 403 };
  }
  return { ok: true, receipt };
}

/**
 * Sum DHB moved from `buyer` to `seller` in this transaction, in whole DHB.
 *
 * Reads logs rather than call data, so a payment routed through a smart account
 * or a batched userOp still counts and a transfer of some other token never
 * does. Multiple matching logs add up — a wallet that splits the payment is
 * still paying.
 */
function dhbPaid(
  receipt: TxReceipt,
  chainId: number,
  buyer: string,
  seller: string,
): bigint {
  let units = 0n;
  for (const log of receipt.logs || []) {
    if (String(log.address).toLowerCase() !== CHAINS[chainId].dhb) continue;
    if (log.topics?.[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    if (log.topics.length < 3) continue;
    if (topicToAddress(log.topics[1]) !== buyer) continue;
    if (topicToAddress(log.topics[2]) !== seller) continue;
    try {
      units += BigInt(log.data);
    } catch { /* malformed log, ignore */ }
  }
  return units;
}

/**
 * Count fractions of `tokenId` moved from `seller` to `buyer`.
 *
 * Handles both ERC-1155 transfer events. The app's own transfer path only ever
 * emits TransferSingle, but a seller settling from MetaMask or a batch tool can
 * produce TransferBatch, and refusing to see it would mean telling someone who
 * really delivered that they did not.
 */
function fractionsDelivered(
  receipt: TxReceipt,
  chainId: number,
  seller: string,
  buyer: string,
  tokenId: string,
): bigint {
  let id: bigint;
  try {
    id = BigInt(tokenId);
  } catch {
    return 0n;
  }

  let moved = 0n;
  for (const log of receipt.logs || []) {
    if (String(log.address).toLowerCase() !== CHAINS[chainId].collection) continue;
    const topic0 = log.topics?.[0]?.toLowerCase();
    if (log.topics.length < 4) continue;
    // topics are [event, operator, from, to] for both variants.
    if (topicToAddress(log.topics[2]) !== seller) continue;
    if (topicToAddress(log.topics[3]) !== buyer) continue;

    const w = words(log.data);
    try {
      if (topic0 === ERC1155_SINGLE_TOPIC) {
        // data = (uint256 id, uint256 value)
        if (w.length < 2) continue;
        if (BigInt(`0x${w[0]}`) !== id) continue;
        moved += BigInt(`0x${w[1]}`);
      } else if (topic0 === ERC1155_BATCH_TOPIC) {
        // data = (uint256[] ids, uint256[] values), both as offset → len → items
        if (w.length < 2) continue;
        const idsAt = Number(BigInt(`0x${w[0]}`)) / 32;
        const valsAt = Number(BigInt(`0x${w[1]}`)) / 32;
        const idsLen = Number(BigInt(`0x${w[idsAt]}`));
        const valsLen = Number(BigInt(`0x${w[valsAt]}`));
        if (idsLen !== valsLen) continue;
        for (let i = 0; i < idsLen; i++) {
          if (BigInt(`0x${w[idsAt + 1 + i]}`) !== id) continue;
          moved += BigInt(`0x${w[valsAt + 1 + i]}`);
        }
      }
    } catch { /* malformed log, ignore */ }
  }
  return moved;
}

/**
 * Whole DHB → base units, keeping 6dp.
 *
 * Split through a fixed-point string rather than `amount * 1e6`: DHB is pegged
 * at $0.001, so a large listing runs to twelve figures, and 1e12 × 1e6 is well
 * past Number's exact-integer range. That multiply would silently round the
 * minimum-payment threshold, which is the one number here that must not drift.
 */
function dhbToUnits(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) return 0n;
  const [whole, frac = ""] = amount.toFixed(6).split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, "0"))) *
    10n ** BigInt(DHB_DECIMALS - 6);
}

function unitsToDhb(units: bigint): number {
  return Number(units / 10n ** BigInt(DHB_DECIMALS - 6)) / 1e6;
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = String(body.action || "");

  // ── Who is asking ───────────────────────────────────────────────────────
  //
  // Everything that moves value needs a verified token. A quote does not: the
  // listing row, the seller's live balance and whether DHB is paused are all
  // public, and the browse grid is a public page. Gating it anyway meant a
  // signed-out visitor clicking any card got a 401 before the browser had a
  // price to show — on the one screen whose whole job is to sell things.
  //
  // A token is still read when one is sent, but only so a seller is told they
  // are looking at their own listing. Nothing in this branch spends, writes or
  // discloses anything keyed on that address, so an expired token degrades to
  // anonymous rather than to an error, and "" never equals a real address.
  let wallet: string;
  if (action === "quote") {
    // A quote costs two eth_calls against our own RPC key and the drawer
    // re-quotes on every slider move, so the anonymous door gets a per-IP
    // ceiling. checkRateLimit fails open, which is the right way round: a
    // limiter that cannot reach its table must not close the market.
    const limited = await rateLimitByIp(req, "fraction-quote", {
      limit: 600,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    const token = req.headers.get("x-dehub-token") || "";
    wallet = (token ? await resolveDeHubAddress(token) : null) || "";
  } else {
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    wallet = auth.wallet;
  }

  const supabase = serviceClient();

  try {
    // ── List ──────────────────────────────────────────────────────────────
    // Creating a listing is a write the client could do under RLS, but only
    // the server can ask the chain whether the seller actually holds what they
    // are about to sell. Without this the grid fills with listings that revert
    // on delivery, and the honest sellers are the ones who look unreliable.
    if (action === "list") {
      const tokenId = String(body.tokenId || "");
      const chainId = Number(body.chainId) || 8453;
      const quantity = positiveInt(body.quantity);
      const price = Number(body.pricePerFraction);

      if (!tokenId) return jsonResponse({ error: "tokenId is required" }, 400);
      if (!CHAINS[chainId]) return jsonResponse({ error: "Unsupported chain" }, 400);
      if (!quantity || quantity > TOTAL_FRACTIONS) {
        return jsonResponse({ error: `Quantity must be between 1 and ${TOTAL_FRACTIONS}` }, 400);
      }
      if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE_PER_FRACTION) {
        return jsonResponse({ error: "Enter a price above zero" }, 400);
      }

      const balance = await fractionBalance(chainId, wallet, tokenId);
      if (balance === null) {
        return jsonResponse(
          { error: "Could not read your fraction balance right now — try again shortly" },
          503,
        );
      }
      if (balance === 0) {
        return jsonResponse({ error: "You don't hold any fractions of this post" }, 400);
      }

      // Already-listed fractions count against the balance, or the same 100
      // fractions could back ten listings and nine buyers would go unfilled.
      const { data: openListings } = await supabase
        .from("fraction_listings")
        .select("quantity, filled_quantity")
        .eq("token_id", tokenId)
        .eq("chain_id", chainId)
        .ilike("seller_address", wallet)
        .eq("status", "active");

      const alreadyListed = (openListings || []).reduce(
        (sum, l) => sum + (Number(l.quantity) - Number(l.filled_quantity)),
        0,
      );
      // Fractions owed on a paid-but-undelivered trade are spoken for too.
      const { data: owed } = await supabase
        .from("fraction_trades")
        .select("quantity")
        .eq("token_id", tokenId)
        .ilike("seller_address", wallet)
        .eq("status", "awaiting_delivery");
      const alreadyOwed = (owed || []).reduce((sum, t) => sum + Number(t.quantity), 0);

      const spare = balance - alreadyListed - alreadyOwed;
      if (quantity > spare) {
        return jsonResponse({
          error: spare > 0
            ? `You can only list ${spare} more — the rest are already listed or owed on a sale`
            : "All of your fractions of this post are already listed or owed on a sale",
        }, 400);
      }

      const post = (body.post || {}) as Record<string, unknown>;
      const { data: listing, error: listErr } = await supabase
        .from("fraction_listings")
        .insert({
          token_id: tokenId,
          chain_id: chainId,
          seller_address: wallet,
          quantity,
          price_per_fraction: price,
          // Display snapshot so the browse grid is one query rather than an
          // /api/feed round trip per card. Never read for anything that decides
          // money — the token id is the only identity that matters.
          post_title: String(post.title || "").slice(0, 200) || null,
          post_image_url: String(post.imageUrl || "").slice(0, 500) || null,
          post_type: String(post.type || "").slice(0, 24) || null,
          creator_address: String(post.creatorAddress || "").toLowerCase() || null,
          creator_username: String(post.creatorUsername || "").slice(0, 64) || null,
        })
        .select()
        .single();

      if (listErr) throw listErr;
      return jsonResponse({ success: true, listing, balance });
    }

    // ── Quote ─────────────────────────────────────────────────────────────
    if (action === "quote") {
      const listingId = String(body.listingId || "");
      const quantity = positiveInt(body.quantity);
      if (!listingId) return jsonResponse({ error: "listingId is required" }, 400);
      if (!quantity) return jsonResponse({ error: "Choose how many fractions to buy" }, 400);

      const { data: listing } = await supabase
        .from("fraction_listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();

      if (!listing) return jsonResponse({ error: "Listing not found" }, 404);
      if (listing.status !== "active") {
        return jsonResponse({ error: "That listing is no longer available" }, 400);
      }

      const chainId = Number(listing.chain_id) || 8453;
      if (!CHAINS[chainId]) return jsonResponse({ error: "Unsupported chain" }, 400);

      const seller = String(listing.seller_address).toLowerCase();
      if (seller === wallet) {
        return jsonResponse({ error: "You can't buy your own listing" }, 400);
      }

      const available = Number(listing.quantity) - Number(listing.filled_quantity);
      if (quantity > available) {
        return jsonResponse({ error: `Only ${available} fractions left in this listing` }, 400);
      }

      // Re-read the seller's balance at quote time, not just at list time. A
      // seller can move their fractions after listing, and the buyer should
      // find that out before paying rather than after.
      const sellerBalance = await fractionBalance(chainId, seller, listing.token_id);
      if (sellerBalance !== null && sellerBalance < quantity) {
        // Refuse the quote, but do not cancel the listing: a balance read can
        // be wrong (a pending transfer, a lagging node), and closing someone
        // else's listing off one RPC answer is not a call this endpoint gets
        // to make. The buyer is told, and the seller's own balance check on
        // their next action is what actually retires it.
        return jsonResponse({
          error: `The seller only holds ${sellerBalance} fraction${sellerBalance === 1 ? "" : "s"} right now — try a smaller amount or another listing`,
          sellerBalance,
          sellerShort: true,
        }, 409);
      }

      const price = Number(listing.price_per_fraction);
      const dhbAmount = quantity * price;
      if (!Number.isFinite(dhbAmount) || dhbAmount <= 0) {
        return jsonResponse({ error: "This listing has no valid price" }, 409);
      }

      return jsonResponse({
        listingId,
        tokenId: listing.token_id,
        chainId,
        quantity,
        available,
        pricePerFraction: price,
        dhbAmount,
        sellerAddress: seller,
        sellerBalance,
        tokenAddress: CHAINS[chainId].dhb,
        collectionAddress: CHAINS[chainId].collection,
        settleWindowHours: SETTLE_WINDOW_HOURS,
        // The client disables Buy on this rather than letting the wallet
        // discover the revert. Recomputed per quote, so it clears itself the
        // moment the token is unpaused.
        paymentsFrozen: await isDhbPaused(chainId),
      });
    }

    // ── Confirm: buyer has paid, seller now owes fractions ────────────────
    if (action === "confirm") {
      const listingId = String(body.listingId || "");
      const quantity = positiveInt(body.quantity);
      const txHash = String(body.txHash || "").toLowerCase();

      if (!listingId || !quantity) {
        return jsonResponse({ error: "listingId and quantity are required" }, 400);
      }
      if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
        return jsonResponse({ error: "A valid txHash is required" }, 400);
      }

      // Cheap replay check before touching an RPC. The unique index on
      // lower(tx_hash) is the real guarantee; this just gives a clean message.
      const { data: seen } = await supabase
        .from("fraction_trades")
        .select("id")
        .ilike("tx_hash", txHash)
        .maybeSingle();
      if (seen) {
        return jsonResponse({ error: "That payment has already been used for a trade" }, 409);
      }

      const { data: listing } = await supabase
        .from("fraction_listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (!listing) return jsonResponse({ error: "Listing not found" }, 404);

      const chainId = Number(listing.chain_id) || 8453;
      if (!CHAINS[chainId]) return jsonResponse({ error: "Unsupported chain" }, 400);
      const seller = String(listing.seller_address).toLowerCase();
      if (seller === wallet) return jsonResponse({ error: "You can't buy your own listing" }, 400);

      const check = await loadReceipt(chainId, txHash, wallet);
      if (!check.ok) {
        return jsonResponse(
          { error: check.error, retryable: check.retryable },
          check.status,
        );
      }

      const expected = quantity * Number(listing.price_per_fraction);
      const minUnits = dhbToUnits(expected * UNDERPAY_TOLERANCE);
      const paidUnits = dhbPaid(check.receipt, chainId, wallet, seller);

      if (paidUnits === 0n) {
        return jsonResponse(
          { error: "No DHB payment to the seller was found in that transaction" },
          400,
        );
      }
      if (paidUnits < minUnits) {
        return jsonResponse({
          error: `Underpaid: sent ${unitsToDhb(paidUnits)} DHB, expected ${expected} DHB`,
        }, 400);
      }

      // Quantity comes off the listing atomically. Two buyers racing on the
      // last fractions cannot both be told they got them — the loser is
      // refused here, before a row exists, with their payment untouched and
      // refundable by the seller.
      const { error: reserveErr } = await supabase.rpc("reserve_fraction_listing", {
        p_listing_id: listingId,
        p_quantity: quantity,
      });
      if (reserveErr) {
        return jsonResponse({
          error: "Those fractions sold while your payment was confirming — contact the seller for a refund",
          txHash,
        }, 409);
      }

      const settleBy = new Date(Date.now() + SETTLE_WINDOW_HOURS * 3600_000).toISOString();
      const { data: trade, error: tradeErr } = await supabase
        .from("fraction_trades")
        .insert({
          token_id: listing.token_id,
          chain_id: chainId,
          seller_address: seller,
          buyer_address: wallet,
          quantity,
          price_per_fraction: Number(listing.price_per_fraction),
          total_dhb: unitsToDhb(paidUnits),
          tx_hash: txHash,
          listing_id: listingId,
          status: "awaiting_delivery",
          paid_at: new Date().toISOString(),
          verified_at: new Date().toISOString(),
          settle_by: settleBy,
        })
        .select()
        .single();

      if (tradeErr) {
        // Put the quantity back rather than leaving it reserved against a
        // trade that does not exist — otherwise a failed insert quietly burns
        // the seller's inventory.
        await supabase.rpc("release_fraction_listing", {
          p_listing_id: listingId,
          p_quantity: quantity,
        });
        if (String(tradeErr.code) === "23505") {
          return jsonResponse({ error: "That payment has already been used for a trade" }, 409);
        }
        throw tradeErr;
      }

      return jsonResponse({ success: true, trade });
    }

    // ── Deliver: seller sends the fractions they owe ──────────────────────
    if (action === "deliver") {
      const tradeId = String(body.tradeId || "");
      const txHash = String(body.txHash || "").toLowerCase();
      if (!tradeId) return jsonResponse({ error: "tradeId is required" }, 400);
      if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
        return jsonResponse({ error: "A valid txHash is required" }, 400);
      }

      const { data: trade } = await supabase
        .from("fraction_trades")
        .select("*")
        .eq("id", tradeId)
        .maybeSingle();
      if (!trade) return jsonResponse({ error: "Trade not found" }, 404);
      if (String(trade.seller_address).toLowerCase() !== wallet) {
        return jsonResponse({ error: "That trade is not yours to settle" }, 403);
      }
      if (trade.status === "settled") {
        return jsonResponse({ success: true, trade, alreadySettled: true });
      }
      // A missed deadline does not close the obligation — `settle_by` passing
      // only changes how the trade is counted in fraction_seller_stats. Late is
      // still worth accepting; the alternative is a buyer who paid and can now
      // never be delivered to.
      if (trade.status !== "awaiting_delivery") {
        return jsonResponse({ error: "That trade is not waiting on a delivery" }, 400);
      }

      const chainId = Number(trade.chain_id) || 8453;
      const buyer = String(trade.buyer_address).toLowerCase();
      const check = await loadReceipt(chainId, txHash, wallet);
      if (!check.ok) {
        return jsonResponse({ error: check.error, retryable: check.retryable }, check.status);
      }

      const moved = fractionsDelivered(check.receipt, chainId, wallet, buyer, trade.token_id);
      if (moved < BigInt(trade.quantity)) {
        return jsonResponse({
          error: moved === 0n
            ? "That transaction didn't transfer any fractions of this post to the buyer"
            : `That transaction only transferred ${moved} of ${trade.quantity} fractions`,
        }, 400);
      }

      const { data: settled, error: settleErr } = await supabase
        .from("fraction_trades")
        .update({
          status: "settled",
          delivery_tx_hash: txHash,
          delivered_at: new Date().toISOString(),
          settled_at: new Date().toISOString(),
        })
        .eq("id", tradeId)
        .select()
        .single();
      if (settleErr) {
        if (String(settleErr.code) === "23505") {
          return jsonResponse({ error: "That transfer has already settled another trade" }, 409);
        }
        throw settleErr;
      }

      return jsonResponse({ success: true, trade: settled });
    }

    // ── Accept an offer: seller delivers first, buyer then owes DHB ───────
    // The mirror image of a listing sale. An offer is an unfunded bid, so the
    // seller is the one who moves first — which is exactly why the delivery is
    // verified before the offer is marked accepted. Previously this was three
    // unauthenticated client writes that any caller could make for anyone.
    if (action === "accept-offer") {
      const offerId = String(body.offerId || "");
      const txHash = String(body.txHash || "").toLowerCase();
      if (!offerId) return jsonResponse({ error: "offerId is required" }, 400);
      if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
        return jsonResponse({ error: "A valid txHash is required" }, 400);
      }

      const { data: offer } = await supabase
        .from("fraction_offers")
        .select("*")
        .eq("id", offerId)
        .maybeSingle();
      if (!offer) return jsonResponse({ error: "Offer not found" }, 404);
      if (offer.status !== "pending") {
        return jsonResponse({ error: "That offer is no longer open" }, 400);
      }
      const buyer = String(offer.buyer_address).toLowerCase();
      if (buyer === wallet) return jsonResponse({ error: "You can't accept your own offer" }, 400);
      if (offer.target_seller && String(offer.target_seller).toLowerCase() !== wallet) {
        return jsonResponse({ error: "That offer was made to a specific holder" }, 403);
      }

      const chainId = Number(offer.chain_id) || 8453;
      const check = await loadReceipt(chainId, txHash, wallet);
      if (!check.ok) {
        return jsonResponse({ error: check.error, retryable: check.retryable }, check.status);
      }

      const moved = fractionsDelivered(check.receipt, chainId, wallet, buyer, offer.token_id);
      if (moved < BigInt(offer.quantity)) {
        return jsonResponse({
          error: moved === 0n
            ? "That transaction didn't transfer any fractions of this post to the buyer"
            : `That transaction only transferred ${moved} of ${offer.quantity} fractions`,
        }, 400);
      }

      const settleBy = new Date(Date.now() + SETTLE_WINDOW_HOURS * 3600_000).toISOString();
      const { data: trade, error: tradeErr } = await supabase
        .from("fraction_trades")
        .insert({
          token_id: offer.token_id,
          chain_id: chainId,
          seller_address: wallet,
          buyer_address: buyer,
          quantity: Number(offer.quantity),
          price_per_fraction: Number(offer.price_per_fraction),
          total_dhb: Number(offer.quantity) * Number(offer.price_per_fraction),
          offer_id: offerId,
          status: "awaiting_payment",
          delivery_tx_hash: txHash,
          delivered_at: new Date().toISOString(),
          verified_at: new Date().toISOString(),
          settle_by: settleBy,
        })
        .select()
        .single();
      if (tradeErr) {
        if (String(tradeErr.code) === "23505") {
          return jsonResponse({ error: "That transfer has already settled another trade" }, 409);
        }
        throw tradeErr;
      }

      await supabase
        .from("fraction_offers")
        .update({ status: "accepted", tx_hash: txHash })
        .eq("id", offerId);

      return jsonResponse({ success: true, trade });
    }

    // ── Reject an offer ──────────────────────────────────────────────────
    if (action === "reject-offer") {
      const offerId = String(body.offerId || "");
      if (!offerId) return jsonResponse({ error: "offerId is required" }, 400);

      const { data: offer } = await supabase
        .from("fraction_offers")
        .select("*")
        .eq("id", offerId)
        .maybeSingle();
      if (!offer) return jsonResponse({ error: "Offer not found" }, 404);
      if (offer.status !== "pending") {
        return jsonResponse({ error: "That offer is no longer open" }, 400);
      }
      if (offer.target_seller && String(offer.target_seller).toLowerCase() !== wallet) {
        return jsonResponse({ error: "That offer was made to a specific holder" }, 403);
      }
      // An untargeted offer is open to any holder, so rejecting it has to mean
      // something: only someone who actually holds fractions of the post can
      // take it off the board.
      if (!offer.target_seller) {
        const balance = await fractionBalance(
          Number(offer.chain_id) || 8453,
          wallet,
          offer.token_id,
        );
        if (!balance) {
          return jsonResponse({ error: "Only a holder can reject an open offer" }, 403);
        }
      }

      await supabase.from("fraction_offers").update({ status: "rejected" }).eq("id", offerId);
      return jsonResponse({ success: true });
    }

    // ── Pay an accepted offer: buyer closes the second leg ────────────────
    if (action === "pay-trade") {
      const tradeId = String(body.tradeId || "");
      const txHash = String(body.txHash || "").toLowerCase();
      if (!tradeId) return jsonResponse({ error: "tradeId is required" }, 400);
      if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
        return jsonResponse({ error: "A valid txHash is required" }, 400);
      }

      const { data: trade } = await supabase
        .from("fraction_trades")
        .select("*")
        .eq("id", tradeId)
        .maybeSingle();
      if (!trade) return jsonResponse({ error: "Trade not found" }, 404);
      if (String(trade.buyer_address).toLowerCase() !== wallet) {
        return jsonResponse({ error: "That trade is not yours to settle" }, 403);
      }
      if (trade.status === "settled") {
        return jsonResponse({ success: true, trade, alreadySettled: true });
      }
      // Late payment is accepted for the same reason late delivery is: the
      // seller has already handed over the fractions.
      if (trade.status !== "awaiting_payment") {
        return jsonResponse({ error: "That trade is not waiting on a payment" }, 400);
      }

      const chainId = Number(trade.chain_id) || 8453;
      const seller = String(trade.seller_address).toLowerCase();
      const check = await loadReceipt(chainId, txHash, wallet);
      if (!check.ok) {
        return jsonResponse({ error: check.error, retryable: check.retryable }, check.status);
      }

      const expected = Number(trade.quantity) * Number(trade.price_per_fraction);
      const minUnits = dhbToUnits(expected * UNDERPAY_TOLERANCE);
      const paidUnits = dhbPaid(check.receipt, chainId, wallet, seller);

      if (paidUnits === 0n) {
        return jsonResponse(
          { error: "No DHB payment to the seller was found in that transaction" },
          400,
        );
      }
      if (paidUnits < minUnits) {
        return jsonResponse({
          error: `Underpaid: sent ${unitsToDhb(paidUnits)} DHB, expected ${expected} DHB`,
        }, 400);
      }

      const { data: settled, error: settleErr } = await supabase
        .from("fraction_trades")
        .update({
          status: "settled",
          tx_hash: txHash,
          paid_at: new Date().toISOString(),
          settled_at: new Date().toISOString(),
          total_dhb: unitsToDhb(paidUnits),
        })
        .eq("id", tradeId)
        .select()
        .single();
      if (settleErr) {
        if (String(settleErr.code) === "23505") {
          return jsonResponse({ error: "That payment has already settled another trade" }, 409);
        }
        throw settleErr;
      }

      return jsonResponse({ success: true, trade: settled });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[fraction-checkout] error", err);
    return jsonResponse({ error: "Something went wrong — try again" }, 500);
  }
});
