/**
 * DeHub Payment (DPay) API Integration
 * =====================================
 * Handles fiat onramp, token purchases, and payment processing.
 */

import { getAuthToken } from './dehub';

const DEHUB_API_BASE = "https://api.dehub.io";

// Types
export interface DPayToken {
  symbol: string;
  name: string;
  logoUrl?: string;
  chainId?: number;
  address?: string;
  decimals?: number;
}

export interface DPayPrice {
  price: number;
  change24h?: number;
  currency: string;
}

export interface DPayTransaction {
  id: string;
  type: 'buy' | 'sell' | 'transfer';
  amount: number;
  tokenSymbol: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  txHash?: string;
  chainId?: number;
}

export interface OnrampSessionRequest {
  amount: number;
  currency: string;
  tokenSymbol: string;
  walletAddress: string;
}

export interface OnrampSessionResponse {
  sessionId: string;
  url?: string;
  expiresAt?: string;
}

/**
 * Get DHB token price
 */
export async function getDPayPrice(): Promise<DPayPrice> {
  console.log('[DPay API] Fetching price...');
  
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/dpay/price`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch price: ${response.status}`);
    }

    const data = await response.json();
    console.log('[DPay API] Price response:', data);
    
    // Handle various response formats
    if (data?.result) {
      return {
        price: data.result.price || data.result,
        change24h: data.result.change24h,
        currency: data.result.currency || 'USD',
      };
    }
    
    if (typeof data?.price === 'number') {
      return {
        price: data.price,
        change24h: data.change24h,
        currency: data.currency || 'USD',
      };
    }

    // If response is just a number
    if (typeof data === 'number') {
      return { price: data, currency: 'USD' };
    }

    return { price: 0, currency: 'USD' };
  } catch (error) {
    console.error('[DPay API] Error fetching price:', error);
    throw error;
  }
}

/**
 * Get price for a specific chain
 */
export async function getDPayPriceByChain(chainId: number): Promise<DPayPrice> {
  console.log('[DPay API] Fetching price for chain:', chainId);
  
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/dpay/price/${chainId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch price: ${response.status}`);
    }

    const data = await response.json();
    
    if (data?.result) {
      return {
        price: data.result.price || data.result,
        change24h: data.result.change24h,
        currency: data.result.currency || 'USD',
      };
    }

    return { price: data?.price || 0, currency: 'USD' };
  } catch (error) {
    console.error('[DPay API] Error fetching chain price:', error);
    throw error;
  }
}

/**
 * Get available tokens for purchase
 */
export async function getAvailableTokens(): Promise<DPayToken[]> {
  console.log('[DPay API] Fetching available tokens...');

  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/dpay/available/tokens`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tokens: ${response.status}`);
    }

    const data = await response.json();
    console.log('[DPay API] Tokens response:', data);

    // Handle various response formats
    const tokens = data?.result || data?.tokens || data || [];

    if (Array.isArray(tokens)) {
      return tokens.map((t: any) => ({
        symbol: t.symbol || t.ticker || 'UNKNOWN',
        name: t.name || t.symbol || 'Unknown Token',
        logoUrl: t.logoUrl || t.logo || t.image,
        chainId: t.chainId,
        address: t.address || t.tokenAddress,
        decimals: t.decimals || 18,
      }));
    }

    // Default to DHB if API returns nothing useful
    return [{
      symbol: 'DHB',
      name: 'DeHub Token',
      decimals: 18,
    }];
  } catch (error) {
    console.error('[DPay API] Error fetching tokens:', error);
    // Return default token on error
    return [{
      symbol: 'DHB',
      name: 'DeHub Token',
      decimals: 18,
    }];
  }
}

/**
 * Get available token supply for a specific token.
 * Call this before createCheckoutSession to prevent 406 "exceeds available supply" errors.
 * Uses /api/dpay/available/tokens?token=<symbol> which returns { balance: {...} }.
 */
export async function getTokenAvailableSupply(tokenSymbol: string): Promise<number> {
  console.log('[DPay API] Checking available supply for:', tokenSymbol);
  try {
    const response = await fetch(
      `${DEHUB_API_BASE}/api/dpay/available/tokens?token=${encodeURIComponent(tokenSymbol)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.ok) {
      // Don't block purchase on supply fetch failure — let the checkout API decide
      return Infinity;
    }

    const data = await response.json();
    console.log('[DPay API] Supply response:', data);

    const balance = data?.balance ?? data?.result ?? data;

    // { balance: 12345 }
    if (typeof balance === 'number') return balance;

    // { balance: { available: 12345 } }
    if (typeof balance?.available === 'number') return balance.available;

    // { balance: { total: 12345 } }
    if (typeof balance?.total === 'number') return balance.total;

    // { balance: { DHB: 12345 } } or { balance: { dhb: 12345 } }
    const bySymbol = balance?.[tokenSymbol] ?? balance?.[tokenSymbol.toUpperCase()] ?? balance?.[tokenSymbol.toLowerCase()];
    if (typeof bySymbol === 'number') return bySymbol;
    if (typeof bySymbol?.available === 'number') return bySymbol.available;

    return Infinity;
  } catch {
    return Infinity; // On network error, don't block — let the checkout API decide
  }
}

