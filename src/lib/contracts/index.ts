/**
 * Smart Contract Integrations
 * ===========================
 * Re-exports for all contract-related utilities.
 */

// AA Utilities
export {
  writeContractAA,
  readContract,
  readContractAll,
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
  ETH_CHAIN_ID,
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

// Creator subscriptions (on-chain plans + purchases)
export {
  SUBSCRIPTION_CONTRACTS,
  SUBSCRIPTION_ABI,
  LIFETIME_DURATION,
  MAX_DURATION_MONTHS,
  isSubscriptionChain,
  getSubscriptionContract,
  normaliseDuration,
  formatDuration,
  readOnChainPlan,
  readOnChainSubscription,
  quoteSubscriptionFee,
  getSubscriptionCost,
  publishPlanOnChain,
  buySubscriptionOnChain,
  type OnChainPlan,
  type OnChainSubscription,
  type SubscriptionCost,
  type PublishPlanParams,
  type BuySubscriptionParams,
} from './subscription';

// Uniswap V3 Auto-Swap (Base)
export {
  getSwapQuote,
  applySlippage,
  swapETHForDHB,
  isAutoSwapSupported,
  getNativeBalance,
} from './uniswap-swap';
