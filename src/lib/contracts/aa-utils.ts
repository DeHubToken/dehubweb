/**
 * Account Abstraction Utilities
 * =============================
 * AA-aware contract write helper that handles both:
 * - Web3Auth smart accounts (AA via Pimlico)
 * - EOA wallets (direct ethers calls)
 * Supports multi-chain (Base and BNB).
 */

import { Interface, parseUnits, formatUnits } from 'ethers';
import { getWeb3AuthProvider, getAAProvider, getAAProviderForChain, setupAAProviderForChain, setupAAProvider, setAAProvider, getOrInitWeb3Auth, refreshWeb3AuthProvider } from '@/lib/web3auth';
import { getAccount } from '@wagmi/core';
import { sendTransaction, waitForTransactionReceipt, switchChain as wagmiSwitchChain } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { isSmartWalletSession } from '@/lib/connection-source';
import type { ChainId } from '@/components/app/ChainSelector';
import { CHAIN_CONFIGS, BASE_CHAIN_ID, BNB_CHAIN_ID, initChainRpcUrls } from './dhb-token';

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
 * For an external wallet it really is a dropped connection, and the caller's
 * own recovery (silent reconnect, then logout) is the right handler.
 */
function noSigningProviderMessage(): string {
  return isSmartWalletSession()
    ? 'Your wallet is locked. Please unlock it and try again.'
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
  if (isSmartWalletSession()) {
    window.dispatchEvent(new Event('dehub:wallet-unlock-required'));
  }
  return new Error(noSigningProviderMessage());
}

/**
 * Get the active EIP-1193 provider - Web3Auth (social login) or wagmi (wallet).
 * For external wallets, provider is null -- callers use wagmi actions or public RPC instead.
 */
async function getActiveProvider(chainId?: number): Promise<{ provider: any; isWeb3Auth: boolean }> {
  // Prefer chain-specific AA provider (e.g. BNB) if chainId provided
  if (chainId !== undefined) {
    const chainAA = getAAProviderForChain(chainId);
    if (chainAA) return { provider: chainAA, isWeb3Auth: true };
  }
  // Prefer default AA provider (Base Smart Account, set after social login)
  const aaProvider = getAAProvider();
  if (aaProvider) return { provider: aaProvider, isWeb3Auth: true };

  // Check wagmi (external wallet) BEFORE falling back to raw Web3Auth provider.
  // External wallets use their own popups — that's expected and correct.
  //
  // Only trust this for sessions that aren't backed by the built-in smart wallet.
  // wagmi auto-reconnects on its own (reconnectOnMount), independent of DeHub's
  // login method — a browser extension authorized in an earlier, unrelated
  // session can report isConnected/reconnecting even though the current user
  // logged in with email/social. Routing a smart-wallet session through wagmi
  // here is exactly what pops the real "pay gas" wallet prompt for a user whose
  // posts should be gasless via the AA/Pimlico path.
  if (!isSmartWalletSession()) {
    const account = getAccount(wagmiConfig);
    if (account.address && (account.isConnected || account.status === 'reconnecting')) {
      return { provider: null, isWeb3Auth: false };
    }
  }

  // Web3Auth is connected but AA provider not set up yet (page restore race condition or
  // AA setup failed). Always try on-demand AA setup — the raw modal provider would route
  // through WalletServices which shows an ETH gas popup and requires ETH balance.
  // On-demand AA uses Pimlico paymaster so gas is sponsored (no ETH needed).
  const web3authProvider = getWeb3AuthProvider();
  if (web3authProvider) {
    try {
      console.log('[AA] AA provider missing — setting up on-demand...');
      const onDemandAA = await setupAAProvider(web3authProvider);
      if (onDemandAA) {
        setAAProvider(onDemandAA);
        console.log('[AA] On-demand AA provider ready');
        return { provider: onDemandAA, isWeb3Auth: true };
      }
    } catch (e) {
      console.warn('[AA] On-demand AA setup failed, falling back to raw provider:', e);
    }
    // AA setup failed — fall back to raw provider (will show WalletServices popup)
    return { provider: web3authProvider, isWeb3Auth: true };
  }

  // Last resort: restore the smart-wallet key session (page refresh in-tab)
  try {
    const w3a = await getOrInitWeb3Auth();
    if (w3a.connected && w3a.provider) {
      console.log('[AA] Restored wallet session — setting up AA on-demand...');
      const onDemandAA = await setupAAProvider(w3a.provider);
      if (onDemandAA) {
        setAAProvider(onDemandAA);
        return { provider: onDemandAA, isWeb3Auth: true };
      }
      return { provider: w3a.provider, isWeb3Auth: true };
    }
  } catch { /* ignore */ }

  throw requestUnlockForSigning();
}

