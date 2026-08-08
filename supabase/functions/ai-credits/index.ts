/**
 * ai-credits
 * ==========
 * The one endpoint the client talks to about AI credit. Four actions:
 *
 *   balance     what this wallet has
 *   quote       what a job would cost, priced here rather than on the client
 *   topup       credit an on-chain DHB transfer to the treasury
 *   claim-free  the one-off starter allowance
 *
 * Top-up needs no price lookup. Credit is denominated in DHB and the gateway
 * sells DHB at a fixed $0.001, so a transfer of N DHB credits exactly N DHB —
 * which is the whole point of pegging. ads-topup still carries a DexScreener
 * call for the same job because it stores USD; this one does not need it.
 *
 * Forgery note, inherited from ads-topup: credit always goes to the wallet that
 * SENT the transfer, so replaying someone else's tx hash only credits them.
 */

import {
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from '../_shared/auth.ts';
import { DHB_USD_PEG, dhbToUsd, quotePriceDhb, type JobKind } from '../_shared/ai-pricing.ts';
import { FREE_GRANT_DHB } from '../_shared/ai-plans.ts';

const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const DHB_BNB = '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D';
const TREASURY = (Deno.env.get('AI_TREASURY_ADDRESS')
  || '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c').toLowerCase();

interface AlchemyTransfer {
  hash: string;
  value: number;
}

async function fetchTransfers(
  rpcUrl: string,
  fromAddress: string,
  contractAddress: string,
): Promise<AlchemyTransfer[]> {
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

async function readBalance(wallet: string): Promise<number> {
  const { data } = await serviceClient()
    .from('ai_credits')
    .select('balance_dhb')
    .eq('wallet_address', wallet)
    .maybeSingle();
  return Number(data?.balance_dhb ?? 0);
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? 'balance');

    // Quoting is the only action that does not need a wallet: the price of a
    // model is not private, and the paywall shows it before sign-in.
    if (action === 'quote') {
      const priceDhb = quotePriceDhb(
        String(body?.kind ?? '') as JobKind,
        String(body?.modelId ?? ''),
        {
          durationSeconds: body?.durationSeconds,
          quality: body?.quality,
          quantity: body?.quantity,
        },
      );
      if (priceDhb === null) {
        return jsonResponse({ error: `Unknown model: ${body?.kind}/${body?.modelId}` }, 400);
      }
      return jsonResponse({ priceDhb, priceUsd: dhbToUsd(priceDhb), pegUsd: DHB_USD_PEG });
    }

    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    const wallet = auth.wallet;

    if (action === 'balance') {
      const balanceDhb = await readBalance(wallet);
      return jsonResponse({ balanceDhb, balanceUsd: dhbToUsd(balanceDhb), pegUsd: DHB_USD_PEG });
    }

    if (action === 'claim-free') {
      const { data, error } = await serviceClient().rpc('ai_credit_grant', {
        p_wallet: wallet,
        p_dhb: FREE_GRANT_DHB,
        p_reason: 'free_grant',
        p_ref: wallet,
        p_metadata: null,
      });
      if (error) {
        // Already claimed is the normal path on every visit after the first.
        if (String(error.message || '').includes('CREDIT_ALREADY_APPLIED')) {
          const balanceDhb = await readBalance(wallet);
          return jsonResponse({ ok: true, alreadyClaimed: true, balanceDhb });
        }
        throw error;
      }
      return jsonResponse({ ok: true, granted: FREE_GRANT_DHB, balanceDhb: Number(data) });
    }

    if (action === 'topup') {
      const txHash = String(body?.txHash ?? '');
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return jsonResponse({ error: 'valid txHash required' }, 400);
      }

      const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
      if (!alchemyKey) return jsonResponse({ error: 'Alchemy not configured' }, 500);

      const [baseTransfers, bnbTransfers] = await Promise.all([
        fetchTransfers(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`, wallet, DHB_BASE),
        fetchTransfers(`https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`, wallet, DHB_BNB),
      ]);

      const wanted = txHash.toLowerCase();
      let match = baseTransfers.find((t) => t.hash.toLowerCase() === wanted);
      let chain: 'Base' | 'BNB' | undefined = match ? 'Base' : undefined;
      if (!match) {
        match = bnbTransfers.find((t) => t.hash.toLowerCase() === wanted);
        if (match) chain = 'BNB';
      }

      if (!match || !chain) {
        return jsonResponse({
          error: 'Transfer not found on-chain (from your wallet to the AI treasury). If you just sent it, wait a few seconds and retry.',
        }, 404);
      }

      const dhbAmount = Number(match.value);
      if (!Number.isFinite(dhbAmount) || dhbAmount <= 0) {
        return jsonResponse({ error: 'Invalid transfer amount' }, 400);
      }

      const { data, error } = await serviceClient().rpc('ai_credit_grant', {
        p_wallet: wallet,
        p_dhb: dhbAmount,
        p_reason: 'topup',
        p_ref: match.hash,
        p_metadata: { chain, pegUsd: DHB_USD_PEG },
      });

      if (error) {
        if (String(error.message || '').includes('CREDIT_ALREADY_APPLIED')) {
          return jsonResponse({ error: 'This transaction was already credited' }, 409);
        }
        throw error;
      }

      console.log(`[ai-credits] topup ${wallet} +${dhbAmount} DHB (${chain}, ${match.hash})`);
      return jsonResponse({
        ok: true,
        chain,
        creditedDhb: dhbAmount,
        balanceDhb: Number(data),
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[ai-credits] error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'request failed' }, 500);
  }
});
