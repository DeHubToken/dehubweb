/**
 * Account Abstraction Utilities
 * =============================
 * AA-aware contract write helper that handles both:
 * - Web3Auth smart accounts (AA via Pimlico)
 * - EOA wallets (direct ethers calls)
 * Supports multi-chain (Base and BNB).
 */

import { Interface, parseUnits, formatUnits } from 'ethers';
import { createPublicClient, fallback, http } from 'viem';
import { setupAAProviderForChain, setupAAProvider, getOrInitWeb3Auth } from '@/lib/web3auth';
import { getAccount, watchAccount } from '@wagmi/core';
import { sendTransaction, waitForTransactionReceipt, switchChain as wagmiSwitchChain } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { isSmartWalletSession } from '@/lib/connection-source';
import { requestSessionWalletConnect, waitForSessionWalletConnect } from '@/lib/wallet-reconnect';
import { receiptRpcUrls, waitForSubmittedReceipt } from '@/lib/transaction-receipt';
import { prepareWalletRelay } from '@/lib/wallet-relay';
import type { ChainId } from '@/components/app/ChainSelector';
import { CHAIN_CONFIGS, BASE_CHAIN_ID, initChainRpcUrls } from './dhb-token';
import { createLogger } from '@/lib/logger';
import { userOperationErrorDetail, userOperationValidationMessage } from '@/lib/user-operation-error';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import {
  WALLET_LOCKED_ERROR_CODE,
  WALLET_NOT_CONNECTED_ERROR_CODE,
  isWalletConnectRequiredError,
  isWalletLockedError,
  looksLikePausedRevert,
  parseTxError,
} from './tx-errors';

export {
  WALLET_LOCKED_ERROR_CODE,
  WALLET_NOT_CONNECTED_ERROR_CODE,
  isWalletConnectRequiredError,
  isWalletLockedError,
  looksLikePausedRevert,
  parseTxError,
};

// Hex type for AA transactions
type Hex = `0x${string}`;

/**
 * Nothing can sign right now — say which kind of nothing it is.
 *
 * For a built-in-wallet session this is the ordinary case rather than a
 * failure: the key only ever lives in memory, so it is absent after every
 * reload, after every auto-lock, and — since login stopped unlocking the
 * wallet on the way in — for most of a normal session. Telling someone who is
 * demonstrably signed in to sign in is what turned this into support tickets.
 *
 * An external-wallet session with a live DeHub token is the same mistake one
 * layer over: the email-link login establishes the full session with no
 * wallet attached (completeLoginWithoutUnlock tags it 'wagmi'), so "sign in
 * first" is told to someone who is signed in, on a browser where nothing
 * offers a way to connect the wallet. Only with no session at all is signing
 * in actually the answer.
 */
function hasDeHubSession(): boolean {
  try {
    return !!localStorage.getItem('dehub_wallet');
  } catch {
    return false;
  }
}

function noSigningProviderMessage(): string {
  if (isSmartWalletSession()) return 'Your wallet is locked. Please unlock it and try again.';
  return hasDeHubSession()
    ? 'Connect the wallet linked to this account to continue.'
    : 'No wallet connected. Please sign in first.';
}

/**
 * As above, and additionally ask the auth provider to open the unlock dialog.
 *
 * This is the default for anything that cannot proceed without a signature,
 * including the address reads: posting resolves the minter address through
 * getWalletAddress (via the getWeb3AuthSigner alias) BEFORE it ever reaches
 * writeContractAA, and going live, tipping, paywalls and fee gates all do the
 * same. A message with no dialog behind it is a dead end — the user is told the
 * wallet is locked and given nothing to press, which is precisely the state
 * this codebase shipped and had to be reported by hand.
 *
 * The opt-out exists for genuinely passive reads (see the silent option on
 * getWalletAddress), because a password sheet must never appear just because
 * someone opened a page.
 */