/**
 * Convert chain ID to hex format
 */
function chainIdToHex(chainId: ChainId): Hex {
  return `0x${chainId.toString(16)}` as Hex;
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
    throw new Error(result.error.message || JSON.stringify(result.error));
  }
  return result.result;
}

/**
 * Switch the wallet to a different chain
 */
export async function switchChain(chainId: ChainId): Promise<void> {
  // Ensure we have Alchemy RPC URLs before switching
  await initChainRpcUrls();

  const { provider, isWeb3Auth } = await getActiveProvider(chainId);

  const chainConfig = CHAIN_CONFIGS[chainId];
  if (!chainConfig) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  // External wallet: use wagmi's switchChain action
  if (!isWeb3Auth) {
    try {
      await wagmiSwitchChain(wagmiConfig, { chainId: chainId as any });
      console.log('[AA] Switched chain via wagmi:', chainConfig.name);
      return;
    } catch (error) {
      console.warn('[AA] wagmi switchChain failed:', error);
      // Wagmi config only has Base -- if already on Base, ignore
      if (chainId === BASE_CHAIN_ID) return;
      throw new Error(`Please switch to ${chainConfig.name} network in your wallet app.`);
    }
  }

  // Web3Auth path: use raw provider.request
  const targetChainHex = chainIdToHex(chainId);

  // 1. Check current chain -- skip if already correct
  try {
    const currentChainHex = await provider.request({ method: 'eth_chainId' }) as string;
    if (parseInt(currentChainHex, 16) === chainId) {
      console.log('[AA] Already on correct chain:', chainConfig.name);
      return;
    }
  } catch {
    // If we can't check, proceed with switch attempt
  }

  // 2. Try switching with retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainHex }],
      });
      console.log('[AA] Switched to chain:', chainConfig.name);
      return;
    } catch (switchError: any) {
      const code = switchError?.code ?? switchError?.data?.code;

      // Chain not added -- try adding it
      if (code === 4902 || switchError?.message?.includes('Unrecognized chain')) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: targetChainHex,
              chainName: chainConfig.name,
              nativeCurrency: {
                name: chainId === BNB_CHAIN_ID ? 'BNB' : 'ETH',
                symbol: chainId === BNB_CHAIN_ID ? 'BNB' : 'ETH',
                decimals: 18,
              },
              rpcUrls: [chainConfig.rpcUrl],
              blockExplorerUrls: [chainConfig.explorerUrl],
            }],
          });
          console.log('[AA] Added and switched to chain:', chainConfig.name);
          return;
        } catch (addError) {
          console.error('[AA] Failed to add chain:', addError);
          throw new Error(`Failed to add ${chainConfig.name} network to wallet`);
        }
      }

      // Method not supported — AA provider is single-chain; set up a chain-specific one
      if (code === -32601 || code === -32603 ||
        switchError?.message?.includes('does not exist')) {
        console.warn('[AA] wallet_switchEthereumChain not supported, setting up chain-specific AA provider...');
        try {
          const chainAA = await setupAAProviderForChain(chainId);
          if (chainAA) {
            console.log('[AA] Chain-specific AA provider ready for', chainConfig.name);
            return; // getActiveProvider(chainId) will now return this provider
          }
        } catch (e) {
          console.warn('[AA] Chain-specific AA setup failed:', e);
        }
        throw new Error(
          `Please switch to ${chainConfig.name} network in your wallet app and try again.`
        );
      }

      // Transient error on first attempt -- retry
      if (attempt === 0) {
        console.warn('[AA] Chain switch attempt failed, retrying...', switchError);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      console.error('[AA] Failed to switch chain:', switchError);
      throw new Error(`Failed to switch to ${chainConfig.name} network`);
    }
  }
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
  // Prefer AA provider (Smart Account address)
  const aaProvider = getAAProvider();
  if (aaProvider) {
    const accounts = await aaProvider.request({ method: 'eth_accounts' }) as string[];
    if (accounts?.length) return accounts[0];
  }

  // Fall back to raw Web3Auth EOA provider
  const web3authProvider = getWeb3AuthProvider();
  if (web3authProvider) {
    const accounts = await web3authProvider.request({ method: 'eth_accounts' }) as string[];
    if (accounts?.length) return accounts[0];
  }

  // Fall back to wagmi -- same guard as getActiveProvider: a smart-wallet
  // (social-login) session must never resolve to a stale, auto-reconnected
  // wagmi address just because the built-in wallet/AA provider isn't warmed
  // up yet. Falling through to requestUnlockForSigning below is correct here.
  if (!isSmartWalletSession()) {
    const account = getAccount(wagmiConfig);
    if (account.address) return account.address;
  }

  // Nothing in memory — but the unlock may just be sitting in the vault,
  // unread because this is the first signing attempt since a reload. Restoring
  // it costs one IDB read; NOT doing it is what made "post right after signup"
  // ask for the password a second time. Do this before any prompt.
  try {
    const w3a = await getOrInitWeb3Auth();
    if (w3a.connected && w3a.provider) {
      const accounts = await w3a.provider.request({ method: 'eth_accounts' }) as string[];
      if (accounts?.length) return accounts[0];
    }
  } catch { /* fall through to the prompt below */ }

  throw opts?.silent
    ? new Error(noSigningProviderMessage())
    : requestUnlockForSigning();
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

