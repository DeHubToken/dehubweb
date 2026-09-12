import { predictSafeAddress } from '@/lib/smart-account-address';
import { getCachedWallet } from '@/lib/wallet-core/store';

const ADDRESS = /^0x[0-9a-f]{40}$/i;

/**
 * Public addresses controlled by the active wallet key.
 *
 * Pre-migration staking positions can be keyed by either the raw owner EOA or
 * the deterministic Safe used by DeHub. The authenticated profile only keeps
 * one of those forms, so legacy reads must check both.
 */
export async function legacyWalletAddresses(sessionAddress: string): Promise<string[]> {
  const addresses = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase();
    if (normalized && ADDRESS.test(normalized)) addresses.add(normalized);
  };

  add(sessionAddress);
  const owner = getCachedWallet()?.ethAddress;
  add(owner);
  add(await predictSafeAddress(owner));
  return [...addresses];
}
