import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DHB_TOKEN = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const DHB_DECIMALS = 18;

// Known fiat gateway wallets to EXCLUDE
const FIAT_GATEWAY_WALLETS = new Set([
  '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c',
  '0x3a0b5fe1ce81251afaf7e457e1d1e23a4a85c67f',
  '0x1be95b03ef8f10f78e078a74b0080b7e9af4c02b',
]);

// Known Uniswap V3 pool addresses for DHB on Base
// We'll identify Uniswap buys as transfers FROM pool addresses TO user wallets
const UNISWAP_POOLS = new Set([
  // We'll dynamically detect: transfers where `from` is a contract (pool)
]);

// Date range: Dec 1 2024 to Jan 25 2025
const START_DATE = new Date('2025-12-01T00:00:00Z');
const END_DATE = new Date('2026-01-25T23:59:59Z');

interface Buy {
  buyer: string;
  amount: number;
  txHash: string;
  blockNum: string;
  timestamp?: number;
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(0);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
    if (!alchemyKey) {
      return new Response(JSON.stringify({ error: 'ALCHEMY_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const baseUrl = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    // Step 1: Get block numbers for date range
    console.log('[WinterDraw] Fetching block range for Dec 1 2024 - Jan 25 2025...');
    
    // Estimate blocks: Base has ~2s block time
    // We'll use eth_getBlockByNumber to find approximate blocks
    const currentBlockRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    });
    const currentBlockData = await currentBlockRes.json();
    const currentBlock = parseInt(currentBlockData.result, 16);
    
    // Calculate approximate block numbers
    const now = Date.now() / 1000;
    const startTimestamp = START_DATE.getTime() / 1000;
    const endTimestamp = END_DATE.getTime() / 1000;
    const blocksPerSecond = 0.5; // ~2s per block
    
    const startBlock = Math.max(0, currentBlock - Math.floor((now - startTimestamp) * blocksPerSecond));
    const endBlock = currentBlock - Math.floor((now - endTimestamp) * blocksPerSecond);
    
    console.log(`[WinterDraw] Block range: ${startBlock} to ${endBlock} (current: ${currentBlock})`);

    // Step 2: Use Alchemy Asset Transfers API to get all DHB transfers in range
    // We'll paginate through all transfers TO user wallets
    const allBuys: Buy[] = [];
    let pageKey: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 50; // Safety limit

    do {
      pageCount++;
      console.log(`[WinterDraw] Fetching transfers page ${pageCount}...`);
      
      const params: any = {
        fromBlock: '0x' + startBlock.toString(16),
        toBlock: '0x' + endBlock.toString(16),
        contractAddresses: [DHB_TOKEN],
        category: ['erc20'],
        withMetadata: true,
        maxCount: '0x3e8', // 1000 per page
        order: 'asc',
      };
      if (pageKey) params.pageKey = pageKey;

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getAssetTransfers',
          params: [params],
        }),
      });

      const data = await res.json();
      
      if (data.error) {
        console.error('[WinterDraw] Alchemy error:', data.error);
        break;
      }

      const transfers = data.result?.transfers || [];
      pageKey = data.result?.pageKey;

      for (const tx of transfers) {
        const from = (tx.from || '').toLowerCase();
        const to = (tx.to || '').toLowerCase();
        const value = tx.value || 0;

        // Skip fiat gateway transfers
        if (FIAT_GATEWAY_WALLETS.has(from)) continue;

        // Skip if sender is the DHB token contract itself (mints)
        if (from === DHB_TOKEN.toLowerCase()) continue;

        // Skip tiny amounts
        if (value < 100) continue;

        // We want Uniswap swaps: these come FROM router/pool contracts
        // Heuristic: if `from` is NOT a known user wallet pattern and IS a contract,
        // it's likely a DEX swap. We check by looking at the `category` and raw log.
        // Alchemy asset transfers from Uniswap will show the pool as sender.
        
        // For Uniswap V3 swaps, the transfer comes from the pool contract
        // We'll include all non-fiat-gateway transfers and filter further
        
        const blockTimestamp = tx.metadata?.blockTimestamp 
          ? new Date(tx.metadata.blockTimestamp).getTime() / 1000
          : 0;

        // Verify within date range
        if (blockTimestamp < startTimestamp || blockTimestamp > endTimestamp) continue;

        allBuys.push({
          buyer: to,
          amount: value,
          txHash: tx.hash,
          blockNum: tx.blockNum,
          timestamp: blockTimestamp,
        });
      }

      console.log(`[WinterDraw] Page ${pageCount}: ${transfers.length} transfers, ${allBuys.length} qualifying buys so far`);
    } while (pageKey && pageCount < maxPages);

    console.log(`[WinterDraw] Total qualifying buys: ${allBuys.length}`);

    // Step 3: Deduplicate - group buys by buyer+txHash
    const uniqueBuys = new Map<string, Buy>();
    for (const buy of allBuys) {
      const key = `${buy.txHash}-${buy.buyer}`;
      if (!uniqueBuys.has(key)) {
        uniqueBuys.set(key, buy);
      }
    }
    const buysList = Array.from(uniqueBuys.values());
    console.log(`[WinterDraw] Unique buys after dedup: ${buysList.length}`);

    // Step 4: Get unique buyers and check their CURRENT DHB balance
    const uniqueBuyers = [...new Set(buysList.map(b => b.buyer))];
    console.log(`[WinterDraw] Unique buyers: ${uniqueBuyers.length}`);

    // Check current balances using eth_call (balanceOf)
    const balanceOfSig = '0x70a08231'; // balanceOf(address)
    const balances: Record<string, number> = {};

    // Batch balance checks (10 at a time)
    for (let i = 0; i < uniqueBuyers.length; i += 10) {
      const batch = uniqueBuyers.slice(i, i + 10);
      const batchResults = await Promise.all(
        batch.map(async (addr) => {
          const paddedAddr = '0x' + addr.slice(2).padStart(64, '0');
          const res = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'eth_call',
              params: [{ to: DHB_TOKEN, data: balanceOfSig + paddedAddr.slice(2) }, 'latest'],
            }),
          });
          const data = await res.json();
          const rawBalance = BigInt(data.result || '0x0');
          const balance = Number(rawBalance) / Math.pow(10, DHB_DECIMALS);
          return { addr, balance };
        })
      );
      for (const { addr, balance } of batchResults) {
        balances[addr] = balance;
      }
    }

    // Step 5: Check which buyers are registered DeHub users
    const registeredUsers: Record<string, { username?: string; avatar?: string }> = {};
    const unregisteredWallets = new Set<string>();
    
    console.log(`[WinterDraw] Checking ${uniqueBuyers.length} wallets against DeHub API...`);
    for (let i = 0; i < uniqueBuyers.length; i += 10) {
      const batch = uniqueBuyers.slice(i, i + 10);
      await Promise.all(
        batch.map(async (addr) => {
          try {
            const res = await fetch(`https://api.dehub.io/api/account_info/${addr}`);
            if (res.ok) {
              const data = await res.json();
              const user = data?.result || data;
              if (user && (user.username || user.displayName)) {
                registeredUsers[addr] = {
                  username: user.username || undefined,
                  avatar: user.avatarImageUrl || undefined,
                };
                return;
              }
            }
            unregisteredWallets.add(addr);
          } catch {
            unregisteredWallets.add(addr);
          }
        })
      );
    }

    console.log(`[WinterDraw] Registered users: ${Object.keys(registeredUsers).length}, Unregistered: ${unregisteredWallets.size}`);

    // Step 6: Filter - buyer must still hold AND be a registered user
    const eligibleBuys = buysList.filter(buy => {
      const currentBalance = balances[buy.buyer] || 0;
      return currentBalance >= buy.amount && !unregisteredWallets.has(buy.buyer);
    });

    console.log(`[WinterDraw] Eligible buys (holding + registered): ${eligibleBuys.length}`);
    console.log(`[WinterDraw] Eligible unique buyers: ${new Set(eligibleBuys.map(b => b.buyer)).size}`);

    // Step 6: Random draw!
    // Each buy is one entry. Shuffle and pick winners.
    // A buyer can win multiple times if they made multiple buys.
    
    // Shuffle using Fisher-Yates
    const shuffled = [...eligibleBuys];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Pick winners - ensure unique wallets per tier
    const usedWallets = new Set<string>();
    
    // Tier 1: 1 winner, 100% bonus, max buy 5M
    const tier1Eligible = shuffled.filter(b => b.amount <= 5_000_000 && !usedWallets.has(b.buyer));
    const tier1Winners: (Buy & { bonus: string; tier: string })[] = [];
    for (const buy of tier1Eligible) {
      if (tier1Winners.length >= 1) break;
      if (!usedWallets.has(buy.buyer)) {
        tier1Winners.push({ ...buy, bonus: '100%', tier: 'Tier 1 (100% bonus, max 5M)' });
        usedWallets.add(buy.buyer);
      }
    }

    // Tier 2: 3 winners, 50% bonus, max buy 10M
    const tier2Eligible = shuffled.filter(b => b.amount <= 10_000_000 && !usedWallets.has(b.buyer));
    const tier2Winners: (Buy & { bonus: string; tier: string })[] = [];
    for (const buy of tier2Eligible) {
      if (tier2Winners.length >= 3) break;
      if (!usedWallets.has(buy.buyer)) {
        tier2Winners.push({ ...buy, bonus: '50%', tier: 'Tier 2 (50% bonus, max 10M)' });
        usedWallets.add(buy.buyer);
      }
    }

    // Tier 3: 16 winners, 20% bonus, no max
    const tier3Eligible = shuffled.filter(b => !usedWallets.has(b.buyer));
    const tier3Winners: (Buy & { bonus: string; tier: string })[] = [];
    for (const buy of tier3Eligible) {
      if (tier3Winners.length >= 16) break;
      if (!usedWallets.has(buy.buyer)) {
        tier3Winners.push({ ...buy, bonus: '20%', tier: 'Tier 3 (20% bonus)' });
        usedWallets.add(buy.buyer);
      }
    }

    const allWinners = [...tier1Winners, ...tier2Winners, ...tier3Winners];

    const result = {
      drawDate: new Date().toISOString(),
      periodStart: START_DATE.toISOString(),
      periodEnd: END_DATE.toISOString(),
      stats: {
        totalBuysScanned: buysList.length,
        uniqueBuyers: uniqueBuyers.length,
        eligibleBuys: eligibleBuys.length,
        eligibleUniqueBuyers: new Set(eligibleBuys.map(b => b.buyer)).size,
        pagesScanned: pageCount,
      },
      winners: {
        tier1: tier1Winners.map(w => ({
          wallet: w.buyer,
          buyAmount: formatAmount(w.amount),
          rawAmount: w.amount,
          bonusAmount: formatAmount(w.amount * 1.0),
          rawBonusAmount: Math.min(w.amount, 5_000_000),
          txHash: w.txHash,
          currentBalance: formatAmount(balances[w.buyer] || 0),
          tier: w.tier,
        })),
        tier2: tier2Winners.map(w => ({
          wallet: w.buyer,
          buyAmount: formatAmount(w.amount),
          rawAmount: w.amount,
          bonusAmount: formatAmount(w.amount * 0.5),
          rawBonusAmount: w.amount * 0.5,
          txHash: w.txHash,
          currentBalance: formatAmount(balances[w.buyer] || 0),
          tier: w.tier,
        })),
        tier3: tier3Winners.map(w => ({
          wallet: w.buyer,
          buyAmount: formatAmount(w.amount),
          rawAmount: w.amount,
          bonusAmount: formatAmount(w.amount * 0.2),
          rawBonusAmount: w.amount * 0.2,
          txHash: w.txHash,
          currentBalance: formatAmount(balances[w.buyer] || 0),
          tier: w.tier,
        })),
      },
      totalWinners: allWinners.length,
    };

    console.log(`[WinterDraw] Draw complete! ${allWinners.length} winners selected.`);

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[WinterDraw] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