function tryDecodeHexReason(str: string): string {
  try {
    const matches = str.match(/0x[0-9a-fA-F]+/g);
    if (!matches) return '';
    let decodedConcat = '';
    for (const hex of matches) {
      let cleanHex = hex.slice(2);
      if (cleanHex.startsWith('08c379a0')) {
        cleanHex = cleanHex.slice(8);
      }
      let ascii = '';
      for (let i = 0; i < cleanHex.length; i += 2) {
        const charCode = parseInt(cleanHex.slice(i, i + 2), 16);
        if (charCode >= 32 && charCode <= 126) {
          ascii += String.fromCharCode(charCode);
        }
      }
      decodedConcat += ' ' + ascii;
    }
    return decodedConcat.trim();
  } catch {
    return '';
  }
}

/**
 * Parse transaction error into user-friendly message
 */
export function parseTxError(error: unknown, context: string = 'transaction'): string {
  // Extract message from nested error objects (viem/ethers/provider errors)
  let errorStr = '';
  if (error instanceof Error) {
    errorStr = error.message;
    // viem errors (UserOperationExecutionError etc.) carry the decoded revert reason in
    // .details (e.g. "STF") and .cause — check them too so we don't have to parse hex.
    const e = error as Record<string, any>;
    if (e.details) errorStr += '\n' + e.details;
    if (e.cause?.message) errorStr += '\n' + e.cause.message;
    if (e.cause?.reason) errorStr += '\n' + e.cause.reason;
    if (e.shortMessage) errorStr += '\n' + e.shortMessage;
  } else if (typeof error === 'string') {
    errorStr = error;
  } else if (error && typeof error === 'object') {
    const e = error as Record<string, any>;
    errorStr = e.message || e.shortMessage || e.reason ||
      e.error?.message || e.data?.message || e.details ||
      (() => { try { return JSON.stringify(error).slice(0, 300); } catch { return 'Unknown error'; } })();
  } else {
    errorStr = String(error);
  }

  // Try decoding any hex-encoded revert reasons (such as Pimlico / simulation revert hex)
  const decoded = tryDecodeHexReason(errorStr);
  if (decoded) {
    errorStr += '\nDecoded revert: ' + decoded;
  }

  const lowerError = errorStr.toLowerCase();

  if (lowerError.includes('user rejected') || lowerError.includes('user denied')) {
    return 'Transaction was rejected by user.';
  }
  if (lowerError.includes('paused') || lowerError.includes('erc20pausable')) {
    return 'DHB token transactions are currently paused on-chain.';
  }
  if (lowerError.includes('insufficient funds')) {
    return 'Insufficient funds for gas. Please add ETH to your wallet.';
  }
  // STF = SafeTransferFrom failure — ERC20 has no balance or missing approval.
  // Check before paymaster: UserOperationExecutionError includes "paymaster" in its request
  // body even when the real failure is a token transfer. Also check for hex-encoded revert
  // (ABI-encoded Error("STF") contains "535446" — hex of "STF").
  if (lowerError.includes('stf') || lowerError.includes('535446') ||
    lowerError.includes('safetransfer') || lowerError.includes('token transfer failed')) {
    return 'Token transfer failed. Please check your DHB balance and wallet approval.';
  }
  if (lowerError.includes('aa21') || lowerError.includes('aa25') || lowerError.includes('aa31') ||
    (lowerError.includes('paymaster') && !lowerError.includes('execution reverted'))) {
    return 'Gas sponsorship failed. Please add ETH to your wallet for gas fees.';
  }
  // Skip generic 'nonce' check — "nonce" appears in every UserOperation request body and
  // fires a false match. AA25 already covers the real invalid-nonce case above.
  if (lowerError.includes('gas')) {
    return 'Gas estimation failed. The transaction may revert.';
  }
  if (lowerError.includes('already minted') || lowerError.includes('token already exists')) {
    return 'This content has already been minted.';
  }
  if (lowerError.includes('invalid signature') || lowerError.includes('signer should sign')) {
    return 'Signature verification failed on-chain.';
  }
  if (lowerError.includes('unable to find matching address') || lowerError.includes('torus keyring') ||
    lowerError.includes('unknown account') ||
    lowerError.includes('session expired') || lowerError.includes('log in again to complete')) {
    return 'Session expired. Please log in again to complete this transaction.';
  }
  if (lowerError.includes('execution reverted')) {
    const match = errorStr.match(/reason="([^"]+)"/);
    if (match) return `Transaction reverted: ${match[1]}`;
    return 'Transaction reverted by the contract.';
  }

  if (context === 'approval') {
    return 'Token approval failed. Please try again.';
  }

  return `Failed to ${context}: ${errorStr.slice(0, 100)}`;
}

