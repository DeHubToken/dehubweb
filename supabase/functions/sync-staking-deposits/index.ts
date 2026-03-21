import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Staking addresses and DHB token contracts
const BASE_STAKING = "0xcF573a682Bf7A7Cc58000e9eCA9c9d04dA102Da7".toLowerCase();
const BNB_STAKING = "0x26d2cd7763106fdce443fadd36163e2ad33a76e6".toLowerCase();
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7";

interface AlchemyTransfer {
  hash: string;
  value: number;
  blockNum: string;
  metadata: { blockTimestamp: string };
}

async function fetchAlchemyTransfers(
  rpcUrl: string,
  fromAddress: string,
  contractAddress: string,
  stakingAddress: string,
): Promise<AlchemyTransfer[]> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [{
        fromBlock: "0x0",
        toBlock: "latest",
        fromAddress,
        toAddress: stakingAddress,
        contractAddresses: [contractAddress],
        category: ["erc20"],
      }],
    }),
  });
  const json = await res.json();
  return json?.result?.transfers ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallet } = await req.json();
    if (!wallet || typeof wallet !== "string") {
      return new Response(
        JSON.stringify({ error: "wallet address required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    const walletLower = wallet.toLowerCase();
    const alchemyKey = Deno.env.get("ALCHEMY_API_KEY");
    if (!alchemyKey) {
      return new Response(
        JSON.stringify({ error: "Alchemy not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    const bnbRpc = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    // Fetch on-chain transfers to staking address on both chains
    const [baseTransfers, bnbTransfers] = await Promise.all([
      fetchAlchemyTransfers(baseRpc, walletLower, DHB_BASE),
      fetchAlchemyTransfers(bnbRpc, walletLower, DHB_BNB),
    ]);

    console.log(`[sync-staking] ${walletLower}: ${baseTransfers.length} Base + ${bnbTransfers.length} BNB transfers to staking`);

    // Fetch existing DB records for this wallet
    const { data: existingRecords } = await supabase
      .from("staking_records")
      .select("tx_hash")
      .eq("wallet_address", walletLower)
      .eq("action", "stake");

    const existingHashes = new Set(
      (existingRecords ?? []).map((r: any) => r.tx_hash.toLowerCase()),
    );

    // Build insert list for missing transfers
    const toInsert: Array<{
      wallet_address: string;
      amount: number;
      chain: string;
      action: string;
      tx_hash: string;
      created_at: string;
    }> = [];

    for (const tx of baseTransfers) {
      if (!existingHashes.has(tx.hash.toLowerCase())) {
        toInsert.push({
          wallet_address: walletLower,
          amount: tx.value,
          chain: "Base",
          action: "stake",
          tx_hash: tx.hash,
          created_at: tx.metadata?.blockTimestamp || new Date().toISOString(),
        });
      }
    }

    for (const tx of bnbTransfers) {
      if (!existingHashes.has(tx.hash.toLowerCase())) {
        toInsert.push({
          wallet_address: walletLower,
          amount: tx.value,
          chain: "BNB",
          action: "stake",
          tx_hash: tx.hash,
          created_at: tx.metadata?.blockTimestamp || new Date().toISOString(),
        });
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("staking_records").insert(toInsert);
      if (error) {
        console.error("[sync-staking] Insert error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to insert records" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
        );
      }
      console.log(`[sync-staking] Inserted ${toInsert.length} new staking records for ${walletLower}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        found: baseTransfers.length + bnbTransfers.length,
        newRecords: toInsert.length,
        total: (existingRecords?.length ?? 0) + toInsert.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    console.error("[sync-staking] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
