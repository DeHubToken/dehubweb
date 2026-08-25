/**
 * Checkout
 * ========
 * Quote + confirm for buying a store listing, on a live stream or from the
 * marketplace. The stream is the optional part: pass a `tokenId` and the
 * product must be attached to that stream and gets its live price; omit it and
 * the same path runs against the listing's own price. Nothing else differs.
 *
 * It is named live-checkout because that is where it shipped first. Both
 * surfaces route through one function on purpose — the marketplace drawer used
 * to price in the browser and write its own order row, and both halves of that
 * were wrong:
 *
 *   1. If the price feed returned 0 or failed, `priceUsd / dhbPrice` was
 *      guarded down to 0, the wallet sent ZERO DHB, and the order still landed
 *      as paid with the seller notified. A blip in one Supabase function was a
 *      free shopping spree.
 *   2. Nothing checked the chain. tx_hash, amount and seller all arrived from
 *      the client, so an order could be posted with a hash that paid someone
 *      else, paid nothing, or was already spent on a different order.
 *
 * So this inverts it. The server quotes the price, the buyer pays, and the
 * server reads the transfer back off Base before any row exists. The client
 * never computes an amount and never writes an order.
 */

import {
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from "../_shared/auth.ts";

const BASE_CHAIN_ID = 8453;
const DHB_BASE_ADDRESS = "0xd20ab1015f6a2de4a6fddebab270113f689c2f7c";
const DHB_DECIMALS = 18;

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** ERC20Pausable.paused() selector */
const PAUSED_SELECTOR = "0x5c975abb";

/**
 * Peg tolerance between quote and confirm. DHB is pegged at $0.001 by
 * get-dhb-price so this is normally exact; the slack exists so a buyer whose
 * wallet rounded down by a hair is not told their real payment was short.
 */
const UNDERPAY_TOLERANCE = 0.99;

function baseRpcUrl(): string {
  const key = Deno.env.get("ALCHEMY_API_KEY");
  return key
    ? `https://base-mainnet.g.alchemy.com/v2/${key}`
    : "https://base-rpc.publicnode.com";
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(baseRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) {
      console.error(`[live-checkout] rpc ${method} error`, json.error);
      return null;
    }
    return json.result as T;
  } catch (err) {
    console.error(`[live-checkout] rpc ${method} threw`, err);
    return null;
  }
}

/**
 * Is DHB transfer-frozen right now?
 *
 * DHB is ERC20Pausable and has been paused on Base and BSC, with no exemption
 * for any address. While it is, every transfer reverts — so quoting a price and
 * letting someone submit would spend their gas on a guaranteed failure. Read as
 * "unknown means not paused": an RPC outage should degrade to the normal flow
 * (where the wallet reports the revert) rather than take checkout down.
 */
async function isDhbPaused(): Promise<boolean> {
  const result = await rpc<string>("eth_call", [
    { to: DHB_BASE_ADDRESS, data: PAUSED_SELECTOR },
    "latest",
  ]);
  if (!result) return false;
  return BigInt(result) === 1n;
}

/**
 * Price a listing the way its surface displays it: on a stream a live override
 * beats the list price, in the marketplace there is no override to apply.
 */