function requestUnlockForSigning(): Error {
  const locked = isSmartWalletSession();
  const needsWalletConnect = !locked && hasDeHubSession();
  if (locked) {
    window.dispatchEvent(new Event('dehub:wallet-unlock-required'));
  } else if (needsWalletConnect) {
    requestSessionWalletConnect();
  }
  const err = new Error(noSigningProviderMessage()) as Error & { code?: string };
  // The message alone was never enough to tell this apart from a real failure.
  // It travels through parseTxError, through viem wrappers, and through every
  // caller's own catch, and each one re-words it — so by the time it reached
  // the screen a locked wallet was indistinguishable from a reverted
  // transaction. People were told "Transaction failed" at the exact moment the
  // password sheet appeared: nothing had failed, and the toast told them to
  // stop. A code survives all of that. isWalletLockedError is its only reader.
  if (locked) err.code = WALLET_LOCKED_ERROR_CODE;
  if (needsWalletConnect) err.code = WALLET_NOT_CONNECTED_ERROR_CODE;
  return err;
}


/** A persisted address is not a signing connection until reconnect completes. */
async function waitForExternalWalletConnection(): Promise<void> {
  const pending = () => {
    const { status } = getAccount(wagmiConfig);
    return status === 'connecting' || status === 'reconnecting';
  };
  if (!pending()) return;

  const address = localStorage.getItem('dehub_wallet');
  await new Promise<void>((resolve, reject) => {
    let unwatch = () => {};
    const finish = () => {
      clearTimeout(timer);
      unwatch();
      if (address !== localStorage.getItem('dehub_wallet')) {
        reject(requestUnlockForSigning());
      } else resolve();
    };
    const timer = setTimeout(() => finish(), 15_000);
    unwatch = watchAccount(wagmiConfig, {
      onChange: () => { if (!pending()) finish(); },
    });
    if (!pending()) finish();
  });
}

/**
 * Get the active EIP-1193 provider - Web3Auth (social login) or wagmi (wallet).
 * For external wallets, provider is null -- callers use wagmi actions or public RPC instead.
 */
export async function getActiveProvider(
  chainId: number = BASE_CHAIN_ID,
  options?: { sponsored?: boolean },
): Promise<{ provider: any; isWeb3Auth: boolean }> {
  if (isSmartWalletSession()) {
    const { ensureWalletUnlocked } = await import('@/lib/smart-wallet');
    await ensureWalletUnlocked();
    // Never substitute Base or the owner EOA for the requested Safe signer.
    const provider = chainId === BASE_CHAIN_ID && options?.sponsored !== false
      ? await setupAAProvider()
      : options?.sponsored === false
        ? await setupAAProviderForChain(chainId, { sponsored: false })
        : await setupAAProviderForChain(chainId);
    if (!provider) throw new Error(`NO_SIGNER_ON_CHAIN:${chainId}`);
    const actualChain = await provider.request({ method: 'eth_chainId' }) as string;
    if (Number(BigInt(actualChain)) !== chainId) throw new Error(`NO_SIGNER_ON_CHAIN:${chainId}`);
    return { provider, isWeb3Auth: true };
  }
  await waitForExternalWalletConnection();
  let account = getAccount(wagmiConfig);
  const expectedAddress = localStorage.getItem('dehub_wallet');
  if (hasDeHubSession() && (!account.address || !account.isConnected
    || account.address.toLowerCase() !== expectedAddress?.toLowerCase())) {
    await waitForSessionWalletConnect();
    account = getAccount(wagmiConfig);
  }
  if (account.address && account.isConnected) {
    const sessionAddress = localStorage.getItem('dehub_wallet');
    if (sessionAddress && account.address.toLowerCase() !== sessionAddress.toLowerCase()) {
      throw new Error('Connect the wallet linked to this account to continue.');
    }
    return { provider: null, isWeb3Auth: false };
  }
  throw requestUnlockForSigning();
}

/**
 * Get RPC URL for a given chain ID
 */
