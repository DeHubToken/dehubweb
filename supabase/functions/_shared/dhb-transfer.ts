// Verify that a wallet actually sent DHB to the treasury.
//
// DHB is the token everything in the app is paid with — tips, PPV unlocks,
// event gates, products. Those all settle the same way: the wallet signs a
// transfer, and the backend confirms it happened by looking at the chain
// rather than believing the client. This is that check, factored out so the
// stage-dubbing bill can use it too.
//
// Lifted from the top-up path in `ai-credits`, including the two things there
// that are load-bearing rather than tidy: `withMetadata` (without it the
// freshness check has nothing to read and waves everything through) and the
// claim window (the treasury has years of unrelated DHB arriving in it, and
// without a window any historical transfer could be replayed as payment).

const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const DHB_BNB = '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D';

export const DHB_TREASURY = (Deno.env.get('AI_TREASURY_ADDRESS')
  || '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c').toLowerCase();

/**
 * How recent a transfer must be to pay for something.
 *
 * An hour is far longer than the flow needs — sign, index, confirm — and short
 * enough that nothing already spent is still in range.
 */
const CLAIM_WINDOW_MS = 60 * 60 * 1000;

interface AlchemyTransfer {
  hash: string;
  value: number;
  metadata?: { blockTimestamp?: string };
}

async function fetchTransfers(
  rpcUrl: string,
  fromAddress: string,
  contractAddress: string,
): Promise<AlchemyTransfer[]> {
  try {
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
          toAddress: DHB_TREASURY,
          contractAddresses: [contractAddress],
          category: ['erc20'],
          withMetadata: true,
          order: 'desc',
        }],
      }),
    });
    const json = await res.json();
    return json?.result?.transfers ?? [];
  } catch {
    return [];
  }
}

export type DhbPaymentResult =
  | { ok: true; chain: 'Base' | 'BNB'; dhb: number; hash: string }
  | { ok: false; reason: string };

/**
 * Confirm `txHash` is a DHB transfer from `wallet` to the treasury worth at
 * least `minimumDhb`, mined within the claim window.
 *
 * Fails closed on every path. A caller that cannot tell whether it was paid
 * must behave as if it was not.
 */
export async function verifyDhbPayment(
  txHash: string,
  wallet: string,
  minimumDhb: number,
): Promise<DhbPaymentResult> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return { ok: false, reason: 'A valid transaction hash is required.' };

  const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
  if (!alchemyKey) return { ok: false, reason: 'Payment verification is not configured.' };

  const [base, bnb] = await Promise.all([
    fetchTransfers(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`, wallet, DHB_BASE),
    fetchTransfers(`https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`, wallet, DHB_BNB),
  ]);

  const wanted = txHash.toLowerCase();
  let match = base.find((t) => t.hash.toLowerCase() === wanted);
  let chain: 'Base' | 'BNB' | undefined = match ? 'Base' : undefined;
  if (!match) {
    match = bnb.find((t) => t.hash.toLowerCase() === wanted);
    if (match) chain = 'BNB';
  }
  if (!match || !chain) {
    return { ok: false, reason: 'That transfer is not on chain yet. If you just sent it, wait a moment and retry.' };
  }

  const dhb = Number(match.value);
  if (!Number.isFinite(dhb) || dhb <= 0) return { ok: false, reason: 'That transfer had no value.' };
  if (dhb + 0.5 < minimumDhb) {
    return { ok: false, reason: `That transfer was ${Math.floor(dhb)} DHB but ${minimumDhb} was due.` };
  }

  // A missing timestamp is treated as unclaimable rather than fresh, so a
  // provider that stops returning metadata fails closed.
  const minedAt = match.metadata?.blockTimestamp ? Date.parse(match.metadata.blockTimestamp) : NaN;
  if (!Number.isFinite(minedAt)) return { ok: false, reason: 'Could not establish when that transfer was mined.' };
  if (Date.now() - minedAt > CLAIM_WINDOW_MS) {
    return { ok: false, reason: 'That transfer is too old to use. Send a new one.' };
  }

  return { ok: true, chain, dhb, hash: match.hash };
}
