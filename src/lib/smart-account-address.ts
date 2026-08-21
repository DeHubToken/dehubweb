/**
 * Predict the Safe smart-account address for an owner EOA — no private key, no
 * unlock, no signature, no user interaction.
 *
 * The DeHub backend links whatever address a user last SIGNED with. For the
 * built-in wallet that is the Safe smart account, because the AA provider does
 * the signing, while `user_wallets` stores the owner EOA the seed derives to.
 * They are two different strings for the same person, which is why comparing
 * the Supabase exchange's linked address against the stored EOA rejected every
 * healthy smart-account session and sent "passwordless" login to the unlock
 * sheet instead.
 *
 * A Safe's address is a pure CREATE2 function of (proxy factory, singleton,
 * initializer, saltNonce), and the initializer commits only to owner
 * ADDRESSES — never to a key — so the address is derivable from the EOA alone.
 *
 * The parameters below MUST stay identical to the ones that actually create the
 * account, or this predicts an address belonging to nobody. Those live in
 * `@web3auth/account-abstraction-provider`'s SafeSmartAccount, which calls
 * permissionless's `toSafeSmartAccount` with:
 *
 *   entryPoint  { address: entryPoint07Address, version: "0.7" }   (its default)
 *   version     "1.4.1"                                            (its default)
 *   owners      [ the single EOA ]  -> threshold defaults to 1
 *   saltNonce   not passed          -> defaults to 0n
 *
 * `lib/smart-wallet.ts` constructs `new SafeSmartAccount()` with no options, so
 * every one of those defaults applies. Note the account is minted through that
 * package's OWN nested permissionless (0.2.57), not the 0.3.x pinned at top
 * level and imported here; the two agree today, by source and by execution, but
 * they can drift independently.
 *
 * Checked against every account seen failing in production: 29 of 32 predicted
 * the exact address the backend had linked. All three that did not were stale
 * links, confirmed on Base — two point at addresses that were never deployed,
 * and one at a Safe owned by an entirely different key. Those are precisely the
 * cases that must NOT be waved through, which is the whole reason this is a
 * prediction and not a blanket accept.
 */
import { createClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { entryPoint07Address } from 'viem/account-abstraction';

/** The same endpoint lib/smart-wallet.ts hands the AA provider for Base. */
const BASE_RPC_URL = 'https://base-rpc.publicnode.com';

/**
 * This sits between a tapped "log in" and the app appearing, so it gets a hard
 * ceiling rather than viem's default. Timing out costs the user nothing they
 * were not already paying: the fallback is the unlock sheet, which is exactly
 * what they would have got without this check at all.
 */
const RPC_TIMEOUT_MS = 4000;

const EOA_RE = /^0x[0-9a-f]{40}$/;

/** owner EOA (lowercased) -> predicted Safe address (lowercased). */
const predictionCache = new Map<string, string>();

/**
 * The Safe smart account `ownerEoa` controls on Base, lowercased.
 *
 * Returns null rather than throwing for every failure — a malformed address, an
 * RPC outage, a library change. Callers must treat null as "cannot prove it",
 * never as "not the same wallet".
 */
export async function predictSafeAddress(
  ownerEoa: string | null | undefined,
): Promise<string | null> {
  const owner = (ownerEoa ?? '').trim().toLowerCase();
  if (!EOA_RE.test(owner)) return null;

  const cached = predictionCache.get(owner);
  if (cached) return cached;

  try {
    // Dynamic: ~48 KB of Safe/permissionless code that only a passwordless
    // login attempt ever needs, kept out of the eager graph.
    const { toSafeSmartAccount } = await import('permissionless/accounts');

    // createClient, not createPublicClient: the extended public actions make
    // the argument type collapse to `never` against toSafeSmartAccount's
    // `client` parameter, and tsc is the only gate CI runs.
    const client = createClient({
      chain: base,
      transport: http(BASE_RPC_URL, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }),
    });

    const account = await toSafeSmartAccount({
      client,
      // A bare { address, type: 'json-rpc' } satisfies viem's JsonRpcAccount,
      // which is a valid owner. Address prediction never signs, so the missing
      // signing methods are never reached.
      owners: [{ address: owner as Address, type: 'json-rpc' }],
      entryPoint: { address: entryPoint07Address, version: '0.7' },
      version: '1.4.1',
    });

    const predicted = (await account.getAddress()).toLowerCase();
    predictionCache.set(owner, predicted);
    return predicted;
  } catch (e) {
    console.warn('[SmartAccount] Could not predict Safe address:', e);
    return null;
  }
}