function getRpcUrl(chainId?: number): string {
  const cid = chainId || BASE_CHAIN_ID;
  const chainConfig = CHAIN_CONFIGS[cid];
  return chainConfig?.rpcUrl || 'https://base-rpc.publicnode.com';
}

/**
 * Make a JSON-RPC call to a public RPC endpoint (no wallet needed)
 */
async function publicRpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<any> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const result = await response.json();
  if (result.error) {
    throw Object.assign(new Error(result.error.message || JSON.stringify(result.error)), { data: result.error.data });
  }
  return result.result;
}

/**
 * Switch the wallet to a different chain
 */
export async function switchChain(chainId: ChainId): Promise<void> {
  const { isWeb3Auth } = await getActiveProvider(chainId);
  if (isWeb3Auth) return;
  await initChainRpcUrls();
  const account = getAccount(wagmiConfig);
  const connector = account.connector;
  if (!connector) throw requestUnlockForSigning();
  // The wallet's chain is authoritative; its change event can lag behind the
  // switch response and leave wagmi's cached account on the previous network.
  if (await connector.getChainId() === chainId) return;
  await prepareWalletRelay(await connector.getProvider());
  await wagmiSwitchChain(wagmiConfig, { chainId: chainId as any, connector });
  if (await connector.getChainId() !== chainId) {
    throw new Error(_translateCopy("copy.d5047f2d13d2", { defaultValue: "The wallet did not change networks. Reconnect it and try again." }));
  }
}

/**
 * Make sure whatever is about to sign is actually on `chainId`, or throw.
 *
 * Smart wallets prepare a signer for that chain; external wallets prompt for
 * a network change. All shared senders enforce this before sending.
 */
export async function ensureSignerOnChain(chainId: ChainId): Promise<void> {
  await switchChain(chainId);
}

/**
 * Check if the current session is a Web3Auth embedded wallet (smart account)
 * vs an external EOA wallet
 */
export async function isSmartAccountSession(): Promise<boolean> {
  try {
    const web3auth = await getOrInitWeb3Auth();
    const userInfo = await web3auth.getUserInfo();
    const info = userInfo as Record<string, unknown>;

    // Social logins have user info, external wallets don't
    return !!(info && (
      info.email ||
      info.name ||
      info.verifier ||
      info.typeOfLogin ||
      info.idToken
    ));
  } catch {
    return false;
  }
}

/**
 * Get the address that would sign right now.
 *
 * Almost every caller is the first step of something the user just asked for —
 * posting (via the getWeb3AuthSigner alias), going live, tipping, a paywall, a
 * fee gate — so a locked built-in wallet raises the unlock dialog by default.
 * Getting that wrong is not a cosmetic failure: this read runs before any
 * signing path, so when it stayed silent the user got "your wallet is locked"
 * with nothing to press and no way to continue.
 *
 * Pass `{ silent: true }` only where nobody asked for anything — a mount effect
 * populating a query filter, or a spot that has already prompted (see
 * writeContractAA). Callers that opt out must handle the rejection; an
 * unhandled one is how a passive read becomes a console error.
 */
export async function getWalletAddress(opts?: { silent?: boolean }): Promise<string> {
  if (opts?.silent) {
    // Public balance/history reads need the session address, never a decrypted key.
    const address = localStorage.getItem('dehub_wallet');
    if (address) return address;
    if (!isSmartWalletSession()) {
      const account = getAccount(wagmiConfig);
      if (account.address) return account.address;
    }
    throw new Error(noSigningProviderMessage());
  }
  const { provider, isWeb3Auth } = await getActiveProvider(BASE_CHAIN_ID);
  if (!isWeb3Auth) return getAccount(wagmiConfig).address!;
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
  if (accounts?.length) return accounts[0];
  throw new Error(_translateCopy("copy.eea1874693b0", { defaultValue: "Could not read your wallet address. Please try again." }));
}