async function quoteFor(
  supabase: ReturnType<typeof serviceClient>,
  tokenId: string,
  listingId: string,
) {
  const { data: listing } = await supabase
    .from("store_listings")
    .select("id, wallet_address, title, price, status, stock_quantity, is_digital")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing) return { error: "Listing not found", status: 404 } as const;
  if (listing.status !== "active") return { error: "That item is no longer for sale", status: 400 } as const;
  if (listing.stock_quantity === 0) return { error: "Sold out", status: 400 } as const;

  let priceUsd = Number(listing.price);

  // Buying "from a stream" requires the product to actually be on that stream.
  // Without this, the stream_token_id on the order would be a free-text claim
  // and live-sales attribution could be pointed at any creator's broadcast.
  // A marketplace purchase has no stream to belong to, so it skips to the list
  // price — that check is the only thing the tokenId changes.
  if (tokenId) {
    const { data: attached } = await supabase
      .from("stream_products")
      .select("live_price")
      .eq("token_id", tokenId)
      .eq("listing_id", listingId)
      .maybeSingle();

    if (!attached) return { error: "That item is not on this stream", status: 404 } as const;
    priceUsd = Number(attached.live_price ?? listing.price);
  }

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return { error: "This item has no valid price", status: 409 } as const;
  }

  // The peg, read server-side. The browser's copy of this number is display
  // only — it never reaches an amount that gets signed.
  const dhbUsd = await dhbPrice();
  if (!dhbUsd) {
    // Refusing here is the whole point: a missing price used to mean "send 0".
    return { error: "Pricing is unavailable right now — try again shortly", status: 503 } as const;
  }

  const dhbAmount = Math.ceil(priceUsd / dhbUsd);

  return {
    ok: true,
    listing,
    priceUsd,
    dhbUsd,
    dhbAmount,
    sellerAddress: String(listing.wallet_address).toLowerCase(),
  } as const;
}

