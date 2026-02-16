/**
 * Account Abstraction Utilities
 * =============================
 * AA-aware contract write helper that handles both:
 * - Web3Auth smart accounts (AA via Pimlico)
 * - EOA wallets (direct ethers calls)
 * Supports multi-chain (Base and BNB).
 */

import { Interface, parseUnits, formatUnits } from 'ethers';
import { getWeb3AuthProvider, getOrInitWeb3Auth } from '@/lib/web3auth';
import { getAccount } from '@wagmi/core';
import { sendTransaction, waitForTransactionReceipt, switchChain as wagmiSwitchChain } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import type { ChainId } from '@/components/app/ChainSelector';
import { CHAIN_CONFIGS, BASE_CHAIN_ID, BNB_CHAIN_ID, initChainRpcUrls } from './dhb-token';

// Hex type for AA transactions
type Hex = `0x${string}`;

/**
 * Get the active EIP-1193 provider - Web3Auth (social login) or wagmi (wallet).
 * For external wallets, provider is null -- callers use wagmi actions or public RPC instead.
 */
async function getActiveProvider(chainId?: number): Promise<{ provider: any; isWeb3Auth: boolean }> {
  // Try Web3Auth first (social login sessions)
  const web3authProvider = getWeb3AuthProvider();
  if (web3authProvider) return { provider: web3authProvider, isWeb3Auth: true };

  // Check wagmi (external wallet) -- use getAccount instead of getConnectorClient
  const account = getAccount(wagmiConfig);
  if (account.isConnected) {
    return { provider: null, isWeb3Auth: false };
  }

  throw new Error('No wallet connected. Please sign in first.');
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

      // Method not supported -- wallet can't switch programmatically
      if (code === -32601 || code === -32603 ||
          switchError?.message?.includes('does not exist')) {
        console.warn('[AA] wallet_switchEthereumChain not supported');
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
 * Get the current wallet address from Web3Auth provider
 */
export async function getWalletAddress(): Promise<string> {
  // Try Web3Auth first
  const web3authProvider = getWeb3AuthProvider();
  if (web3authProvider) {
    const accounts = await web3authProvider.request({ method: 'eth_accounts' }) as string[];
    if (accounts?.length) return accounts[0];
  }

  // Fall back to wagmi
  const account = getAccount(wagmiConfig);
  if (account.address) return account.address;

  throw new Error('No wallet connected. Please sign in first.');
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
 * Parse transaction error into user-friendly message
 */
export function parseTxError(error: unknown, context: string = 'transaction'): string {
  // Extract message from nested error objects (viem/ethers/provider errors)
  let errorStr = '';
  if (error instanceof Error) {
    errorStr = error.message;
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

  const lowerError = errorStr.toLowerCase();
  
  if (lowerError.includes('user rejected') || lowerError.includes('user denied')) {
    return 'Transaction was rejected by user.';
  }
  if (lowerError.includes('insufficient funds')) {
    return 'Insufficient funds for gas. Please add ETH to your wallet.';
  }
  if (lowerError.includes('paymaster') || lowerError.includes('sponsor') ||
      lowerError.includes('aa21') || lowerError.includes('aa25') || lowerError.includes('aa31')) {
    return 'Gas sponsorship failed. Please add ETH to your wallet for gas fees.';
  }
  if (lowerError.includes('nonce')) {
    return 'Transaction nonce error. Please try again.';
  }
  if (lowerError.includes('gas')) {
    return 'Gas estimation failed. The transaction may revert.';
  }
  if (lowerError.includes('already minted') || lowerError.includes('token already exists')) {
    return 'This content has already been minted.';
  }
  if (lowerError.includes('invalid signature') || lowerError.includes('signer should sign')) {
    return 'Signature verification failed on-chain.';
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
  const fromAddress = await getWalletAddress();
  
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
  } catch (estimateError) {
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
      const txParams: Record<string, unknown> = {
        from: fromAddress,
        to: contractAddress,
        data,
        gas: gasLimit,
      };
      if (options?.value && BigInt(options.value) > BigInt(0)) {
        txParams.value = toHex(options.value);
      }

      txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      }) as string;
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
        const maxAttempts = 60;
        const pollInterval = 2000;
        
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
 * ERC20 approval helper for AA
 */
export async function approveERC20(
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint
): Promise<AAWriteResult> {
  const erc20Interface = new Interface([
    'function approve(address spender, uint256 amount) returns (bool)',
  ]);
  
  console.log(`[AA] Approving ${amount} tokens for ${spenderAddress}`);
  
  return writeContractAA(
    tokenAddress,
    erc20Interface,
    'approve',
    [spenderAddress, amount],
    { context: 'token approval' }
  );
}

/**
 * Get ERC20 token balance
 */
export async function getERC20Balance(
  tokenAddress: string,
  ownerAddress: string
): Promise<bigint> {
  const erc20Interface = new Interface([
    'function balanceOf(address owner) view returns (uint256)',
  ]);
  
  return readContract<bigint>(tokenAddress, erc20Interface, 'balanceOf', [ownerAddress]);
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
