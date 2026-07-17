/**
 * Wallet Send Functions
 * =====================
 * Handles sending native tokens and ERC-20 tokens using the AA utility.
 */

import { Interface, parseUnits } from 'ethers';
import { writeContractAA, getWalletAddress, type AAWriteResult } from '@/lib/contracts/aa-utils';
import { getWeb3AuthProvider } from '@/lib/web3auth';
import { getAccount, sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { initChainRpcUrls } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

/**
 * Send native token (ETH / BNB) to an address
 */
export async function sendNativeToken(
  to: string,
  amount: string,
  decimals: number = 18,
  chainId?: ChainId
): Promise<AAWriteResult> {
  await initChainRpcUrls();
  const value = parseUnits(amount, decimals);
  const fromAddress = await getWalletAddress();

  const web3authProvider = getWeb3AuthProvider();
  if (web3authProvider) {
    // Web3Auth path
    const txHash = await web3authProvider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: fromAddress,
        to,
        value: `0x${value.toString(16)}`,
      }],
    }) as string;

    return {
      hash: txHash,
      wait: async () => {
        // Poll for receipt
        for (let i = 0; i < 60; i++) {
          try {
            const receipt = await web3authProvider.request({
              method: 'eth_getTransactionReceipt',
              params: [txHash],
            }) as any;
            if (receipt) {
              return { status: receipt.status === '0x1' ? 1 : 0, hash: receipt.transactionHash };
            }
          } catch { /* not ready */ }
          await new Promise(r => setTimeout(r, 2000));
        }
        throw new Error('Transaction not confirmed');
      },
    };
  }

  // Wagmi path
  const txHash = await sendTransaction(wagmiConfig, {
    to: to as `0x${string}`,
    value: BigInt(value.toString()),
    ...(chainId ? { chainId: chainId as any } : {}),
  });

  return {
    hash: txHash,
    wait: async () => {
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: txHash as `0x${string}`,
        ...(chainId ? { chainId: chainId as any } : {}),
      });
      return { status: receipt.status === 'success' ? 1 : 0, hash: receipt.transactionHash };
    },
  };
}

/**
 * Send ERC-20 tokens
 */
export async function sendERC20Token(
  tokenAddress: string,
  to: string,
  amount: string,
  decimals: number = 18,
  chainId?: ChainId
): Promise<AAWriteResult> {
  await initChainRpcUrls();
  const erc20Interface = new Interface([
    'function transfer(address to, uint256 amount) returns (bool)',
  ]);

  const value = parseUnits(amount, decimals);

  return writeContractAA(
    tokenAddress,
    erc20Interface,
    'transfer',
    [to, value],
    { context: 'token transfer', chainId }
  );
}
