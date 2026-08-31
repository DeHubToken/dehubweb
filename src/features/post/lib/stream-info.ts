/**
 * Monetization → `streamInfo`
 * ===========================
 * One place that turns the composer's access switches into the `streamInfo`
 * blob `/api/user_mint` stores on the token, so every surface that can publish
 * a post writes the same shape.
 *
 * It exists because Go Live grew the same switches the post composer has. Two
 * copies of this mapping would drift within a release, and the ways it drifts
 * are all silent: a gate written without its amount, a PPV price with no token
 * address behind it, a bounty on a chain that has no DHB. Each of those ships a
 * post that *looks* gated or sellable and cannot be opened or paid.
 *
 * Deliberately pure and wallet-free. It reads chain config and validates
 * addresses; it never touches a balance or a contract, because it is imported
 * by eager UI and scripts/check-entry-bundle.mjs fails the build if the wallet
 * stack lands on the boot path. Callers do the balance checks with the
 * dynamically-imported contract helpers — see `bounty` in the result.
 */
import type { StreamInfo } from '@/lib/api/dehub';
import { getChainConfig } from '@/lib/contracts/dhb-token';
import { isSolanaChain, findLockToken, isValidEvmAddress } from '@/lib/chains/constants';
import { isValidSolanaAddress } from '@/lib/solana/wallet';
import type { Currency } from '../types';

export interface BuildStreamInfoInput {
  /** The chain the post mints on — decides DHB vs SPL, and EVM-only features. */
  chainId: number;
  isTokenGated: boolean;
  tokenAmount: string;
  tokenContract: string;
  tokenSymbol: string;
  isPPV: boolean;
  ppvAmount: string;
  ppvCurrency: Currency;
  isWatch2Earn: boolean;
  w2eTotal: string;
  w2eViews: string;
  w2eComments: string;
  isSubscribersOnly: boolean;
  /** The creator's PUBLISHED plan ids. An unpublished plan gates against nothing. */
  myPlanIds: string[];
}

/** What the caller still has to pay for on chain, once it knows the balance. */
export interface BountyTerms {
  amount: number;
  viewers: number;
  commenters: number;
}

/**
 * A flat shape with an optional `error` rather than a discriminated union: the
 * project builds with `strict: false`, where narrowing a union on a boolean
 * discriminant does not work, so a union here would type-error at every call
 * site. Check `error` first; the rest is meaningless when it is set.
 */
export interface BuildStreamInfoResult {
  /** What to tell the creator, when the switches describe a gate nobody could satisfy. */
  error?: string;
  streamInfo: StreamInfo;
  /** Undefined rather than [] — a gate is never stored with nothing behind it. */
  subscriberPlanIds?: string[];
  /** Set only when the post carries a bounty, which forces the on-chain mint. */
  bounty: BountyTerms | null;
}

export function buildStreamInfo(input: BuildStreamInfoInput): BuildStreamInfoResult {
  const {
    chainId,
    isTokenGated,
    tokenAmount,
    tokenContract,
    tokenSymbol,
    isPPV,
    ppvAmount,
    ppvCurrency,
    isWatch2Earn,
    w2eTotal,
    w2eViews,
    w2eComments,
    isSubscribersOnly,
    myPlanIds,
  } = input;

  const onSolana = isSolanaChain(chainId);
  const evmChainConfig = !onSolana ? getChainConfig(chainId as never) : null;

  const streamInfo: StreamInfo = {
    isLockContent: false,
    isPayPerView: false,
    isAddBounty: false,
  };

  /**
   * A hold gate is only ever written together with its amount. `isLockContent`
   * without `lockContentAmount` is a condition nobody can satisfy and nobody can
   * fail: readers get a lock badge over an unlock sheet with no button in it,
   * while the API serves the body in full regardless.
   */
  if (isTokenGated && tokenAmount) {
    const amount = parseFloat(tokenAmount);
    if (amount > 0) {
      let contract = tokenContract.trim();
      let symbol = tokenSymbol.trim() || 'TOKEN';
      if (!contract) {
        const known = findLockToken(symbol, chainId);
        if (!known) return { error: 'Select a valid token for token gating', streamInfo, bounty: null };
        contract = known.address;
        symbol = known.symbol;
      } else if (onSolana) {
        if (!isValidSolanaAddress(contract)) {
          return { error: 'Invalid Solana token mint address for token gating', streamInfo, bounty: null };
        }
      } else if (!isValidEvmAddress(contract)) {
        return { error: 'Invalid token contract address for token gating', streamInfo, bounty: null };
      }
      streamInfo.isLockContent = true;
      streamInfo.lockContentAmount = amount;
      streamInfo.lockContentContractAddress = contract;
      streamInfo.lockContentTokenSymbol = symbol;
      streamInfo.lockContentChainIds = [chainId];
    }
  }

  // Subscribers-only does NOT go in streamInfo. It is not a hold gate: the post
  // carries the creator's plan ids in `plans`, and the feed pipeline joins the
  // viewer's subscriptions to decide.
  const subscriberPlanIds =
    isSubscribersOnly && !onSolana && myPlanIds.length ? myPlanIds : undefined;

  if (isPPV && ppvAmount) {
    const ppvValue = parseFloat(ppvAmount);
    if (ppvValue > 0) {
      streamInfo.isPayPerView = true;
      streamInfo.payPerViewAmount = ppvValue;

      if (onSolana) {
        // Without the mint address and chain id the post ships as "PPV, no
        // token, no chain": mobile reads payPerViewChainId as undefined and
        // routes the unlock to the EVM DHB path, and the backend cannot resolve
        // a mint for /solana/build-payment. Nobody can pay it.
        const splSymbol = ppvCurrency === 'USD' || ppvCurrency === 'DHB' ? 'SOL' : ppvCurrency;
        const splToken = findLockToken(splSymbol, chainId);
        if (!splToken) {
          return { error: `${splSymbol} is not available for PPV on Solana`, streamInfo, bounty: null };
        }
        streamInfo.payPerViewTokenSymbol = splToken.symbol;
        streamInfo.payPerViewContractAddress = splToken.address;
        streamInfo.payPerViewChainIds = [chainId];
      } else {
        // EVM PPV is always DHB. Old drafts can still carry USD, which ships
        // with no contract address and cannot be paid — coerce it.
        streamInfo.payPerViewTokenSymbol = 'DHB';
        if (evmChainConfig?.dhbToken) {
          streamInfo.payPerViewContractAddress = evmChainConfig.dhbToken;
          streamInfo.payPerViewChainIds = [chainId];
        }
      }
    }
  }

  // Bounty (watch-to-earn) — DHB on the selected EVM chain.
  let bounty: BountyTerms | null = null;
  if (!onSolana && isWatch2Earn && w2eTotal && w2eViews && evmChainConfig) {
    const bountyAmount = parseFloat(w2eTotal);
    const viewerCount = w2eViews.trim() !== '' ? parseInt(w2eViews) : 10;
    const commentCount = w2eComments.trim() !== '' ? parseInt(w2eComments) : 0;

    if (bountyAmount > 0 && (viewerCount > 0 || commentCount > 0)) {
      streamInfo.isAddBounty = true;
      streamInfo.addBountyTokenSymbol = 'DHB';
      streamInfo.addBountyAmount = bountyAmount;
      streamInfo.addBountyFirstXViewers = viewerCount;
      streamInfo.addBountyFirstXComments = commentCount;
      streamInfo.addBountyChainId = chainId;
      bounty = { amount: bountyAmount, viewers: viewerCount, commenters: commentCount };
    }
  }

  return { streamInfo, subscriberPlanIds, bounty };
}
