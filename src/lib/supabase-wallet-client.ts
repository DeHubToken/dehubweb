/**
 * Supabase Wallet Client Helper
 * ==============================
 * Provides helper to set wallet address header on Supabase requests
 * for RLS policies that use wallet-based authentication.
 */

/**
 * Add wallet address header to a Supabase query builder
 * Use this for individual queries when you need wallet-based RLS
 * 
 * Example:
 * const query = supabase.from('ai_conversations').select('*');
 * const result = await withWalletHeader(query, walletAddress);
 */
export function withWalletHeader<T extends { setHeader?: (key: string, value: string) => T }>(
  query: T,
  walletAddress: string | null
): T {
  if (!walletAddress) {
    return query;
  }

  // Check if the query has setHeader method (PostgrestFilterBuilder, PostgrestTransformBuilder)
  if (query && typeof query.setHeader === 'function') {
    return query.setHeader('x-wallet-address', walletAddress.toLowerCase());
  }

  return query;
}
