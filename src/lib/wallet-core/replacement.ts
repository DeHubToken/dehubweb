import { supabase } from '@/integrations/supabase/client';
import type { EncryptedPayload } from './crypto';
import { cacheWallet, type StoredWallet } from './store';

/** Archive the old encrypted records and replace the active wallet atomically. */
export async function replaceStoredWallet(
  userId: string,
  expectedAddress: string,
  newAddress: string,
  payload: EncryptedPayload,
): Promise<void> {
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || session.session?.user.id !== userId) throw new Error('Sign in again before replacing your wallet');
  // The archive RPC is shared by web and mobile; it is not generated yet.
  const { data, error } = await (supabase as any).rpc('replace_user_wallet', {
    p_expected_address: expectedAddress,
    p_new_address: newAddress,
    p_encrypted_seed: payload.ciphertext,
    p_salt: payload.salt,
    p_iv: payload.iv,
    p_kdf_iterations: payload.iterations,
  });
  if (error) throw new Error(error.message || 'Could not replace your wallet');
  if (data?.eth_address?.toLowerCase() !== newAddress.toLowerCase()) throw new Error('Wallet replacement was not confirmed');
  const wallet: StoredWallet = { ethAddress: data.eth_address, payload: {
    ciphertext: data.encrypted_seed, salt: data.salt, iv: data.iv, iterations: data.kdf_iterations,
  } };
  cacheWallet(wallet);
}

export async function getPendingWalletReplacement(userId: string, address: string): Promise<{ oldAddress: string } | null> {
  const { data, error } = await (supabase as any).from('user_wallet_archives')
    .select('eth_address').eq('user_id', userId).eq('replacement_address', address.toLowerCase())
    .is('profile_rotated_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message || 'Could not check wallet replacement');
  return data ? { oldAddress: data.eth_address } : null;
}

export async function completeWalletReplacement(address: string): Promise<void> {
  const { error } = await (supabase as any).rpc('complete_wallet_replacement', { p_new_address: address });
  if (error) throw new Error(error.message || 'Could not finish wallet replacement');
}