/**
 * Convert value to hex string
 */
function toHex(value: string | number | bigint | undefined): Hex | undefined {
  if (value === undefined || value === null) return undefined;
  const bn = BigInt(value);
  if (bn === BigInt(0)) return '0x0' as Hex;
  return `0x${bn.toString(16)}` as Hex;
}

/**
 * Apply a 30% gas margin for safety
 */
function applyGasMargin(gasEstimate: bigint): bigint {
  return (gasEstimate * BigInt(130)) / BigInt(100);
}


/**
 * Result type for AA write operations
 */
export interface AAWriteResult {
  hash: string;
  wait: (confirmations?: number) => Promise<{ status: number; hash: string; receipt?: unknown }>;
}

/**
 * Generic AA-aware contract write helper
 *
 * For smart accounts (Web3Auth social login):
 * - Encodes calldata and sends via eth_sendTransaction through Web3Auth provider
 * - The AA provider handles bundler/paymaster internally
 *
 * For EOA wallets (wagmi/external):
 * - Uses wagmi's sendTransaction to properly route through the wallet connector
 * - Gas estimation uses public RPC (no wallet needed for reads)
 */
export async function writeContractAA(
  contractAddress: string,
  contractInterface: Interface,
  functionName: string,
  args: unknown[],
  options?: {
    value?: string | number | bigint;
    gasLimit?: string | number | bigint;
    context?: string;
    chainId?: number;
    calldata?: Hex;
  }
): Promise<AAWriteResult> {
  await ensureSignerOnChain((options?.chainId ?? BASE_CHAIN_ID) as ChainId);
  const { provider, isWeb3Auth } = await getActiveProvider(options?.chainId);
  const context = options?.context || 'send transaction';

  // Encode the function call
  const data = options?.calldata ?? contractInterface.encodeFunctionData(functionName, args) as Hex;
  // getActiveProvider above has already raised the unlock request if one was
  // needed, so this read must not raise a second one.
  const fromAddress = isWeb3Auth
    ? (await provider.request({ method: 'eth_accounts' }) as string[])[0]
    : getAccount(wagmiConfig).address;

  // The AA provider estimates the complete user operation in its bundler.
  // eth_estimateGas falls through to the owner EOA middleware and can stall
  // on its RPC before the smart-account send is ever reached.
  let gasLimit: Hex | undefined;
  let gasLimitBigInt: bigint | undefined;
  if (!isWeb3Auth) {
    try {
      const gasEstimate = await publicRpcCall(getRpcUrl(options?.chainId), 'eth_estimateGas', [{
        from: fromAddress, to: contractAddress, data, value: toHex(options?.value ?? 0),
      }]);
      gasLimitBigInt = applyGasMargin(BigInt(gasEstimate));
      gasLimit = toHex(gasLimitBigInt);
    } catch (estimateError: any) {
      const message = (estimateError?.message || estimateError?.error?.message || '').toLowerCase();
      if (message.includes('insufficient funds') || message.includes('insufficient balance') ||
          message.includes('gas required exceeds allowance')) throw new Error('INSUFFICIENT_GAS_FUNDS');
      // The token itself says the wallet is short (OpenZeppelin's message or
      // its ERC20InsufficientBalance error). Sending anyway gave the wallet a
      // hash for a transfer that could never land, and staking then waited on it.
      const revertData = String(estimateError?.data ?? '').toLowerCase();
      if (message.includes('exceeds balance') || revertData.startsWith('0xe450d38c')) {
        throw new Error('INSUFFICIENT_TOKEN_BALANCE');
      }
      console.warn('[AA] Gas estimation failed, using default:', estimateError);
      gasLimitBigInt = BigInt(500_000);
      gasLimit = toHex(gasLimitBigInt);
    }
  }

  console.log(`[AA] Sending transaction to ${contractAddress}:`, {
    function: functionName,
    gasLimit,
    hasValue: !!options?.value,
    isWeb3Auth,
  });

  try {
    let txHash: string;

    if (isWeb3Auth) {
      // Web3Auth EIP-1193 provider -- raw request works because it handles signing internally
      // IMPORTANT: value must always be present (even as '0x0') because the AA provider's
      // processTransaction does BigInt(value) unconditionally — BigInt(undefined) throws.
      const txParams: Record<string, unknown> = {
        from: fromAddress,
        to: contractAddress,
        data,
        value: options?.value && BigInt(options.value) > BigInt(0)
          ? toHex(options.value)
          : '0x0',
      };

      // Never retry a failed Safe send through its owner EOA.
      txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      }) as string;
    } else {
      // External wallet via wagmi -- use wagmi's sendTransaction
      // which properly routes through the wallet connector for signing
      const connector = getAccount(wagmiConfig).connector;
      if (!connector) throw requestUnlockForSigning();
      await prepareWalletRelay(await connector.getProvider());
      txHash = await sendTransaction(wagmiConfig, {
        connector,
        account: fromAddress as Hex,
        to: contractAddress as `0x${string}`,
        data: data as `0x${string}`,
        gas: gasLimitBigInt,
        value: options?.value ? BigInt(options.value) : undefined,
        chainId: (options?.chainId ?? BASE_CHAIN_ID) as any,
      });
    }

    console.log('[AA] Transaction submitted:', txHash);

    // Return a result object with wait function
    return {
      hash: txHash,
      wait: async (confirmations = 1) => {
        const chainId = options?.chainId ?? BASE_CHAIN_ID;
        const transports = receiptRpcUrls(chainId, getRpcUrl(chainId)).map(url => http(url, { timeout: 8000, retryCount: 0 }));
        const clients = transports.map(transport => createPublicClient({ transport }));
        const receiptClient = createPublicClient({
          transport: fallback(transports, { retryCount: 0 }),
        });
        const receipt = await waitForSubmittedReceipt(
          txHash,
          async () => {
            let cancelled = false;
            const parameters = {
              hash: txHash as Hex, confirmations, timeout: 60_000,
              onReplaced: ({ reason }: { reason: string }) => { cancelled = reason === 'cancelled'; },
            };
            const found = isWeb3Auth
              ? await receiptClient.waitForTransactionReceipt(parameters)
              : await waitForTransactionReceipt(wagmiConfig, { ...parameters, chainId: chainId as any });
            if (cancelled) throw Object.assign(new Error('Transaction cancelled in your wallet.'), {
              code: 'TRANSACTION_REPLACED', cancelled: true,
            });
            return found;
          },
          clients.map(client => async () => {
            const found = await client.getTransactionReceipt({ hash: txHash as Hex });
            if (confirmations > 1 && await client.getBlockNumber() < found.blockNumber + BigInt(confirmations - 1)) return null;
            return found;
          }),
        );
        return { status: receipt.status === 'success' ? 1 : 0, hash: receipt.transactionHash, receipt };
      },
    };
  } catch (sendError) {
    console.error('[AA] Transaction failed:', sendError);
    throw new Error(parseTxError(sendError, context));
  }
}

