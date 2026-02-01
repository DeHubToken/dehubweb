/**
 * StreamController Smart Contract Integration
 * ============================================
 * Handles bounty minting and other controller functions on Base Mainnet.
 * Uses AA-aware utilities for gasless transactions.
 */

import { Interface } from 'ethers';
import { 
  writeContractAA, 
  getWalletAddress, 
  approveERC20, 
  getERC20Balance, 
  getERC20Allowance,
  parseTxError,
} from './aa-utils';
import { DHB_TOKEN, toWei } from './dhb-token';

// StreamController contract address on Base Mainnet
export const STREAM_CONTROLLER_ADDRESS = '0x4fa30dAef50c6dc8593470750F3c721CA3275581';

// ABI for StreamController - mintWithBounty(id, timestamp, v, r, s, uri, bountyAmount, countOfViewers, countOfCommentors, tokenAddress)
export const STREAM_CONTROLLER_ABI = [
  'function mintWithBounty(uint256 id, uint256 timestamp, uint8 v, bytes32 r, bytes32 s, string uri, uint256 bountyAmount, uint32 countOfViewers, uint32 countOfCommentors, address tokenAddress)',
  'function bounties(uint256) view returns (uint256 totalAmount, uint256 reserveAmount, uint256 bountyAmount, uint32 countOfViewers, uint32 countOfCommentors, address tokenAddress)',
  'function streamCollection() view returns (address)',
];

// Create interface for encoding/decoding
const streamControllerInterface = new Interface(STREAM_CONTROLLER_ABI);

/**
 * Parameters for mintWithBounty
 */
export interface MintWithBountyParams {
  tokenId: string | number;
  timestamp: number;
  v: number;
  r: string;
  s: string;
  bountyAmount: number; // Human-readable DHB amount per person
  countOfViewers: number;
  countOfCommentors: number;
}

/**
 * Check DHB token balance
 */
export async function getDHBBalance(address: string): Promise<bigint> {
  return getERC20Balance(DHB_TOKEN.address, address);
}

/**
 * Check DHB allowance for StreamController
 */
export async function getDHBAllowance(owner: string): Promise<bigint> {
  return getERC20Allowance(DHB_TOKEN.address, owner, STREAM_CONTROLLER_ADDRESS);
}

/**
 * Approve DHB tokens for StreamController spending
 */
export async function approveDHB(amount: bigint): Promise<string> {
  console.log('[StreamController] Approving DHB:', amount.toString());
  
  const result = await approveERC20(DHB_TOKEN.address, STREAM_CONTROLLER_ADDRESS, amount);
  
  console.log('[StreamController] Approval tx submitted:', result.hash);
  const receipt = await result.wait(1);
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
  
  const signerAddress = await getWalletAddress();
  console.log('[StreamController] Signer address:', signerAddress);
  
  // Calculate total bounty needed
  const totalBounty = calculateTotalBounty(
    params.bountyAmount,
    params.countOfViewers,
    params.countOfCommentors
  );
  const totalBountyWei = toWei(totalBounty, DHB_TOKEN.decimals);
  
  console.log('[StreamController] Total bounty needed:', totalBounty, 'DHB (', totalBountyWei.toString(), 'wei)');
  
  // Check balance
  const balance = await getDHBBalance(signerAddress);
  console.log('[StreamController] DHB balance:', balance.toString());
  
  if (balance < totalBountyWei) {
    throw new Error(`Insufficient DHB balance. Need ${totalBounty} DHB but have ${Number(balance) / 1e18} DHB`);
  }
  
  // Check allowance and approve if needed
  const allowance = await getDHBAllowance(signerAddress);
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
    // Use AA-aware write
    const result = await writeContractAA(
      STREAM_CONTROLLER_ADDRESS,
      streamControllerInterface,
      'mintWithBounty',
      [
        tokenId,
        timestamp,
        v,
        r,
        s,
        uri,
        bountyAmountWei,
        params.countOfViewers,
        params.countOfCommentors,
        DHB_TOKEN.address,
      ],
      { context: 'mint with bounty' }
    );
    
    console.log('[StreamController] Transaction submitted:', result.hash);
    
    const receipt = await result.wait(1);
    console.log('[StreamController] Transaction confirmed:', receipt.hash);
    
    return receipt.hash;
  } catch (error) {
    console.error('[StreamController] mintWithBounty failed:', error);
    throw error;
  }
}
