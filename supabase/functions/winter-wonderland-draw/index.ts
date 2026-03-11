import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DHB_TOKEN_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const DHB_DECIMALS = 18;
const BASE_STAKING_ADDRESS = '0x7b10dd033Ac41B8AF85eE1701e344B86e446250B';

// Known fiat gateway wallets to EXCLUDE
const FIAT_GATEWAY_WALLETS = new Set([
  '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c',
  '0x3a0b5fe1ce81251afaf7e457e1d1e23a4a85c67f',
  '0x1be95b03ef8f10f78e078a74b0080b7e9af4c02b',
]);

// Date range: Dec 1 2025 to Jan 25 2026 (inclusive)
const START_DATE = new Date('2025-12-01T00:00:00Z');
const END_DATE = new Date('2026-01-25T23:59:59Z');
// "Before December" means holders who had DHB before Dec 1 2025
const HOLDER_CUTOFF = new Date('2025-12-01T00:00:00Z');

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

const balanceOfSig = '0x70a08231'; // balanceOf(address)

async function getBalance(baseUrl: string, tokenAddress: string, walletAddress: string): Promise<number> {
  const paddedAddr = '0x' + walletAddress.slice(2).padStart(64, '0');
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_call',
      params: [{ to: tokenAddress, data: balanceOfSig + paddedAddr.slice(2) }, 'latest'],
    }),
  });
  const data = await res.json();
  const rawBalance = BigInt(data.result || '0x0');
  return Number(rawBalance) / Math.pow(10, DHB_DECIMALS);
}