/** One call inside a batched user operation. */
export interface AABatchCall {
  to: string;
  data: Hex;
  value?: bigint;
}

export const SELF_FUNDED_GAS_INSUFFICIENT = 'SELF_FUNDED_GAS_INSUFFICIENT';

export function isSelfFundedGasInsufficientError(error: unknown): boolean {
  return error instanceof Error && error.message === SELF_FUNDED_GAS_INSUFFICIENT;
}

/**
 * Send several calls as ONE sponsored transaction.
 *
 * A Safe smart account executes a list of calls atomically, which is what lets
 * a mint fee ride along with the mint itself: one signature, one sponsored
 * transaction, and no fee-aware `mint` on the collection contract. A plain
 * ERC-20 transfer out of the account needs no `approve` either, because the
 * account is moving its own tokens rather than being pulled from.
 *
 * The EIP-1193 surface cannot express this — the provider's processTransaction
 * builds `calls` with exactly one entry — so this drops to the bundler client
 * underneath it, in the same shape the provider uses. Both are public getters.
 *
 * Smart-account sessions only. An external wallet has no bundler and no batch;
 * callers must fall back to sending the calls separately, and in practice do
 * not need to, because external wallets pay their own gas and are not charged
 * a fee at all.
 */
export async function writeBatchAA(
  calls: AABatchCall[],
  options?: { context?: string; chainId?: number; sponsored?: boolean },
): Promise<AAWriteResult> {
  const context = options?.context || 'send transaction';
  if (!calls.length) throw new Error('writeBatchAA called with no calls');
  const { provider: aaProvider } = await getActiveProvider(options?.chainId, {
    sponsored: options?.sponsored,
  });

  const bundlerClient = aaProvider?.bundlerClient;
  const smartAccount = aaProvider?.smartAccount;
  if (!bundlerClient || !smartAccount) {
    // Not a "locked wallet" case — batching is structurally unavailable here,
    // so raising the unlock dialog would ask for a password that cannot help.
    throw new Error('BATCH_UNSUPPORTED');
  }

  console.log('[AA] Sending batched user operation:', {
    calls: calls.length,
    to: calls.map(c => c.to),
    chainId: options?.chainId,
  });

  let phase = 'submission';
  try {
    // Same shape as the provider's own single-call path; viem's types here are
    // too deep to name, which is why that path casts as well.
    const userOpHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: calls.map(c => ({ to: c.to, value: c.value ?? BigInt(0), data: c.data })),
    } as any);
    phase = 'receipt';

    // The bundler resolves a userOp hash to a transaction hash only once it is
    // mined, so unlike the EOA path there is no hash to hand back before then.
    const receiptPromise = bundlerClient
      .waitForUserOperationReceipt({ hash: userOpHash })
      .then((r: any) => {
        if (!r?.success) throw new Error(r?.reason || 'User operation reverted');
        return r.receipt.transactionHash as string;
      });

    const txHash = await receiptPromise;
    console.log('[AA] Batched user operation confirmed:', txHash);

    return {
      hash: txHash,
      wait: async () => ({ status: 1, hash: txHash }),
    };
  } catch (sendError) {
    createLogger('AABatch').error('Batched user operation failed', {
      context, chainId: options?.chainId, sponsored: options?.sponsored !== false,
      phase, detail: userOperationErrorDetail(sendError),
    });
    if (options?.sponsored === false && phase === 'submission') {
      const lower = userOperationErrorDetail(sendError).toLowerCase();
      if (
        lower.includes('aa21') ||
        lower.includes('prefund') ||
        lower.includes('insufficient funds') ||
        lower.includes('insufficient balance')
      ) {
        throw new Error(SELF_FUNDED_GAS_INSUFFICIENT);
      }
    }
    console.error('[AA] Batched user operation failed:', sendError);
    throw new Error(parseTxError(sendError, context));
  }
}

