/**
 * ads-topup
 * =========
 * Credits an advertiser account after an on-chain DHB payment to the DeHub
 * treasury. The client sends the tx hash; we independently verify the
 * transfer via Alchemy asset-transfer enumeration (same pattern as
 * sync-staking-deposits): from = claimed wallet, to = treasury, token = DHB,
 * on Base or BNB. USD value locked at the live DHB price. Idempotent per tx
 * hash (ads_topup_credit raises TX_ALREADY_CREDITED on replays).
 *
 * Forgery note: crediting is intrinsically safe — credit always goes to the
 * account of the wallet that SENT the on-chain transfer, so submitting
 * someone else's tx hash only credits them, not you.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adsCorsHeaders, jsonResponse } from '../_shared/povr.ts';

const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const DHB_BNB = '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D';
// Same treasury the AI credits + PPV paywalls pay into. Override via secret.
const TREASURY = (Deno.env.get('ADS_TREASURY_ADDRESS') || '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c').toLowerCase();

interface AlchemyTransfer {
  hash: string;
  value: number;
  metadata?: { blockTimestamp?: string };
}

async function fetchTransfers(rpcUrl: string, fromAddress: string, contractAddress: string): Promise<AlchemyTransfer[]> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getAssetTransfers',
      params: [{
        fromBlock: '0x0',
        toBlock: 'latest',
        fromAddress,
        toAddress: TREASURY,
        contractAddresses: [contractAddress],
        category: ['erc20'],
      }],
    }),
  });
  const json = await res.json();
  return json?.result?.transfers ?? [];
}

async function getDhbPriceUsd(): Promise<number | null> {
  // DexScreener first (same source as get-dhb-price), CoinGecko fallback.
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${DHB_BASE}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.pairs?.[0]?.priceUsd);
      if (Number.isFinite(price) && price > 0) return price;
    }
  } catch { /* fall through */ }
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=dehub&vs_currencies=usd', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const price = Number(data?.dehub?.usd);
      if (Number.isFinite(price) && price > 0) return price;
    }
  } catch { /* fall through */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adsCorsHeaders });

  try {
    const { txHash } = await req.json();
    const wallet = (req.headers.get('x-wallet-address') || '').toLowerCase();

    if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
      return jsonResponse({ error: 'wallet address required' }, 400);
    }
    if (!txHash || typeof txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return jsonResponse({ error: 'valid txHash required' }, 400);
    }

    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
    if (!alchemyKey) return jsonResponse({ error: 'Alchemy not configured' }, 500);

    const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    const bnbRpc = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    // Find the claimed tx among this wallet's DHB transfers to the treasury.
    const [baseTransfers, bnbTransfers] = await Promise.all([
      fetchTransfers(baseRpc, wallet, DHB_BASE),
      fetchTransfers(bnbRpc, wallet, DHB_BNB),
    ]);

    const wanted = txHash.toLowerCase();
    let match: AlchemyTransfer | undefined;
    let chain: 'Base' | 'BNB' | undefined;
    match = baseTransfers.find((t) => t.hash.toLowerCase() === wanted);
    if (match) chain = 'Base';
    if (!match) {
      match = bnbTransfers.find((t) => t.hash.toLowerCase() === wanted);
      if (match) chain = 'BNB';
    }

    if (!match || !chain) {
      return jsonResponse({ error: 'Transfer not found on-chain (from your wallet to the ads treasury). If you just sent it, wait a few seconds and retry.' }, 404);
    }

    const dhbAmount = Number(match.value);
    if (!Number.isFinite(dhbAmount) || dhbAmount <= 0) {
      return jsonResponse({ error: 'Invalid transfer amount' }, 400);
    }

    const price = await getDhbPriceUsd();
    if (!price) return jsonResponse({ error: 'DHB price unavailable, try again shortly' }, 503);

    const usdValue = Math.round(dhbAmount * price * 1e6) / 1e6;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Minimum top-up guard (config-driven).
    const { data: cfg } = await supabase.from('ad_config').select('value').eq('key', 'min_topup_usd').maybeSingle();
    const minTopup = Number(cfg?.value ?? 25);
    if (usdValue < minTopup) {
      return jsonResponse({ error: `Minimum top-up is $${minTopup} (this transfer is worth ~$${usdValue.toFixed(2)})` }, 400);
    }

    const { data: newBalance, error } = await supabase.rpc('ads_topup_credit', {
      p_wallet: wallet,
      p_tx_hash: match.hash,
      p_chain: chain,
      p_dhb: dhbAmount,
      p_price: price,
      p_usd: usdValue,
    });

    if (error) {
      if (String(error.message || '').includes('TX_ALREADY_CREDITED')) {
        return jsonResponse({ error: 'This transaction was already credited' }, 409);
      }
      throw error;
    }

    console.log(`[ads-topup] ${wallet} +$${usdValue} (${dhbAmount} DHB @ $${price}, ${chain}, ${match.hash})`);
    return jsonResponse({
      ok: true,
      chain,
      dhbAmount,
      dhbPriceUsd: price,
      usdCredited: usdValue,
      balanceUsd: Number(newBalance),
    });
  } catch (err) {
    console.error('[ads-topup] error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'topup failed' }, 500);
  }
});