async function checkRegistered(addr: string): Promise<{ username?: string; avatar?: string } | null> {
  try {
    const res = await fetch(`https://api.dehub.io/api/account_info/${addr}`);
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.result || data;
    if (user && (user.username || user.displayName)) {
      return { username: user.username || undefined, avatar: user.avatarImageUrl || undefined };
    }
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Check if results already exist in DB ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existingResults } = await supabase
      .from('winter_wonderland_results')
      .select('results')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingResults?.results) {
      console.log('[WinterDraw] Returning cached results from DB');
      return new Response(JSON.stringify(existingResults.results, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── No cached results — run the draw ──
    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
    if (!alchemyKey) {
      return new Response(JSON.stringify({ error: 'ALCHEMY_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const baseUrl = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    // ── Step 1: Get block range ──
    console.log('[WinterDraw] Fetching block range for Dec 1 2025 - Jan 25 2026...');
    const currentBlockRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    });
    const currentBlockData = await currentBlockRes.json();
    const currentBlock = parseInt(currentBlockData.result, 16);

    const now = Date.now() / 1000;
    const startTimestamp = START_DATE.getTime() / 1000;
    const endTimestamp = END_DATE.getTime() / 1000;
    const blocksPerSecond = 0.5;

    const startBlock = Math.max(0, currentBlock - Math.floor((now - startTimestamp) * blocksPerSecond));
    const endBlock = currentBlock - Math.floor((now - endTimestamp) * blocksPerSecond);

    console.log(`[WinterDraw] Block range: ${startBlock} to ${endBlock}`);

    // ── Step 2: Fetch all DHB transfers in range ──
    const allBuys: Buy[] = [];
    let pageKey: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 100;

    do {
      pageCount++;
      console.log(`[WinterDraw] Fetching transfers page ${pageCount}...`);

      const params: any = {
        fromBlock: '0x' + startBlock.toString(16),
        toBlock: '0x' + endBlock.toString(16),
        contractAddresses: [DHB_TOKEN_BASE],
        category: ['erc20'],
        withMetadata: true,
        maxCount: '0x3e8',
        order: 'asc',
      };
      if (pageKey) params.pageKey = pageKey;

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [params] }),
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
        // Skip mints
        if (from === DHB_TOKEN_BASE.toLowerCase()) continue;
        // Skip tiny amounts
        if (value < 100) continue;
        // Skip transfers TO staking (these are stakes, not buys)
        if (to === BASE_STAKING_ADDRESS.toLowerCase()) continue;

        const blockTimestamp = tx.metadata?.blockTimestamp
          ? new Date(tx.metadata.blockTimestamp).getTime() / 1000
          : 0;
        if (blockTimestamp < startTimestamp || blockTimestamp > endTimestamp) continue;

        allBuys.push({ buyer: to, amount: value, txHash: tx.hash, blockNum: tx.blockNum, timestamp: blockTimestamp });
      }

      console.log(`[WinterDraw] Page ${pageCount}: ${transfers.length} transfers, ${allBuys.length} qualifying buys so far`);
    } while (pageKey && pageCount < maxPages);

    console.log(`[WinterDraw] Total qualifying buys: ${allBuys.length}`);

    // ── Step 3: Deduplicate ──
    const uniqueBuys = new Map<string, Buy>();
    for (const buy of allBuys) {
      const key = `${buy.txHash}-${buy.buyer}`;
      if (!uniqueBuys.has(key)) uniqueBuys.set(key, buy);
    }
    const buysList = Array.from(uniqueBuys.values());
    console.log(`[WinterDraw] Unique buys after dedup: ${buysList.length}`);

    // ── Step 4: Check current balances ──
    const uniqueBuyers = [...new Set(buysList.map(b => b.buyer))];
    console.log(`[WinterDraw] Unique buyers: ${uniqueBuyers.length}`);

    const balances: Record<string, number> = {};
    for (let i = 0; i < uniqueBuyers.length; i += 10) {
      const batch = uniqueBuyers.slice(i, i + 10);
      const results = await Promise.all(batch.map(async (addr) => ({
        addr,
        balance: await getBalance(baseUrl, DHB_TOKEN_BASE, addr),
      })));
      for (const { addr, balance } of results) balances[addr] = balance;
    }

    // ── Step 5: Check DeHub registration ──
    const registeredUsers: Record<string, { username?: string; avatar?: string }> = {};
    const unregisteredWallets = new Set<string>();

    // Check all unique addresses (buyers + we'll need stakers later)
    for (let i = 0; i < uniqueBuyers.length; i += 10) {
      const batch = uniqueBuyers.slice(i, i + 10);
      await Promise.all(batch.map(async (addr) => {
        const user = await checkRegistered(addr);
        if (user) registeredUsers[addr] = user;
        else unregisteredWallets.add(addr);
      }));
    }

    console.log(`[WinterDraw] Registered: ${Object.keys(registeredUsers).length}, Unregistered: ${unregisteredWallets.size}`);

    // ── Step 6: ALL buys are eligible — "every buy enters the draw" ──
    // No holding requirement, no registration requirement
    const eligibleBuys = [...buysList];
    console.log(`[WinterDraw] All buys eligible: ${eligibleBuys.length}`);

    // ── Step 7: STAKER/HOLDER TIER ──
    // Find holders who had DHB before Dec 1 2025 by checking transfers before that date
    // We check who currently has staked DHB (balance in the staking address) OR holds DHB
    // We'll get all current DHB holders from Alchemy and check staked balances
    console.log('[WinterDraw] Scanning stakers/holders from before December...');

    // Get transfers TO staking address before Dec 1 to find stakers
    const holderCutoffTimestamp = HOLDER_CUTOFF.getTime() / 1000;
    const cutoffBlock = Math.max(0, currentBlock - Math.floor((now - holderCutoffTimestamp) * blocksPerSecond));

    // Fetch DHB transfers before Dec 1 to find pre-existing holders
    const preDecHolders = new Set<string>();
    let holderPageKey: string | undefined = undefined;
    let holderPageCount = 0;

    // Look back ~6 months before Dec 1 for any DHB activity
    const lookbackStart = Math.max(0, cutoffBlock - Math.floor(180 * 24 * 3600 * blocksPerSecond));

    do {
      holderPageCount++;
      if (holderPageCount > 50) break; // safety

      const params: any = {
        fromBlock: '0x' + lookbackStart.toString(16),
        toBlock: '0x' + cutoffBlock.toString(16),
        contractAddresses: [DHB_TOKEN_BASE],
        category: ['erc20'],
        withMetadata: false,
        maxCount: '0x3e8',
        order: 'asc',
      };
      if (holderPageKey) params.pageKey = holderPageKey;

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [params] }),
      });
      const data = await res.json();
      if (data.error) break;

      const transfers = data.result?.transfers || [];
      holderPageKey = data.result?.pageKey;

      for (const tx of transfers) {
        const to = (tx.to || '').toLowerCase();
        if (to && to !== DHB_TOKEN_BASE.toLowerCase()) {
          preDecHolders.add(to);
        }
      }
      console.log(`[WinterDraw] Pre-Dec holder scan page ${holderPageCount}, found ${preDecHolders.size} addresses so far`);
    } while (holderPageKey && holderPageCount < 50);

    console.log(`[WinterDraw] Pre-December addresses found: ${preDecHolders.size}`);

    // Now filter: must currently hold OR have staked, AND be registered
    // Check staked balances (DHB sent to staking address = staked)
    const stakerCandidates: { addr: string; totalBalance: number }[] = [];

    const preDecList = [...preDecHolders];
    for (let i = 0; i < preDecList.length; i += 10) {
      const batch = preDecList.slice(i, i + 10);
      await Promise.all(batch.map(async (addr) => {
        // Skip addresses already in buyer pool (they compete in buyer tiers)
        // Actually per rules they CAN be in both - but staker tier is separate
        const walletBalance = balances[addr] ?? await getBalance(baseUrl, DHB_TOKEN_BASE, addr);
        balances[addr] = walletBalance;

        // Check if registered
        if (!registeredUsers[addr] && !unregisteredWallets.has(addr)) {
          const user = await checkRegistered(addr);
          if (user) registeredUsers[addr] = user;
          else unregisteredWallets.add(addr);
        }

        if (unregisteredWallets.has(addr)) return;
        if (walletBalance <= 0) return;

        stakerCandidates.push({ addr, totalBalance: walletBalance });
      }));
    }

    console.log(`[WinterDraw] Eligible stakers/holders from before Dec: ${stakerCandidates.length}`);

    // ── Step 8: Random draw! ──
    // Shuffle using Fisher-Yates
    function shuffle<T>(arr: T[]): T[] {
      const s = [...arr];
      for (let i = s.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [s[i], s[j]] = [s[j], s[i]];
      }
      return s;
    }

    const shuffledBuys = shuffle(eligibleBuys);
    const usedWallets = new Set<string>();

    // Tier 1: 1 winner, 100% bonus, max buy 5M
    const tier1Winners: (Buy & { bonus: string; tier: string })[] = [];
    for (const buy of shuffledBuys) {
      if (tier1Winners.length >= 1) break;
      if (buy.amount <= 5_000_000 && !usedWallets.has(buy.buyer)) {
        tier1Winners.push({ ...buy, bonus: '100%', tier: 'Tier 1 (100% bonus, max 5M)' });
        usedWallets.add(buy.buyer);
      }
    }

    // Tier 2: 3 winners, 50% bonus, max buy 10M
    const tier2Winners: (Buy & { bonus: string; tier: string })[] = [];
    for (const buy of shuffledBuys) {
      if (tier2Winners.length >= 3) break;
      if (buy.amount <= 10_000_000 && !usedWallets.has(buy.buyer)) {
        tier2Winners.push({ ...buy, bonus: '50%', tier: 'Tier 2 (50% bonus, max 10M)' });
        usedWallets.add(buy.buyer);
      }
    }

    // Tier 3: 16 winners, 20% bonus, no max
    const tier3Winners: (Buy & { bonus: string; tier: string })[] = [];
    for (const buy of shuffledBuys) {
      if (tier3Winners.length >= 16) break;
      if (!usedWallets.has(buy.buyer)) {
        tier3Winners.push({ ...buy, bonus: '20%', tier: 'Tier 3 (20% bonus)' });
        usedWallets.add(buy.buyer);
      }
    }

    // Staker Tier: 5 winners, 1M DHB each
    // Exclude wallets already winning in buyer tiers
    const eligibleStakers = stakerCandidates.filter(s => !usedWallets.has(s.addr));
    const shuffledStakers = shuffle(eligibleStakers);
    const stakerWinners = shuffledStakers.slice(0, 5);

    const allBuyerWinners = [...tier1Winners, ...tier2Winners, ...tier3Winners];

    function mapWinner(w: Buy & { bonus: string; tier: string }, bonusMultiplier: number, maxBuy?: number) {
      const cappedAmount = maxBuy ? Math.min(w.amount, maxBuy) : w.amount;
      return {
        wallet: w.buyer,
        username: registeredUsers[w.buyer]?.username || null,
        avatar: registeredUsers[w.buyer]?.avatar || null,
        buyAmount: formatAmount(w.amount),
        rawAmount: w.amount,
        bonusAmount: formatAmount(cappedAmount * bonusMultiplier),
        rawBonusAmount: cappedAmount * bonusMultiplier,
        txHash: w.txHash,
        currentBalance: formatAmount(balances[w.buyer] || 0),
        tier: w.tier,
      };
    }

    const result = {
      drawDate: new Date().toISOString(),
      periodStart: START_DATE.toISOString(),
      periodEnd: END_DATE.toISOString(),
      stats: {
        totalBuysScanned: buysList.length,
        uniqueBuyers: uniqueBuyers.length,
        registeredBuyers: Object.keys(registeredUsers).length,
        eligibleBuys: eligibleBuys.length,
        eligibleUniqueBuyers: new Set(eligibleBuys.map(b => b.buyer)).size,
        pagesScanned: pageCount,
        preDecemberHolders: preDecHolders.size,
        eligibleStakers: stakerCandidates.length,
      },
      winners: {
        tier1: tier1Winners.map(w => mapWinner(w, 1.0, 5_000_000)),
        tier2: tier2Winners.map(w => mapWinner(w, 0.5, 10_000_000)),
        tier3: tier3Winners.map(w => mapWinner(w, 0.2)),
        stakerTier: stakerWinners.map(s => ({
          wallet: s.addr,
          username: registeredUsers[s.addr]?.username || null,
          avatar: registeredUsers[s.addr]?.avatar || null,
          prize: '1,000,000 DHB',
          rawPrize: 1_000_000,
          currentBalance: formatAmount(balances[s.addr] || 0),
          tier: 'Staker/Holder (1M DHB)',
        })),
      },
      totalWinners: allBuyerWinners.length + stakerWinners.length,
    };

    console.log(`[WinterDraw] Draw complete! ${result.totalWinners} winners selected.`);

    // ── Store results permanently ──
    const { error: insertError } = await supabase
      .from('winter_wonderland_results')
      .insert({ results: result });

    if (insertError) {
      console.error('[WinterDraw] Failed to store results:', insertError);
    } else {
      console.log('[WinterDraw] Results stored permanently in DB');
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[WinterDraw] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