/**
 * Get available gas tokens
 */
export async function getAvailableGasTokens(): Promise<DPayToken[]> {
  console.log('[DPay API] Fetching available gas tokens...');
  
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/dpay/available/gas`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch gas tokens: ${response.status}`);
    }

    const data = await response.json();
    const tokens = data?.result || data?.tokens || data || [];
    
    if (Array.isArray(tokens)) {
      return tokens.map((t: any) => ({
        symbol: t.symbol || t.ticker,
        name: t.name || t.symbol,
        logoUrl: t.logoUrl || t.logo,
        chainId: t.chainId,
        address: t.address,
        decimals: t.decimals || 18,
      }));
    }

    return [];
  } catch (error) {
    console.error('[DPay API] Error fetching gas tokens:', error);
    return [];
  }
}

/**
 * Get user's dpay transaction history
 */
export async function getDPayTransactions(): Promise<DPayTransaction[]> {
  console.log('[DPay API] Fetching transactions...');
  
  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }
  
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/dpay/tnxs`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.status}`);
    }

    const data = await response.json();
    const transactions = data?.result || data?.transactions || data || [];
    
    if (Array.isArray(transactions)) {
      return transactions.map((tx: any) => ({
        id: tx._id || tx.id,
        type: tx.type || 'buy',
        amount: tx.amount,
        tokenSymbol: tx.tokenSymbol || tx.symbol || 'DHB',
        status: tx.status || 'completed',
        createdAt: tx.createdAt || tx.created_at,
        txHash: tx.txHash || tx.hash,
        chainId: tx.chainId || tx.chain_id,
      }));
    }

    return [];
  } catch (error) {
    console.error('[DPay API] Error fetching transactions:', error);
    throw error;
  }
}

/**
 * Get total volume/stats
 */
export async function getDPayTotal(): Promise<{ totalVolume: number; totalTransactions: number }> {
  console.log('[DPay API] Fetching totals...');
  
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/dpay/total`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch totals: ${response.status}`);
    }

    const data = await response.json();
    const result = data?.result || data;
    
    return {
      totalVolume: result?.totalVolume || result?.volume || 0,
      totalTransactions: result?.totalTransactions || result?.count || 0,
    };
  } catch (error) {
    console.error('[DPay API] Error fetching totals:', error);
    return { totalVolume: 0, totalTransactions: 0 };
  }
}

/**
 * Create an onramp session for fiat-to-crypto purchase
 */
export async function createOnrampSession(request: OnrampSessionRequest): Promise<OnrampSessionResponse> {
  console.log('[DPay API] Creating onramp session...', request);

  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${DEHUB_API_BASE}/api/dpay/create-onramp-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      source_amount: request.amount,
      source_currency: request.currency.toLowerCase(),
      destination_currency: request.tokenSymbol.toUpperCase(),
      destination_wallet_address: request.walletAddress,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    // 500 from the backend means the onramp provider is currently unavailable.
    // Surface a clear message so the user knows to try the Card/Bank method.
    if (response.status >= 500) {
      throw new Error('Onramp service is temporarily unavailable. Please use Card / Bank payment instead.');
    }

    throw new Error(errorData.message || errorData.error || `Failed to create onramp session: ${response.status}`);
  }

  const data = await response.json();
  console.log('[DPay API] Onramp session response:', data);

  const result = data?.result || data;

  return {
    sessionId: result.sessionId || result.id,
    url: result.url || result.redirectUrl || result.checkoutUrl,
    expiresAt: result.expiresAt,
  };
}

/**
 * Create a checkout session (alternative to onramp)
 */
export async function createCheckoutSession(request: {
  amount: number;
  currency?: string;
  tokenSymbol: string;
  walletAddress: string;
  chainId?: number;
  tokensToReceive: number;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  console.log('[DPay API] Creating checkout session...', request);
  
  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }
  
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/dpay/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency ?? 'usd',
        tokenSymbol: request.tokenSymbol,
        walletAddress: request.walletAddress,
        chainId: request.chainId ?? 8453,
        termsAndServicesAccepted: true,
        tokensToReceive: request.tokensToReceive,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create checkout: ${response.status}`);
    }

    const data = await response.json();
    const result = data?.result || data;
    
    return {
      checkoutUrl: result.url || result.checkoutUrl,
      sessionId: result.sessionId || result.id,
    };
  } catch (error) {
    console.error('[DPay API] Error creating checkout:', error);
    throw error;
  }
}