/** DHB/USD from the same function the wallet and stores read. */
async function dhbPrice(): Promise<number | null> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-dhb-price`;
    const res = await fetch(url, {
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || "" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = Number(data?.prices?.DHB);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

interface TxReceipt {
  status: string;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}

/** Left-pad-stripped topic → 0x-address. */
function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const buyer = auth.wallet;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = String(body.action || "");
  // Optional. Absent means the marketplace drawer, which buys the same listing
  // through the same verification with no stream attached to it.
  const tokenId = body.tokenId == null ? "" : String(body.tokenId);
  const listingId = String(body.listingId || "");

  if (!listingId) {
    return jsonResponse({ error: "listingId is required" }, 400);
  }

  const supabase = serviceClient();

  try {
    const quote = await quoteFor(supabase, tokenId, listingId);
    if ("error" in quote) return jsonResponse({ error: quote.error }, quote.status);

    if (quote.sellerAddress === buyer) {
      return jsonResponse({ error: "You can't buy your own listing" }, 400);
    }

    // ── Quote ────────────────────────────────────────────────────────────
    if (action === "quote") {
      return jsonResponse({
        listingId,
        title: quote.listing.title,
        priceUsd: quote.priceUsd,
        dhbAmount: quote.dhbAmount,
        dhbPrice: quote.dhbUsd,
        sellerAddress: quote.sellerAddress,
        tokenAddress: DHB_BASE_ADDRESS,
        chainId: BASE_CHAIN_ID,
        isDigital: quote.listing.is_digital,
        stockRemaining: quote.listing.stock_quantity,
        // The client disables Buy on this rather than letting the wallet
        // discover the revert. Recomputed per quote, so it clears itself the
        // moment the token is unpaused — no redeploy, no flag to flip.
        paymentsFrozen: await isDhbPaused(),
      });
    }

    // ── Confirm ──────────────────────────────────────────────────────────
    if (action === "confirm") {
      const txHash = String(body.txHash || "").toLowerCase();
      if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
        return jsonResponse({ error: "A valid txHash is required" }, 400);
      }

      // Cheap replay check before touching an RPC. The unique index on
      // lower(tx_hash) is the real guarantee; this just gives a clean message.
      const { data: existing } = await supabase
        .from("store_orders")
        .select("id")
        .ilike("tx_hash", txHash)
        .maybeSingle();
      if (existing) {
        return jsonResponse({ error: "That transaction has already been used for an order" }, 409);
      }

      const receipt = await rpc<TxReceipt>("eth_getTransactionReceipt", [txHash]);
      if (!receipt) {
        // Not mined yet, or the node has not caught up. The client retries.
        return jsonResponse({ error: "Transaction not found yet", retryable: true }, 202);
      }
      if (BigInt(receipt.status) !== 1n) {
        return jsonResponse({ error: "That transaction failed on-chain" }, 400);
      }

      // Find a DHB Transfer from the buyer to the seller in this transaction.
      //
      // The payer is read off the Transfer event's `from`, never the
      // transaction's. A DeHub account is a smart wallet, so `tx.from` is the
      // bundler that relayed the userOp — asserting on it rejects every
      // sponsored payment while accepting nothing the log check does not.
      // The `topics[1] !== buyer` line below is the real payer check, and it
      // is the stronger one: it is what stops someone harvesting a stranger's
      // transfer and having the goods shipped to them.
      //
      // Reading logs rather than call data also means a transfer routed
      // through a contract still counts, and some other token never does.
      const minUnits = BigInt(
        Math.floor(quote.dhbAmount * UNDERPAY_TOLERANCE * 10 ** 6),
      ) * 10n ** BigInt(DHB_DECIMALS - 6);

      let paidUnits = 0n;
      for (const log of receipt.logs || []) {
        if (String(log.address).toLowerCase() !== DHB_BASE_ADDRESS) continue;
        if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
        if (log.topics.length < 3) continue;
        if (topicToAddress(log.topics[1]) !== buyer) continue;
        if (topicToAddress(log.topics[2]) !== quote.sellerAddress) continue;
        paidUnits += BigInt(log.data);
      }

      if (paidUnits === 0n) {
        return jsonResponse(
          { error: "No DHB payment to the seller was found in that transaction" },
          400,
        );
      }
      if (paidUnits < minUnits) {
        const paid = Number(paidUnits / 10n ** BigInt(DHB_DECIMALS - 6)) / 1e6;
        return jsonResponse(
          { error: `Underpaid: sent ${paid} DHB, expected ${quote.dhbAmount} DHB` },
          400,
        );
      }

      // Physical goods need somewhere to go. Checked here as well as in the UI
      // because the order is what the creator ships against.
      const shippingAddress = String(body.shippingAddress || "").trim();
      if (!quote.listing.is_digital && !shippingAddress) {
        return jsonResponse({ error: "A shipping address is required for this item" }, 400);
      }

      // Stock comes off atomically. Two buyers racing on the last unit both
      // paid; whoever loses this call is refunded by the creator, and the
      // order still records so there is a trail for it.
      let stockError: string | null = null;
      if (quote.listing.stock_quantity !== null) {
        const { error: stockErr } = await supabase.rpc("decrement_listing_stock", {
          p_listing_id: listingId,
        });
        if (stockErr) stockError = "Sold out before this payment landed — contact the seller for a refund";
      }

      const paidDhb = Number(paidUnits / 10n ** BigInt(DHB_DECIMALS - 6)) / 1e6;

      const { data: order, error: orderErr } = await supabase
        .from("store_orders")
        .insert({
          listing_id: listingId,
          buyer_address: buyer,
          seller_address: quote.sellerAddress,
          amount: quote.priceUsd,
          tx_hash: txHash,
          status: stockError ? "pending_verification" : "paid",
          shipping_address: shippingAddress || null,
          notes: String(body.notes || "").trim() || null,
          stream_token_id: tokenId || null,
          source: tokenId ? "live" : "store",
          verified_at: new Date().toISOString(),
          verify_error: stockError,
          paid_token_amount: paidDhb,
          paid_token_symbol: "DHB",
        })
        .select()
        .single();

      if (orderErr) {
        // The unique index is the backstop for two confirms racing on one hash.
        if (String(orderErr.code) === "23505") {
          return jsonResponse({ error: "That transaction has already been used for an order" }, 409);
        }
        throw orderErr;
      }

      return jsonResponse({ success: true, order, warning: stockError });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[live-checkout] error", err);
    return jsonResponse({ error: "Checkout failed" }, 500);
  }
});
