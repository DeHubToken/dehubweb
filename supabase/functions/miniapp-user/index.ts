/**
 * miniapp-user
 * ============
 * What a signed-in person does WITH a mini app, on the host's behalf.
 * Every call carries x-dehub-token; the host makes it, never the app.
 *
 *   POST { action: 'add', slug }          add the app and allow its notifications
 *   POST { action: 'remove', slug }       remove it and stop its notifications
 *   POST { action: 'open', slug }         count today's open for the ranking
 *   POST { action: 'payment', slug, txHash, chainId, amount, memo? }
 *        record a DHB payment the host just sent to the app's owner wallet,
 *        after checking the transfer on chain, and answer with a signed
 *        receipt the app's server verifies against the same JWKS as sign-in.
 *
 * add/remove also POST a signed event to the app's webhookUrl
 * ({ event, token }), fire-and-forget: an app that is down must not stop a
 * person adding or removing it.
 *
 * Payments go straight to the developer's wallet — DeHub holds nothing and
 * pays nothing out. The fee in the plan (0% on an app's first $10k a year)
 * means no split is taken yet.
 */
import { handleCorsPreflight } from "../_shared/cors.ts";
import { checkRateLimit, jsonResponse, requireDeHubAuth, serviceClient } from "../_shared/auth.ts";
import { signMiniAppToken } from "../_shared/miniapp-jwt.ts";

const CHAINS: Record<number, { rpc: string; dhb: string }> = {
  8453: { rpc: "https://mainnet.base.org", dhb: "0xd20ab1015f6a2de4a6fddebab270113f689c2f7c" },
  56: { rpc: "https://bsc-dataseed.binance.org", dhb: "0x680d3113caf77b61b510f332d5ef4cf5b41a761d" },
};
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_PAYMENT_DHB = 1_000_000;

type Db = ReturnType<typeof serviceClient>;

interface AppRow {
  id: string;
  slug: string;
  domain: string;
  name: string;
  owner_wallet: string | null;
  status: string;
  manifest: { webhookUrl?: string } | null;
}

async function appBySlug(db: Db, slug: unknown): Promise<AppRow | null> {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return null;
  const { data } = await db
    .from("miniapp_apps")
    .select("id, slug, domain, name, owner_wallet, status, manifest")
    .eq("slug", slug)
    .maybeSingle();
  return data && data.status === "live" ? (data as AppRow) : null;
}

function isPublicHttps(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const h = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Tell the app, without waiting on it. */
async function notifyWebhook(app: AppRow, wallet: string, event: string, extra: Record<string, unknown> = {}) {
  const url = isPublicHttps(app.manifest?.webhookUrl);
  if (!url) return;
  const token = await signMiniAppToken({ sub: wallet, aud: app.domain, typ: "event", event, ...extra }, 3600);
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "dehub-miniapp-webhook/1" },
    body: JSON.stringify({ event, token }),
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

async function rpc<T>(chainId: number, method: string, params: unknown[]): Promise<T | null> {
  const res = await fetch(CHAINS[chainId].rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = await res.json().catch(() => null);
  return (body?.result as T) ?? null;
}

interface Receipt {
  status: string;
  logs: { address: string; topics: string[]; data: string }[];
}

/** The DHB paid to `to` by this transaction, and who sent it, or null. */
async function dhbTransferTo(chainId: number, txHash: string, to: string): Promise<{ amount: number; from: string } | null> {
  let receipt: Receipt | null = null;
  // A just-mined transaction can take a few seconds to reach a public RPC.
  for (let i = 0; i < 6 && !receipt; i++) {
    receipt = await rpc<Receipt>(chainId, "eth_getTransactionReceipt", [txHash]);
    if (!receipt) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!receipt || receipt.status !== "0x1") return null;
  const target = `0x${to.slice(2).toLowerCase().padStart(64, "0")}`;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CHAINS[chainId].dhb) continue;
    if (log.topics[0] !== TRANSFER_TOPIC || log.topics[2]?.toLowerCase() !== target) continue;
    const wei = BigInt(log.data);
    return { amount: Number(wei / 10n ** 12n) / 1e6, from: `0x${log.topics[1].slice(26)}`.toLowerCase() };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const db = serviceClient();
  const rl = await checkRateLimit(db, auth.wallet, "miniapp-user", { limit: 120, windowMs: 3600_000 });
  if (!rl.allowed) return jsonResponse({ error: "Too many requests. Try again shortly." }, 429);

  try {
    const body = await req.json().catch(() => ({}));
    const app = await appBySlug(db, body?.slug);
    if (!app) return jsonResponse({ error: "No such app." }, 404);

    if (body.action === "add") {
      const { error } = await db
        .from("miniapp_installs")
        .upsert({ wallet: auth.wallet, app_id: app.id, notifications_on: true }, { onConflict: "wallet,app_id" });
      if (error) throw error;
      await notifyWebhook(app, auth.wallet, "app_added");
      return jsonResponse({ added: true, notificationsEnabled: true });
    }

    // One row per person per app per day: what the nightly ranking counts.
    // Signed-in people only, so the store ranks on accounts, not page loads.
    if (body.action === "open") {
      await db.from("miniapp_opens").upsert({ app_id: app.id, wallet: auth.wallet }, { onConflict: "app_id,wallet,day", ignoreDuplicates: true });
      return jsonResponse({ ok: true });
    }

    if (body.action === "remove") {
      await db.from("miniapp_installs").delete().eq("wallet", auth.wallet).eq("app_id", app.id);
      await notifyWebhook(app, auth.wallet, "app_removed");
      return jsonResponse({ removed: true });
    }

    if (body.action === "payment") {
      const chainId = Number(body.chainId);
      const txHash = typeof body.txHash === "string" ? body.txHash.toLowerCase() : "";
      const amount = Number(body.amount);
      const memo = typeof body.memo === "string" ? body.memo.slice(0, 140) : null;
      if (!CHAINS[chainId] || !/^0x[0-9a-f]{64}$/.test(txHash)) return jsonResponse({ error: "Bad payment reference." }, 400);
      if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYMENT_DHB) return jsonResponse({ error: "Bad amount." }, 400);
      if (!app.owner_wallet) return jsonResponse({ error: "This app has no verified owner to pay." }, 409);

      const { data: seen } = await db.from("miniapp_payments").select("id").eq("tx_hash", txHash).maybeSingle();
      if (seen) return jsonResponse({ error: "That payment is already recorded." }, 409);

      const transfer = await dhbTransferTo(chainId, txHash, app.owner_wallet);
      // Allow for the rounding payDhb applies (it sends whole DHB, rounded up).
      if (!transfer || transfer.amount + 1e-6 < amount) {
        return jsonResponse({ error: "No matching DHB transfer to this app was found on chain." }, 422);
      }
      const { error } = await db.from("miniapp_payments").insert({
        app_id: app.id,
        payer_wallet: auth.wallet,
        payer_account: transfer.from,
        recipient: app.owner_wallet,
        amount_dhb: transfer.amount,
        chain_id: chainId,
        tx_hash: txHash,
        memo,
      });
      if (error) {
        if (String(error.code) === "23505") return jsonResponse({ error: "That payment is already recorded." }, 409);
        throw error;
      }
      const receipt = await signMiniAppToken(
        { sub: auth.wallet, aud: app.domain, typ: "payment", amount: transfer.amount, token: "DHB", chainId, txHash, memo },
        30 * 24 * 3600,
      );
      return jsonResponse({ txHash, chainId, amount: transfer.amount, receipt });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("[miniapp-user]", error);
    return jsonResponse({ error: "The request failed. Try again." }, 500);
  }
});
