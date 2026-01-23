/**
 * Smart Account Deployment Utilities
 * ====================================
 * Handles checking and deploying smart accounts for Web3Auth embedded wallets.
 * Uses Pimlico paymaster to sponsor the deployment transaction.
 */

import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { getWeb3AuthProvider } from './web3auth';

const BASE_RPC_URL = 'https://mainnet.base.org';

/**
 * Check if a smart account contract is deployed at the given address
 */
export async function isSmartAccountDeployed(address: Address): Promise<boolean> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  });

  const code = await publicClient.getCode({ address });
  return code !== undefined && code !== '0x';
}

/**
 * Deploy a smart account by sending a no-op transaction through the AA provider.
 * The Pimlico paymaster will sponsor the gas for this deployment.
 */
export async function deploySmartAccount(smartAccountAddress: Address): Promise<void> {
  console.log('[SmartAccount] Checking deployment status for:', smartAccountAddress);
  
  const isDeployed = await isSmartAccountDeployed(smartAccountAddress);
  
  if (isDeployed) {
    console.log('[SmartAccount] Contract already deployed');
    return;
  }

  console.log('[SmartAccount] Contract not deployed, initiating deployment...');
  
  const provider = getWeb3AuthProvider();
  if (!provider) {
    throw new Error('Web3Auth provider not available');
  }

  // Send a no-op transaction to trigger smart account deployment
  // The AA provider will handle creating and deploying the account
  try {
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: smartAccountAddress,
        to: smartAccountAddress,
        value: '0x0',
        data: '0x',
      }],
    });

    console.log('[SmartAccount] Deployment transaction sent:', txHash);

    // Wait for transaction confirmation
    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    await publicClient.waitForTransactionReceipt({ 
      hash: txHash as `0x${string}`,
      timeout: 60_000, // 60 second timeout
    });

    console.log('[SmartAccount] Deployment transaction confirmed');

    // Verify deployment
    const postDeployCode = await publicClient.getCode({ address: smartAccountAddress });
    if (!postDeployCode || postDeployCode === '0x') {
      throw new Error('Smart account deployment did not complete');
    }

    console.log('[SmartAccount] Contract successfully deployed');
  } catch (error: unknown) {
    console.error('[SmartAccount] Deployment error:', error);
    
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Parse common errors
    if (message.includes('insufficient funds')) {
      throw new Error('Insufficient funds for smart account deployment');
    }
    if (message.includes('user rejected') || message.includes('User rejected')) {
      throw new Error('Smart account deployment was cancelled');
    }
    if (message.includes('AA')) {
      // Account abstraction specific error
      throw new Error(`Smart account error: ${message}`);
    }
    
    throw new Error(`Smart account deployment failed: ${message}`);
  }
}

/**
 * Check if the current wallet is an embedded wallet (social/email login)
 * by checking if the connectedAdapterName is not an external wallet
 */
export function isEmbeddedWallet(connectedAdapterName: string | undefined): boolean {
  if (!connectedAdapterName) return false;
  
  // External wallet adapters
  const externalWallets = [
    'metamask',
    'wallet-connect',
    'walletconnect',
    'coinbase',
    'phantom',
    'injected',
  ];
  
  return !externalWallets.some(w => 
    connectedAdapterName.toLowerCase().includes(w)
  );
}
