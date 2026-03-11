/**
 * Alchemy Token Discovery Edge Function
 * ======================================
 * Proxies Alchemy's alchemy_getTokenBalances and alchemy_getTokenMetadata
 * to discover all ERC20 tokens with non-zero balances for a wallet.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CHAIN_RPC: Record<number, string> = {
  8453: 'https://base-mainnet.g.alchemy.com/v2/',
  56: 'https://bnb-mainnet.g.alchemy.com/v2/',
  1: 'https://eth-mainnet.g.alchemy.com/v2/',
};

interface TokenBalance {
  contractAddress: string;
  tokenBalance: string;
}

interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  logo: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ALCHEMY_API_KEY = Deno.env.get('ALCHEMY_API_KEY');
    if (!ALCHEMY_API_KEY) {
      throw new Error('ALCHEMY_API_KEY not configured');
    }

    const { walletAddress, chainId = 8453 } = await req.json();
    if (!walletAddress) {
      return new Response(JSON.stringify({ error: 'walletAddress required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = CHAIN_RPC[chainId];
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: 'Unsupported chain' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rpcUrl = `${baseUrl}${ALCHEMY_API_KEY}`;

    // Step 1: Get all token balances
    const balancesRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenBalances',
        params: [walletAddress, 'erc20'],
      }),
    });
    const balancesJson = await balancesRes.json();
    const tokenBalances: TokenBalance[] = (balancesJson.result?.tokenBalances || [])
      .filter((t: TokenBalance) => t.tokenBalance !== '0x' && t.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000');

    if (tokenBalances.length === 0) {
      return new Response(JSON.stringify({ tokens: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Batch fetch metadata (limit to 50 tokens to avoid timeouts)
    const limited = tokenBalances.slice(0, 50);
    const metadataPromises = limited.map(async (tb) => {
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getTokenMetadata',
            params: [tb.contractAddress],
          }),
        });
        const json = await res.json();
        const meta: TokenMetadata = json.result || {};
        return {
          address: tb.contractAddress,
          balance: tb.tokenBalance,
          symbol: meta.symbol || 'UNKNOWN',
          name: meta.name || 'Unknown Token',
          decimals: meta.decimals ?? 18,
          logo: meta.logo || null,
        };
      } catch {
        return null;
      }
    });

    const results = (await Promise.all(metadataPromises)).filter(Boolean);

    return new Response(JSON.stringify({ tokens: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
