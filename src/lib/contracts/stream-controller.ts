/**
 * StreamController Smart Contract Integration
 * ============================================
 * Handles bounty minting and other controller functions.
 * Supports Base and BNB chains with chain-specific contract addresses.
 */

import { Interface } from 'ethers';
import { 
  writeContractAA, 
  getWalletAddress, 
  approveERC20, 
  getERC20Balance, 
  getERC20Allowance,
  parseTxError,
  switchChain,
} from './aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID } from './dhb-token';
import { isV3Chain } from '@/lib/chains/robinhood';
import type { ChainId } from '@/components/app/ChainSelector';

// StreamController contract address on Base Mainnet (default for backward compatibility)
export const STREAM_CONTROLLER_ADDRESS = '0x4fa30dAef50c6dc8593470750F3c721CA3275581';

// ABI for StreamController
// sendTip: for tips (DM and post); emits SendFunds( FundType.TIP ) so backend can detect tips
// mintWithBounty: for stream minting with bounty
export const STREAM_CONTROLLER_ABI = [
  'function sendTip(uint256 tokenId, uint256 amount, address to, address tokenAddress)',
  'function sendFundsForPPV(uint256 tokenId, uint256 amount, address to, address tokenAddress)',
  'function mintWithBounty(uint256 id, uint256 timestamp, uint8 v, bytes32 r, bytes32 s, string uri, uint256 bountyAmount, uint32 countOfViewers, uint32 countOfCommentors, address tokenAddress)',
  'function bounties(uint256) view returns (uint256 totalAmount, uint256 reserveAmount, uint256 bountyAmount, uint32 countOfViewers, uint32 countOfCommentors, address tokenAddress)',
  'function streamCollection() view returns (address)',
];

/**
 * v3 controllers (Robinhood Chain) take the same arguments but `payable`, and
 * read the zero address in `tokenAddress` as native ETH. That matters most on
 * 4663, where ETH is the gas token: without it a fifty-cent tip needs a wrap
 * first, which is two transactions and a concept to explain.
 */
export const STREAM_CONTROLLER_V3_ABI = [
  'function sendTip(uint256 tokenId, uint256 amount, address to, address tokenAddress) payable',
  'function sendFundsForPPV(uint256 tokenId, uint256 amount, address to, address tokenAddress) payable',
  'function createBounty(uint256 tokenId, uint256 bountyAmount, uint32 countOfViewers, uint32 countOfCommentors, address tokenAddress) payable',
  'function mintWithBounty(uint256 tokenId, string uri, uint256 mintDeadline, bytes mintSignature, uint256 bountyAmount, uint32 countOfViewers, uint32 countOfCommentors, address tokenAddress) payable',
  'function claimBounty(uint256 tokenId, uint8 bountyType, uint256 deadline, bytes signature)',
  'function bounties(uint256) view returns (uint256 totalAmount, uint256 reserveAmount, uint256 bountyAmount, uint32 countOfViewers, uint32 countOfCommentors, address tokenAddress, address creator, uint64 createdAt)',
  'function streamCollection() view returns (address)',
];

// Create interface for encoding/decoding
const streamControllerInterface = new Interface(STREAM_CONTROLLER_ABI);
const streamControllerV3Interface = new Interface(STREAM_CONTROLLER_V3_ABI);

/** The zero address means "native currency" to a v3 controller. */
export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

function controllerInterfaceFor(chainId: ChainId): Interface {
  return isV3Chain(chainId) ? streamControllerV3Interface : streamControllerInterface;
}

/**
 * Parameters for mintWithBounty
 */
export interface MintWithBountyParams {
  tokenId: string | number;
  timestamp: number;
  v: number;
  r: string;
  s: string;
  /** URI suffix from the mint API — carries the post's text on chain. */
  uri?: string;
  bountyAmount: number; // Human-readable DHB amount per person
  countOfViewers: number;
  countOfCommentors: number;
  chainId?: ChainId;
}

/**
 * Check DHB token balance
 */
export async function getDHBBalance(address: string, chainId: ChainId = BASE_CHAIN_ID): Promise<bigint> {
  const chainConfig = getChainConfig(chainId);
  return getERC20Balance(chainConfig.dhbToken, address);
}

/**
 * Check DHB allowance for StreamController
 */
export async function getDHBAllowance(owner: string, chainId: ChainId = BASE_CHAIN_ID): Promise<bigint> {
  const chainConfig = getChainConfig(chainId);
  return getERC20Allowance(chainConfig.dhbToken, owner, chainConfig.streamController);
}

/**
 * Approve DHB tokens for StreamController spending
 */
export async function approveDHB(amount: bigint, chainId: ChainId = BASE_CHAIN_ID): Promise<string> {
  const chainConfig = getChainConfig(chainId);
  console.log('[StreamController] Approving DHB:', amount.toString(), 'on', chainConfig.name);

  const result = await approveERC20(chainConfig.dhbToken, chainConfig.streamController, amount, chainId);

  console.log('[StreamController] Approval tx submitted:', result.hash);
  const receipt = await result.wait(1);
  console.log('[StreamController] Approval confirmed:', receipt.hash);

  return receipt.hash;
}

