/**
 * Derive the profile address locally; no RPC, private key, or wallet unlock.
 *
 * The derivation lives in its own chunk: this module is reachable from the
 * auth client at boot, and keeping the viem encoders behind a dynamic import
 * keeps them out of the entry chunk for visitors who never sign in.
 */
export async function predictSafeAddress(ownerEoa: string | null | undefined): Promise<string | null> {
  const owner = (ownerEoa ?? '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner)) return null;
  const { computeSafeAddress } = await import('./smart-account-address-impl');
  return computeSafeAddress(owner);
}
