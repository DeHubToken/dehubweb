/**
 * Supabase Wallet Client Helper
 * ==============================
 * Provides helper to set wallet address header on Supabase requests
 * for RLS policies that use wallet-based authentication.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Same publishable pair the shared client uses — see the note there on why
// hardcoding the fallbacks is safe.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I';

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

/**
 * A whole client pinned to one wallet, for the Storage API.
 *
 * `withWalletHeader` works by calling `setHeader` on a postgrest builder, and
 * the Storage client has no such method — there is no way to attach a header to
 * a single `storage.from(...).remove()`. That is why the stage-recordings
 * bucket carried a DELETE policy of `bucket_id = 'stage-recordings'` for role
 * `public`: with no wallet ever reaching the policy, the only rule it could
 * express was "anyone", and anyone holding the publishable key could delete any
 * recording on the platform.
 *
 * Setting the header globally on a separate client fixes that — storage
 * requests from it carry the wallet, so the bucket policy can check who is
 * asking.
 *
 * Deliberately NOT the shared client with a mutated header: that one is used by
 * everything, and a global wallet header on it would silently change the RLS a
 * hundred unrelated queries run under. This one is built per call, holds no
 * session, and is thrown away after.
 */
export function walletScopedClient(walletAddress: string) {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-wallet-address': walletAddress.toLowerCase() } },
  });
}
