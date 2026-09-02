/**
 * Which account a wallet is actually holding, asked at the moment we need it.
 * ==========================================================================
 * wagmi remembers the address a connector reported when it connected, and that
 * memory outlives the permission behind it. Somebody who switched accounts in
 * MetaMask — or who has several wallets and last approved a different one —
 * still gets the remembered address handed to `personal_sign`, and MetaMask
 * answers `-32602 "Invalid parameters: must provide an Ethereum address"`.
 *
 * That is not a rejection and not a timeout, so none of the branches in
 * completeDeHubAuthWagmi's error handling fit it, and there was no way out of
 * it inside the app at all: the only fix was opening the extension and
 * removing the site from its connected list. 8 of those in the 30 days to
 * 2026-09-01 (all `metaMaskSDK`, 3 accounts, still happening on the current
 * build), plus one Phantom `4100`.
 *
 * Two calls close it:
 *
 *   `eth_accounts`             — who does the wallet have right now? Costs no
 *                                prompt and no approval; it is the question we
 *                                should have been asking instead of trusting a
 *                                remembered value.
 *   `wallet_requestPermissions`— open the wallet's OWN account picker, so the
 *                                user chooses, in the wallet, without leaving
 *                                the sheet.
 *
 * There is deliberately nothing here that picks an account on someone's
 * behalf. A site cannot enumerate accounts it was not granted and cannot make
 * a wallet switch to one — that boundary is the whole point of the extension.
 * The picker is the entire set of what is possible, and it is enough.
 */

type ProviderLike = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export interface AccountConnectorLike {
  id?: string;
  name?: string;
  getProvider?: (parameters?: unknown) => Promise<unknown>;
  getAccounts?: () => Promise<readonly string[]>;
}

const isAddress = (value: unknown): value is string =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);

const normalise = (values: readonly unknown[] | undefined): string[] =>
  (values ?? []).filter(isAddress).map(a => a.toLowerCase());

/**
 * Everything a provider error might be carrying, flattened.
 *
 * viem wraps provider errors several layers deep and the code can sit on any
 * of them — `error.code`, `error.cause.code`, the RPC body below that. Reading
 * only the top level is how the -32602 got mistaken for a generic failure.
 */
function describe(error: unknown): { codes: number[]; text: string } {
  const codes: number[] = [];
  const parts: string[] = [];
  let node: any = error;
  for (let depth = 0; node && typeof node === 'object' && depth < 6; depth++) {
    if (typeof node.code === 'number') codes.push(node.code);
    if (typeof node.name === 'string') parts.push(node.name);
    if (typeof node.message === 'string') parts.push(node.message);
    if (typeof node.shortMessage === 'string') parts.push(node.shortMessage);
    if (typeof node.details === 'string') parts.push(node.details);
    node = node.cause ?? node.error ?? node.data;
  }
  return { codes, text: parts.join(' | ').toLowerCase() };
}

/**
 * "You asked me to sign with an account I do not have."
 *
 * Kept narrow on purpose. -32602 is a generic invalid-params code, so it only
 * counts here when the wallet also names an address — otherwise a malformed
 * request of any other kind would send people to an account picker that cannot
 * help them.
 */
export function isWrongAccountError(error: unknown): boolean {
  const { codes, text } = describe(error);
  // 4100 — the account exists but this site was never authorised for it.
  if (codes.includes(4100) || text.includes('unauthorizedprovider')) return true;
  if (codes.includes(-32602) && /address|account/.test(text)) return true;
  return false;
}

async function providerOf(connector: AccountConnectorLike | null | undefined): Promise<ProviderLike | null> {
  if (!connector?.getProvider) return null;
  try {
    const provider = await connector.getProvider();
    return provider && typeof (provider as ProviderLike).request === 'function'
      ? (provider as ProviderLike)
      : null;
  } catch {
    return null;
  }
}

/**
 * The accounts the wallet will admit to right now, lowercased.
 *
 * Never throws: a wallet that cannot answer (WalletConnect mid-handshake, a
 * provider that has gone away) leaves the caller on the remembered address,
 * which is exactly the behaviour that existed before this file.
 */
export async function readLiveAccounts(
  connector: AccountConnectorLike | null | undefined,
): Promise<string[]> {
  if (!connector) return [];
  try {
    if (connector.getAccounts) {
      const accounts = normalise(await connector.getAccounts());
      if (accounts.length) return accounts;
    }
  } catch { /* fall through to the provider */ }

  const provider = await providerOf(connector);
  if (!provider) return [];
  try {
    return normalise((await provider.request({ method: 'eth_accounts' })) as unknown[]);
  } catch {
    return [];
  }
}

export interface ResolvedSigner {
  /** The address to put in the login message and ask the wallet to sign. */
  address: string;
  /** True when the wallet is holding something other than what we remembered. */
  corrected: boolean;
  /** What the wallet reported, for the log line. */
  live: string[];
}

/**
 * Reconcile the remembered address against the wallet's live accounts.
 *
 * When the wallet still holds the remembered one, nothing changes — the
 * overwhelmingly common case, and no prompt is raised either way. When it does
 * not, the wallet's own first account wins: it is the account the user picked
 * in their wallet, which is a far better guess at what they meant than an
 * address this tab wrote down some minutes ago.
 */
export async function resolveSigningAccount(
  connector: AccountConnectorLike | null | undefined,
  remembered: string,
): Promise<ResolvedSigner> {
  const fallback = remembered.toLowerCase();
  const live = await readLiveAccounts(connector);
  if (!live.length) return { address: fallback, corrected: false, live };
  if (live.includes(fallback)) return { address: fallback, corrected: false, live };
  return { address: live[0], corrected: true, live };
}

/** MetaMask returns the granted accounts inside the permission's caveats. */
function accountsFromPermissions(result: unknown): string[] {
  if (!Array.isArray(result)) return [];
  const out: string[] = [];
  for (const permission of result as any[]) {
    for (const caveat of (permission?.caveats ?? []) as any[]) {
      if (Array.isArray(caveat?.value)) out.push(...normalise(caveat.value));
    }
  }
  return out;
}

/**
 * Open the wallet's own account picker and return what came back.
 *
 * `wallet_requestPermissions` is the only way to make a wallet re-ask which
 * accounts a site may see; a plain `eth_requestAccounts` on an already-approved
 * site returns the same account silently, which is what made "try again" feel
 * like the app was ignoring the user.
 *
 * Returns null when the picker was dismissed or the wallet has no such thing —
 * both mean "carry on with what we had", never an error to show.
 */
export async function requestAccountPicker(
  connector: AccountConnectorLike | null | undefined,
): Promise<string | null> {
  const provider = await providerOf(connector);
  if (!provider) return null;

  try {
    const granted = accountsFromPermissions(
      await provider.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      }),
    );
    if (granted.length) return granted[0];
  } catch (error) {
    const { codes } = describe(error);
    // 4001 — dismissed. Anything else means the wallet does not implement the
    // method (Phantom, older Trust), so fall through and at least re-ask.
    if (codes.includes(4001)) return null;
  }

  try {
    const accounts = normalise((await provider.request({ method: 'eth_requestAccounts' })) as unknown[]);
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}
