/**
 * Smart Contract Integrations
 * ===========================
 * Re-exports for all contract-related utilities.
 */

// AA Utilities
export {
  writeContractAA,
  readContract,
  getWalletAddress,
  isSmartAccountSession,
  approveERC20,
  getERC20Balance,
  getERC20Allowance,
  parseTxError,
  type AAWriteResult,
} from './aa-utils';

// DHB Token
export { 
  DHB_TOKEN, 
  BASE_CHAIN_ID, 
  ERC20_ABI, 
  toWei, 
  fromWei 
} from './dhb-token';

// StreamCollection (NFT minting)
export { 
  STREAM_COLLECTION_ADDRESS, 
  STREAM_COLLECTION_ABI,
  getWeb3AuthSigner,
  mintOnChain,
  isTokenMinted,
  getTokenBalance,
  type MintParams,
} from './stream-collection';

// StreamController (Bounty minting)
export {
  STREAM_CONTROLLER_ADDRESS,
  STREAM_CONTROLLER_ABI,
  getDHBBalance,
  getDHBAllowance,
  approveDHB,
  calculateTotalBounty,
  mintWithBounty,
  type MintWithBountyParams,
} from './stream-controller';