/**
 * Make a raw JSON-RPC request against the chain's public RPC (no wallet needed).
 * Used for methods that aren't plain eth_call, e.g. eth_getLogs.
 */
export async function rpcRequest<T = unknown>(
  method: string,
  params: unknown[],
  chainId?: ChainId
): Promise<T> {
  await initChainRpcUrls();
  return publicRpcCall(getRpcUrl(chainId), method, params);
}

/**
 * Make a read-only contract call (uses public RPC -- no wallet needed)
 */
export async function readContract<T>(
  contractAddress: string,
  contractInterface: Interface,
  functionName: string,
  args: unknown[] = [],
  chainId?: ChainId
): Promise<T> {
  await initChainRpcUrls();
  const data = contractInterface.encodeFunctionData(functionName, args);
  const rpcUrl = getRpcUrl(chainId);

  const result = await publicRpcCall(rpcUrl, 'eth_call', [
    { to: contractAddress, data },
    'latest',
  ]);

  const decoded = contractInterface.decodeFunctionResult(functionName, result);
  return decoded[0] as T;
}

/**
 * As `readContract`, but hands back every return value rather than the first.
 *
 * Needed for getters that return a struct as a flat tuple — `readContract`
 * silently drops everything after `[0]`, which for a six-field plan record
 * means you get the id and none of the price.
 */
