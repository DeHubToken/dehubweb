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
  switchChain,
  type AAWriteResult,
} from './aa-utils';

// DHB Token & Chain Configs
export { 
  DHB_TOKEN, 
  BASE_CHAIN_ID,
  BNB_CHAIN_ID,
  CHAIN_CONFIGS,
  getChainConfig,
  ERC20_ABI, 
  toWei, 
  fromWei,
  type ChainConfig,
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
  type MintFee,
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
