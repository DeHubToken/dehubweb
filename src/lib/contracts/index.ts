/**
 * Smart Contract Integrations
 * ===========================
 * Re-exports for all contract-related utilities.
 */

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
  getStreamCollectionContract,
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
  getStreamControllerContract,
  getDHBContract,
  getDHBBalance,
  getDHBAllowance,
  approveDHB,
  calculateTotalBounty,
  mintWithBounty,
  type MintWithBountyParams,
} from './stream-controller';