/**
 * Parameters for sendTip
 * @param tokenId - Stream/post token ID. Use 0 for DM tips (no associated post).
 * @param amount - Human-readable DHB amount
 * @param to - Recipient address
 * @param chainId - Chain ID (default: Base)
 */
export interface SendTipParams {
  tokenId: string | number;
  amount: number;
  to: string;
  chainId?: ChainId;
  /**
   * Token to tip in. Defaults to that chain's DHB. Pass
   * `NATIVE_TOKEN_ADDRESS` on a v3 chain to tip native ETH — no approval, no
   * wrap.
   */
  tokenAddress?: string;
  /** Decimals of `tokenAddress`. Defaults to DHB's 18. */
  decimals?: number;
}

/**
 * Send tip via StreamController.sendTip().
 * Emits SendFunds(FundType.TIP) so backend can detect tips (unlike direct ERC20 transfer).
 * Requires prior DHB approval for StreamController — will approve if needed.
 */
// Cache of chains where max-approval has already been granted this session
const approvedChains = new Set<string>();

// Hydrate approval cache from sessionStorage on load
try {
  const cached = sessionStorage.getItem('dhb_approved_chains');
  if (cached) JSON.parse(cached).forEach((k: string) => approvedChains.add(k));
} catch { /* ignore */ }

function persistApprovalCache() {
  try { sessionStorage.setItem('dhb_approved_chains', JSON.stringify([...approvedChains])); } catch { /* */ }
}

export interface SendTipResult {
  /** Transaction hash, available immediately after submission */
  hash: string;
  /** Resolves when the tx is confirmed on-chain */
  confirmed: Promise<string>;
}

export async function sendTip(params: SendTipParams & { skipBalanceCheck?: boolean; signerAddress?: string }): Promise<SendTipResult> {
  const chainId = params.chainId || BASE_CHAIN_ID;
  const chainConfig = getChainConfig(chainId);

  await switchChain(chainId);

  const signerAddress = params.signerAddress || await getWalletAddress();

  // Prevent self-tipping
  if (signerAddress.toLowerCase() === params.to.toLowerCase()) {
    throw new Error('You cannot tip yourself');
  }

  const tokenAddress = params.tokenAddress || chainConfig.dhbToken;
  const isNative = tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS;
  const amountWei = toWei(params.amount, params.decimals ?? DHB_TOKEN.decimals);

  // Native ETH needs no allowance and no approval transaction — the value
  // rides along with the call.
  if (isNative) {
    if (!isV3Chain(chainId)) {
      throw new Error('Native tips are only supported on Robinhood Chain');
    }
    const nativeResult = await writeContractAA(
      chainConfig.streamController,
      streamControllerV3Interface,
      'sendTip',
      [BigInt(params.tokenId), amountWei, params.to, NATIVE_TOKEN_ADDRESS],
      { context: 'send tip', chainId, value: amountWei },
    );
    return { hash: nativeResult.hash, confirmed: nativeResult.wait(1).then(r => r.hash) };
  }

  // Parallelize balance + allowance checks (skip balance if UI already verified)
  const chainKey = `${chainId}-${signerAddress}`;

  // Always check balance. Always verify on-chain allowance — cache was causing stale
  // approvals to be skipped, resulting in STF (SafeTransferFrom) revert on sendTip.
  // Read against the token actually being tipped, not DHB by assumption: on a
  // chain where the tip is USDT, a DHB allowance says nothing.
  const [balance, allowance] = await Promise.all([
    params.skipBalanceCheck
      ? Promise.resolve(amountWei)
      : getERC20Balance(tokenAddress, signerAddress),
    getERC20Allowance(tokenAddress, signerAddress, chainConfig.streamController),
  ]);
  const tokenLabel = params.tokenAddress ? 'token' : 'DHB';

  console.log('[StreamController] sendTip check:', {
    signerAddress,
    chainId,
    amountWei: amountWei.toString(),
    balance: balance.toString(),
    allowance: allowance.toString(),
    skipBalanceCheck: params.skipBalanceCheck,
  });

  if (!params.skipBalanceCheck && balance < amountWei) {
    const decimals = params.decimals ?? DHB_TOKEN.decimals;
    const held = Number(balance) / 10 ** decimals;
    throw new Error(
      `Insufficient ${tokenLabel} balance. Need ${params.amount} but have ${held}`
    );
  }

  if (allowance < amountWei) {
    console.log('[StreamController] Approving for sendTip... allowance:', allowance.toString(), '< needed:', amountWei.toString());
    const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const approval = await approveERC20(tokenAddress, chainConfig.streamController, maxApproval, chainId);
    await approval.wait(1);
  }
  approvedChains.add(chainKey);
  persistApprovalCache();

  const tokenId = BigInt(params.tokenId);

  let result;
  try {
    result = await writeContractAA(
      chainConfig.streamController,
      controllerInterfaceFor(chainId),
      'sendTip',
      [tokenId, amountWei, params.to, tokenAddress],
      { context: 'send tip', chainId }
    );
  } catch (err: unknown) {
    const msg = String((err as any)?.message || err).toLowerCase();
    if (msg.includes('stf') || msg.includes('safetransfer') || msg.includes('execution reverted') ||
        msg.includes('token transfer failed')) {
      approvedChains.delete(chainKey);
      persistApprovalCache();
    }
    throw err;
  }

  // Return hash immediately; confirmation runs in background
  return {
    hash: result.hash,
    confirmed: result.wait(1).then(r => r.hash),
  };
}

