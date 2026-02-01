/**
 * StreamController Smart Contract Integration
 * ============================================
 * Handles bounty minting and other controller functions on Base Mainnet.
 */

import { BrowserProvider, Contract, parseUnits } from 'ethers';
import { getWeb3AuthProvider } from '@/lib/web3auth';
import { DHB_TOKEN, ERC20_ABI, toWei } from './dhb-token';

// StreamController contract address on Base Mainnet
export const STREAM_CONTROLLER_ADDRESS = '0x4fa30dAef50c6dc8593470750F3c721CA3275581';

// Minimal ABI for StreamController - mintWithBounty and related functions
export const STREAM_CONTROLLER_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'uint256', name: 'timestamp', type: 'uint256' },
      { internalType: 'uint8', name: 'v', type: 'uint8' },
      { internalType: 'bytes32', name: 'r', type: 'bytes32' },
      { internalType: 'bytes32', name: 's', type: 'bytes32' },
      { internalType: 'string', name: 'uri', type: 'string' },
      { internalType: 'uint256', name: 'bountyAmount', type: 'uint256' },
      { internalType: 'uint32', name: 'countOfViewers', type: 'uint32' },
      { internalType: 'uint32', name: 'countOfCommentors', type: 'uint32' },
      { internalType: 'address', name: 'tokenAddress', type: 'address' },
    ],
    name: 'mintWithBounty',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'bounties',
    outputs: [
      { internalType: 'uint256', name: 'totalAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'reserveAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'bountyAmount', type: 'uint256' },
      { internalType: 'uint32', name: 'countOfViewers', type: 'uint32' },
      { internalType: 'uint32', name: 'countOfCommentors', type: 'uint32' },
      { internalType: 'address', name: 'tokenAddress', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'streamCollection',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Parameters for mintWithBounty
 */
export interface MintWithBountyParams {
  tokenId: string | number;
  timestamp: number;
  v: number;
  r: string;
  s: string;
  bountyAmount: number; // Human-readable DHB amount
  countOfViewers: number;
  countOfCommentors: number;
}

/**
 * Get the StreamController contract instance
 */
export async function getStreamControllerContract(): Promise<Contract> {
  const web3AuthProvider = getWeb3AuthProvider();
  
  if (!web3AuthProvider) {
    throw new Error('Web3Auth not connected. Please sign in first.');
  }

  const provider = new BrowserProvider(web3AuthProvider);
  const signer = await provider.getSigner();
  return new Contract(STREAM_CONTROLLER_ADDRESS, STREAM_CONTROLLER_ABI, signer);
}

/**
 * Get DHB token contract instance
 */
export async function getDHBContract(): Promise<Contract> {
  const web3AuthProvider = getWeb3AuthProvider();
  
  if (!web3AuthProvider) {
    throw new Error('Web3Auth not connected. Please sign in first.');
  }

  const provider = new BrowserProvider(web3AuthProvider);
  const signer = await provider.getSigner();
  return new Contract(DHB_TOKEN.address, ERC20_ABI, signer);
}

/**
 * Check DHB token balance
 */
export async function getDHBBalance(address: string): Promise<bigint> {
  const dhbContract = await getDHBContract();
  return dhbContract.balanceOf(address);
}

/**
 * Check DHB allowance for StreamController
 */
export async function getDHBAllowance(owner: string): Promise<bigint> {
  const dhbContract = await getDHBContract();
  return dhbContract.allowance(owner, STREAM_CONTROLLER_ADDRESS);
}

/**
 * Approve DHB tokens for StreamController spending
 */
export async function approveDHB(amount: bigint): Promise<string> {
  console.log('[StreamController] Approving DHB:', amount.toString());
  
  const dhbContract = await getDHBContract();
  const tx = await dhbContract.approve(STREAM_CONTROLLER_ADDRESS, amount);
  
  console.log('[StreamController] Approval tx submitted:', tx.hash);
  const receipt = await tx.wait();
  console.log('[StreamController] Approval confirmed:', receipt.hash);
  
  return receipt.hash;
}

/**
 * Calculate total bounty amount needed
 * Total = bountyAmount * (countOfViewers + countOfCommentors)
 */
export function calculateTotalBounty(
  bountyPerPerson: number,
  countOfViewers: number,
  countOfCommentors: number
): number {
  return bountyPerPerson * (countOfViewers + countOfCommentors);
}

/**
 * Execute mintWithBounty on StreamController contract
 * Requires prior DHB approval for the total bounty amount
 */
export async function mintWithBounty(params: MintWithBountyParams): Promise<string> {
  console.log('[StreamController] Starting mintWithBounty with params:', params);
  
  const controller = await getStreamControllerContract();
  const dhbContract = await getDHBContract();
  
  // Get signer address
  const web3AuthProvider = getWeb3AuthProvider();
  const provider = new BrowserProvider(web3AuthProvider!);
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  
  // Calculate total bounty needed
  const totalBounty = calculateTotalBounty(
    params.bountyAmount,
    params.countOfViewers,
    params.countOfCommentors
  );
  const totalBountyWei = toWei(totalBounty, DHB_TOKEN.decimals);
  
  console.log('[StreamController] Total bounty needed:', totalBounty, 'DHB (', totalBountyWei.toString(), 'wei)');
  
  // Check balance
  const balance = await dhbContract.balanceOf(signerAddress);
  console.log('[StreamController] DHB balance:', balance.toString());
  
  if (balance < totalBountyWei) {
    throw new Error(`Insufficient DHB balance. Need ${totalBounty} DHB but have ${Number(balance) / 1e18} DHB`);
  }
  
  // Check allowance and approve if needed
  const allowance = await dhbContract.allowance(signerAddress, STREAM_CONTROLLER_ADDRESS);
  console.log('[StreamController] Current allowance:', allowance.toString());
  
  if (allowance < totalBountyWei) {
    console.log('[StreamController] Approving DHB tokens...');
    // Approve max uint256 to avoid repeated approvals
    const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    await approveDHB(maxApproval);
  }
  
  // Prepare parameters
  const tokenId = BigInt(params.tokenId);
  const timestamp = BigInt(params.timestamp);
  const v = params.v;
  const r = params.r.startsWith('0x') ? params.r : `0x${params.r}`;
  const s = params.s.startsWith('0x') ? params.s : `0x${params.s}`;
  const uri = `/${params.tokenId}.json`;
  const bountyAmountWei = toWei(params.bountyAmount, DHB_TOKEN.decimals);
  
  console.log('[StreamController] Calling mintWithBounty:', {
    tokenId: tokenId.toString(),
    timestamp: timestamp.toString(),
    v,
    r,
    s,
    uri,
    bountyAmount: bountyAmountWei.toString(),
    countOfViewers: params.countOfViewers,
    countOfCommentors: params.countOfCommentors,
    tokenAddress: DHB_TOKEN.address,
  });
  
  try {
    const tx = await controller.mintWithBounty(
      tokenId,
      timestamp,
      v,
      r,
      s,
      uri,
      bountyAmountWei,
      params.countOfViewers,
      params.countOfCommentors,
      DHB_TOKEN.address
    );
    
    console.log('[StreamController] Transaction submitted:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('[StreamController] Transaction confirmed:', receipt.hash);
    
    return receipt.hash;
  } catch (error: unknown) {
    console.error('[StreamController] mintWithBounty failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('user rejected')) {
        throw new Error('Transaction was rejected by user.');
      }
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient funds for gas. Please add ETH to your wallet.');
      }
      if (error.message.includes('InvalidBountyAmount')) {
        throw new Error('Invalid bounty amount. Please check your input.');
      }
      throw error;
    }
    
    throw new Error('Failed to mint with bounty. Please try again.');
  }
}
