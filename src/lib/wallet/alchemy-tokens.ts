/**
 * Alchemy Token Discovery
 * =======================
 * Discovers all ERC20 tokens with non-zero balances via server-side Alchemy proxy.
 * Merges with known DEFAULT_TOKENS so known tokens keep their metadata/logos.
 */

import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TOKENS, type WalletToken, formatBalance } from '@/lib/wallet/tokens';
import type { ChainId } from '@/components/app/ChainSelector';

interface AlchemyToken {
  address: string;
  balance: string; // hex
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
}

/**
 * Discover all ERC20 tokens with non-zero balances for a wallet on a given chain.
 * Returns tokens NOT already in DEFAULT_TOKENS (to avoid duplicates when merging).
 */
export async function discoverAlchemyTokens(
  walletAddress: string,
  chainId: ChainId
): Promise<WalletToken[]> {
  try {
    const { data, error } = await supabase.functions.invoke('alchemy-tokens', {
      body: { walletAddress, chainId },
    });

    if (error || !data?.tokens) {
      console.warn('[alchemy-tokens] Discovery failed:', error);
      return [];
    }

    const knownAddresses = new Set(
      (DEFAULT_TOKENS[chainId] || []).map(t => t.address.toLowerCase())
    );

    const discovered: WalletToken[] = [];
    for (const token of data.tokens as AlchemyToken[]) {
      // Skip tokens already in the default list
      if (knownAddresses.has(token.address.toLowerCase())) continue;

      const balance = BigInt(token.balance);
      if (balance === BigInt(0)) continue;

      discovered.push({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        balance,
        formattedBalance: formatBalance(balance, token.decimals),
        logo: token.logo || undefined,
        isCustom: false,
        chainId,
      });
    }

    // Sort by symbol
    discovered.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return discovered;
  } catch (err) {
    console.warn('[alchemy-tokens] Discovery error:', err);
    return [];
  }
}