export async function readContractAll<T extends readonly unknown[]>(
  contractAddress: string,
  contractInterface: Interface,
  functionName: string,
  args: unknown[] = [],
  chainId?: ChainId
): Promise<T> {
  await initChainRpcUrls();
  const data = contractInterface.encodeFunctionData(functionName, args);
  const rpcUrl = getRpcUrl(chainId);

  const result = await publicRpcCall(rpcUrl, 'eth_call', [
    { to: contractAddress, data },
    'latest',
  ]);

  return contractInterface.decodeFunctionResult(functionName, result) as unknown as T;
}


/**
 * Check if the DHB token is currently paused on-chain.
 * Returns false if the call fails (safe default — don't block UI on RPC errors).
 */
export async function checkDHBPaused(chainId?: ChainId): Promise<boolean> {
  try {
    const config = CHAIN_CONFIGS[chainId ?? BASE_CHAIN_ID];
    if (!config?.dhbToken) return false;
    const pausableInterface = new Interface(['function paused() view returns (bool)']);
    return await readContract<boolean>(config.dhbToken, pausableInterface, 'paused', [], chainId);
  } catch {
    return false;
  }
}

/**
 * ERC20 approval helper for AA
 */
export async function approveERC20(
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  chainId?: ChainId
): Promise<AAWriteResult> {
  const erc20Interface = new Interface([
    'function approve(address spender, uint256 amount) returns (bool)',
  ]);

  console.log(`[AA] Approving ${amount} tokens for ${spenderAddress} on chain ${chainId ?? 'default'}`);

  return writeContractAA(
    tokenAddress,
    erc20Interface,
    'approve',
    [spenderAddress, amount],
    { context: 'token approval', chainId }
  );
}

/**
 * Get ERC20 token balance
 */
export async function getERC20Balance(
  tokenAddress: string,
  ownerAddress: string,
  chainId?: ChainId
): Promise<bigint> {
  const erc20Interface = new Interface([
    'function balanceOf(address owner) view returns (uint256)',
  ]);

  return readContract<bigint>(tokenAddress, erc20Interface, 'balanceOf', [ownerAddress], chainId);
}

/**
 * Read an ERC20 balance until it reaches `atLeast`, or give up.
 *
 * A confirmed transaction does not mean the next `eth_call` sees it: reads go
 * through a load-balanced public RPC, and a node one block behind reports the
 * old balance. Acting on that is worse than waiting — a swap that "didn't
 * arrive" gets bought a second time with the user's own money. Returns the
 * last balance read either way, so the caller still decides what to do.
 */
export async function waitForERC20Balance(
  tokenAddress: string,
  ownerAddress: string,
  atLeast: bigint,
  chainId?: ChainId,
  attempts = 6,
  delayMs = 1500,
): Promise<bigint> {
  let balance = BigInt(0);
  for (let attempt = 0; attempt < attempts; attempt++) {
    balance = await getERC20Balance(tokenAddress, ownerAddress, chainId).catch(() => balance);
    if (balance >= atLeast) return balance;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return balance;
}

/**
 * Get ERC20 token allowance
 */
export async function getERC20Allowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  chainId?: ChainId
): Promise<bigint> {
  const erc20Interface = new Interface([
    'function allowance(address owner, address spender) view returns (uint256)',
  ]);

  return readContract<bigint>(
    tokenAddress,
    erc20Interface,
    'allowance',
    [ownerAddress, spenderAddress],
    chainId
  );
}