/**
 * Result type for AA write operations
 */
export interface AAWriteResult {
  hash: string;
  wait: (confirmations?: number) => Promise<{ status: number; hash: string }>;
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
  }
): Promise<AAWriteResult> {
  const { provider, isWeb3Auth } = await getActiveProvider(options?.chainId);
  const context = options?.context || 'send transaction';

  // Encode the function call
  const data = contractInterface.encodeFunctionData(functionName, args) as Hex;
  // getActiveProvider above has already raised the unlock request if one was
  // needed, so this read must not raise a second one.
  const fromAddress = await getWalletAddress({ silent: true });

  // Estimate gas
  let gasLimit: Hex | undefined;
  let gasLimitBigInt: bigint | undefined;
  try {
    let gasEstimate: string;

    if (isWeb3Auth) {
      // Web3Auth: use provider directly
      gasEstimate = await provider.request({
        method: 'eth_estimateGas',
        params: [{
          from: fromAddress,
          to: contractAddress,
          data,
          value: toHex(options?.value ?? 0),
        }],
      }) as string;
    } else {
      // External wallet: use public RPC for read-only gas estimation
      const rpcUrl = getRpcUrl(options?.chainId);
      gasEstimate = await publicRpcCall(rpcUrl, 'eth_estimateGas', [{
        from: fromAddress,
        to: contractAddress,
        data,
        value: toHex(options?.value ?? 0),
      }]);
    }

    const estimateBigInt = BigInt(gasEstimate);
    gasLimitBigInt = applyGasMargin(estimateBigInt);
    gasLimit = toHex(gasLimitBigInt);
  } catch (estimateError: any) {
    const estimateMsg = (estimateError?.message || estimateError?.error?.message || '').toLowerCase();
    // For external wallets (EOA), insufficient funds means the user genuinely cannot pay gas.
    // Throw immediately so the wallet popup never opens and the tx doesn't get stuck.
    if (!isWeb3Auth && (
      estimateMsg.includes('insufficient funds') ||
      estimateMsg.includes('insufficient balance') ||
      estimateMsg.includes('gas required exceeds allowance')
    )) {
      throw new Error('INSUFFICIENT_GAS_FUNDS');
    }
    console.warn('[AA] Gas estimation failed, using default:', estimateError);
    gasLimitBigInt = BigInt(500_000);
    gasLimit = toHex(gasLimitBigInt);
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
        gas: gasLimit,
        value: options?.value && BigInt(options.value) > BigInt(0)
          ? toHex(options.value)
          : '0x0',
      };

      const sendTx = async (p: any) => p.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      }) as Promise<string>;
      try {
        txHash = await sendTx(provider);
      } catch (firstErr: unknown) {
        const msg = String(firstErr).toLowerCase();
        const isSessionError = (
          msg.includes('unable to find matching address') ||
          msg.includes('torus keyring') ||
          msg.includes('unknown account')
        );
        if (isSessionError) {
          // The Torus key shard wasn't loaded after session restore — try re-initializing
          // the Web3Auth provider (keeps storage so session can be re-read from openlogin_* keys).
          console.warn('[AA] Provider session error - refreshing Web3Auth provider before retry...');
          const freshProvider = await refreshWeb3AuthProvider();
          if (freshProvider) {
            console.log('[AA] Provider refreshed, retrying transaction...');
            txHash = await sendTx(freshProvider);
          } else {
            // Session truly expired — tell user to log in again
            throw new Error('Session expired. Please log in again to complete this transaction.');
          }
        } else {
          throw firstErr;
        }
      }
    } else {
      // External wallet via wagmi -- use wagmi's sendTransaction
      // which properly routes through the wallet connector for signing
      txHash = await sendTransaction(wagmiConfig, {
        to: contractAddress as `0x${string}`,
        data: data as `0x${string}`,
        gas: gasLimitBigInt,
        value: options?.value ? BigInt(options.value) : undefined,
        ...(options?.chainId ? { chainId: options.chainId as any } : {}),
      });
    }

    console.log('[AA] Transaction submitted:', txHash);

    // Return a result object with wait function
    return {
      hash: txHash,
      wait: async (confirmations = 1) => {
        if (!isWeb3Auth) {
          // For external wallets, use wagmi's waitForTransactionReceipt
          try {
            const receipt = await waitForTransactionReceipt(wagmiConfig, {
              hash: txHash as `0x${string}`,
              confirmations,
              ...(options?.chainId ? { chainId: options.chainId as any } : {}),
            });
            return {
              status: receipt.status === 'success' ? 1 : 0,
              hash: receipt.transactionHash,
            };
          } catch (receiptError) {
            console.error('[AA] waitForTransactionReceipt failed:', receiptError);
            throw new Error('Transaction not confirmed within timeout');
          }
        }

        // Web3Auth: poll via provider
        const maxAttempts = 120;
        const pollInterval = 500;

        for (let i = 0; i < maxAttempts; i++) {
          try {
            const receipt = await provider.request({
              method: 'eth_getTransactionReceipt',
              params: [txHash],
            }) as { status: string; transactionHash: string } | null;

            if (receipt) {
              console.log('[AA] Transaction confirmed:', receipt.transactionHash);
              return {
                status: receipt.status === '0x1' ? 1 : 0,
                hash: receipt.transactionHash,
              };
            }
          } catch {
            // Receipt not ready yet
          }

          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error('Transaction not confirmed within timeout');
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
  options?: { context?: string; chainId?: number },
): Promise<AAWriteResult> {
  const context = options?.context || 'send transaction';
  if (!calls.length) throw new Error('writeBatchAA called with no calls');

  const aaProvider: any =
    (options?.chainId !== undefined ? getAAProviderForChain(options.chainId) : null) ?? getAAProvider();

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

  try {
    // Same shape as the provider's own single-call path; viem's types here are
    // too deep to name, which is why that path casts as well.
    const userOpHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: calls.map(c => ({ to: c.to, value: c.value ?? BigInt(0), data: c.data })),
    } as any);

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
 * Get ERC20 token allowance
 */
export async function getERC20Allowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<bigint> {
  const erc20Interface = new Interface([
    'function allowance(address owner, address spender) view returns (uint256)',
  ]);

  return readContract<bigint>(tokenAddress, erc20Interface, 'allowance', [ownerAddress, spenderAddress]);
}
