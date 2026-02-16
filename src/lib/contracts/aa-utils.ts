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
import { getConnectorClient } from '@wagmi/core';
import { getAccount } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import type { ChainId } from '@/components/app/ChainSelector';
import { CHAIN_CONFIGS, BASE_CHAIN_ID, BNB_CHAIN_ID, initChainRpcUrls } from './dhb-token';

// Hex type for AA transactions
type Hex = `0x${string}`;

/**
 * Get the active EIP-1193 provider - Web3Auth (social login) or wagmi (wallet)
 */
async function getActiveProvider(): Promise<any> {
  // Try Web3Auth first (social login sessions)
  const web3authProvider = getWeb3AuthProvider();
  if (web3authProvider) return web3authProvider;

  // Fall back to wagmi (external wallet via AppKit)
  try {
    const client = await getConnectorClient(wagmiConfig);
    // viem WalletClient supports EIP-1193 .request() method
    return client;
  } catch {
    throw new Error('No wallet connected. Please sign in first.');
  }
}

/**
 * Convert chain ID to hex format
 */
function chainIdToHex(chainId: ChainId): Hex {
  return `0x${chainId.toString(16)}` as Hex;
}

/**
 * Switch the wallet to a different chain
 */
export async function switchChain(chainId: ChainId): Promise<void> {
  // Ensure we have Alchemy RPC URLs before switching
  await initChainRpcUrls();

  const provider = await getActiveProvider();
  
  const chainConfig = CHAIN_CONFIGS[chainId];
  if (!chainConfig) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  
  const targetChainHex = chainIdToHex(chainId);
  
  // Retry once on transient failures
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainHex }],
      });
      console.log('[AA] Switched to chain:', chainConfig.name);
      return;
    } catch (switchError: any) {
      // If chain doesn't exist, try to add it
      if (switchError?.code === 4902 || switchError?.message?.includes('Unrecognized chain')) {
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
      
      // On first attempt of a transient error, retry after a short delay
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
 * - Encodes calldata and sends via eth_sendTransaction
 * - The AA provider handles bundler/paymaster internally
 * 
 * For EOA wallets:
 * - Uses standard eth_sendTransaction
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
  }
): Promise<AAWriteResult> {
  const provider = await getActiveProvider();
  const context = options?.context || 'send transaction';
  
  // Encode the function call
  const data = contractInterface.encodeFunctionData(functionName, args) as Hex;
  const fromAddress = await getWalletAddress();
  
  // Estimate gas
  let gasLimit: Hex | undefined;
  try {
    const gasEstimate = await provider.request({
      method: 'eth_estimateGas',
      params: [{
        from: fromAddress,
        to: contractAddress,
        data,
        value: toHex(options?.value ?? 0),
      }],
    }) as string;
    
    const estimateBigInt = BigInt(gasEstimate);
    gasLimit = toHex(applyGasMargin(estimateBigInt));
  } catch (estimateError) {
    console.warn('[AA] Gas estimation failed, using default:', estimateError);
    // Use a conservative default gas limit
    gasLimit = toHex(BigInt(500_000));
  }
  
  // Build transaction params
  const txParams: Record<string, unknown> = {
    from: fromAddress,
    to: contractAddress,
    data,
    gas: gasLimit,
  };
  
  if (options?.value && BigInt(options.value) > BigInt(0)) {
    txParams.value = toHex(options.value);
  }
  
  console.log(`[AA] Sending transaction to ${contractAddress}:`, {
    function: functionName,
    gasLimit,
    hasValue: !!options?.value,
  });
  
  try {
    // Send transaction via provider - works for both AA and EOA
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    }) as string;
    
    console.log('[AA] Transaction submitted:', txHash);
    
    // Return a result object with wait function
    return {
      hash: txHash,
      wait: async (confirmations = 1) => {
        // Poll for receipt
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
 * Make a read-only contract call
 */
export async function readContract<T>(
  contractAddress: string,
  contractInterface: Interface,
  functionName: string,
  args: unknown[] = []
): Promise<T> {
  const provider = await getActiveProvider();
  const data = contractInterface.encodeFunctionData(functionName, args);
  
  const result = await provider.request({
    method: 'eth_call',
    params: [{
      to: contractAddress,
      data,
    }, 'latest'],
  }) as string;
  
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