export interface SendPPVParams {
  tokenId: string | number;
  amount: number;
  to: string;
  chainId?: ChainId;
}

export interface SendPPVResult {
  hash: string;
  confirmed: Promise<string>;
}

/**
 * Unlock PPV via StreamController.sendFundsForPPV().
 * Emits SendFunds(FundType.PPV) for backend webhook + /ppv/confirm detection.
 */
export async function sendFundsForPPV(
  params: SendPPVParams & { skipBalanceCheck?: boolean; signerAddress?: string },
): Promise<SendPPVResult> {
  const chainId = params.chainId || BASE_CHAIN_ID;
  const chainConfig = getChainConfig(chainId);

  await switchChain(chainId);

  const signerAddress = params.signerAddress || await getWalletAddress();

  if (signerAddress.toLowerCase() === params.to.toLowerCase()) {
    throw new Error('You cannot pay yourself');
  }

  const amountWei = toWei(params.amount, DHB_TOKEN.decimals);
  const chainKey = `${chainId}-${signerAddress}`;

  const [balance, allowance] = await Promise.all([
    params.skipBalanceCheck ? Promise.resolve(amountWei) : getDHBBalance(signerAddress, chainId),
    getDHBAllowance(signerAddress, chainId),
  ]);

  if (!params.skipBalanceCheck && balance < amountWei) {
    throw new Error(
      `Insufficient DHB balance. Need ${params.amount} DHB but have ${Number(balance) / 1e18} DHB`,
    );
  }

  if (allowance < amountWei) {
    const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    await approveDHB(maxApproval, chainId);
  }
  approvedChains.add(chainKey);
  persistApprovalCache();

  const tokenId = BigInt(params.tokenId);

  const result = await writeContractAA(
    chainConfig.streamController,
    streamControllerInterface,
    'sendFundsForPPV',
    [tokenId, amountWei, params.to, chainConfig.dhbToken],
    { context: 'PPV unlock payment', chainId },
  );

  return {
    hash: result.hash,
    confirmed: result.wait(1).then((r) => r.hash),
  };
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
  const chainId = params.chainId || BASE_CHAIN_ID;
  const chainConfig = getChainConfig(chainId);
  
  console.log('[StreamController] Starting mintWithBounty with params:', { ...params, chain: chainConfig.name });
  
  // Switch to the correct chain first
  await switchChain(chainId);
  
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
  const balance = await getDHBBalance(signerAddress, chainId);
  console.log('[StreamController] DHB balance:', balance.toString());
  
  if (balance < totalBountyWei) {
    throw new Error(`Insufficient DHB balance. Need ${totalBounty} DHB but have ${Number(balance) / 1e18} DHB`);
  }
  
  // Check allowance and approve if needed
  const allowance = await getDHBAllowance(signerAddress, chainId);
  console.log('[StreamController] Current allowance:', allowance.toString());
  
  if (allowance < totalBountyWei) {
    console.log('[StreamController] Approving DHB tokens...');
    // Approve max uint256 to avoid repeated approvals
    const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    await approveDHB(maxApproval, chainId);
  }
  
  // Prepare parameters
  const tokenId = BigInt(params.tokenId);
  const timestamp = BigInt(params.timestamp);
  const v = params.v;
  const r = params.r.startsWith('0x') ? params.r : `0x${params.r}`;
  const s = params.s.startsWith('0x') ? params.s : `0x${params.s}`;
  const uri = params.uri ?? `/${params.tokenId}.json`;
  const bountyAmountWei = toWei(params.bountyAmount, DHB_TOKEN.decimals);
  
  console.log('[StreamController] Calling mintWithBounty:', {
    contract: chainConfig.streamController,
    chain: chainConfig.name,
    tokenId: tokenId.toString(),
    timestamp: timestamp.toString(),
    v,
    r,
    s,
    uri,
    bountyAmount: bountyAmountWei.toString(),
    countOfViewers: params.countOfViewers,
    countOfCommentors: params.countOfCommentors,
    tokenAddress: chainConfig.dhbToken,
  });
  
  try {
    // Use AA-aware write with chain-specific contract address
    const result = await writeContractAA(
      chainConfig.streamController,
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
        chainConfig.dhbToken,
      ],
      { context: 'mint with bounty', chainId }
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
