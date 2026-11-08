import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { mintExistingPost, getMintFee, type MintFeeQuoteResponse } from '@/lib/api/dehub';
import { confirmEvmMint } from '@/lib/api/dehub/solana';
import { isSmartWalletSession } from '@/lib/connection-source';
import { formatMintFee, mintFeeShortfall, mintFeeTopUpPath } from '@/lib/mint-fee-balance';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { getNFTInfo } from '@/lib/api/dehub/feed';
import type { ChainId } from '@/components/app/ChainSelector';

/**
 * Put a post that was published off-chain onto the chain.
 *
 * The post already has its token id, so this is the same two steps as posting
 * — signature, then contract call — minus the upload. The fee rides in the
 * same user operation as the mint, exactly as it does in the composer.
 *
 * Wallet and contract modules are imported lazily for the same reason the
 * composer does it: this hook is reachable from feed cards, which are in the
 * entry bundle, and the wallet stack must stay out of it.
 */
export function useMintExistingPost() {
  const { t: _copy } = _useCopy();
  const [isMinting, setIsMinting] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  /**
   * `chosenChainId` is the chain picked in the mint sheet. Without one the
   * post goes on-chain where it was published.
   */
  const mint = useCallback(async (tokenId: number | string, chainId?: number, chosenChainId?: number) => {
    if (isMinting) return false;
    setIsMinting(true);
    const toastId = 'mint-existing';

    try {
      const post = await getNFTInfo(String(tokenId));
      const targetChain = (chosenChainId || post.chainId || chainId || BASE_CHAIN_ID) as ChainId;
      const info = post.streamInfo;
      const hasBounty = !!info?.isAddBounty;
      const bountyAmount = Number(info?.addBountyAmount);
      const viewers = Number(info?.addBountyFirstXViewers ?? 0);
      const commenters = Number(info?.addBountyFirstXComments ?? 0);
      if (hasBounty && (!(bountyAmount > 0) || !Number.isFinite(bountyAmount) ||
        !Number.isInteger(viewers) || viewers < 0 || !Number.isInteger(commenters) || commenters < 0 || viewers + commenters === 0 ||
        info?.addBountyTokenSymbol !== 'DHB')) throw new Error(_copy("copy.038a8e5ff421", { defaultValue: "Invalid bounty terms. Funding cannot be skipped." }));

      const [{ mintOnChainWithFee }, { mintWithBounty }] = await Promise.all([
        import('@/lib/contracts/stream-collection'),
        import('@/lib/contracts/stream-controller'),
      ]);

      // Price and affordability first: finding out after the signature has been
      // issued would leave the post briefly exempt from nothing and the creator
      // staring at a failed transfer.
      let fee: MintFeeQuoteResponse | null = null;
      if (!hasBounty && isSmartWalletSession()) {
        fee = await getMintFee(targetChain);
        if (fee?.chargeable && fee.amount > 0) {
          // Paid in the quote's own coin: BNB / ETH by default, DHB if the
          // server is switched back. An unreadable balance decides nothing.
          const { getWeb3AuthSigner } = await import('@/lib/contracts/stream-collection');
          const address = await getWeb3AuthSigner();
          if (await mintFeeShortfall(fee, address, targetChain)) {
            const topUp = mintFeeTopUpPath(fee);
            toast.error(t('postComposer.notEnoughTokensToMint'), {
              description: _copy("copy.ec486a9f842c", { defaultValue: "Minting this post costs {{value1}} {{value2}}.", value1: formatMintFee(fee.amount), value2: fee.symbol }),
              action: {
                label: fee.isNative
                  ? _copy("copy.79f52e0ce619", { defaultValue: "Top up" })
                  : t('postComposer.getTokens'),
                onClick: () => navigate(topUp),
              },
              duration: 10000,
            });
            return false;
          }
        }
      }

      toast.loading(_copy("copy.ef478f3aaf43", { defaultValue: "Minting post" }), { id: toastId, duration: Infinity });

      const sig = await mintExistingPost(tokenId, targetChain);
      // The signature binds the chain. A server that ignored the pick signed
      // for the old one, and sending that to another chain would only revert.
      const signedChain = Number((sig as { chainId?: number }).chainId ?? targetChain);
      if (signedChain !== Number(targetChain)) {
        throw new Error(t('mintChain.notAvailable', { defaultValue: 'Minting on this chain is not available yet.' }));
      }
      // A retry must fund the saved reward pool, just like the original composer.
      const result = hasBounty ? { hash: await mintWithBounty({
        tokenId: sig.createdTokenId, timestamp: sig.timestamp, v: sig.v, r: sig.r, s: sig.s,
        uri: sig.uri, chainId: targetChain, bountyAmount, countOfViewers: viewers, countOfCommentors: commenters,
      }) } : await mintOnChainWithFee(
        {
          tokenId: sig.createdTokenId,
          timestamp: sig.timestamp,
          v: sig.v,
          r: sig.r,
          s: sig.s,
          uri: sig.uri,
          chainId: targetChain,
        },
        fee,
      );

      // Best-effort nudge, same as the composer: the indexer picks the mint up
      // from the chain regardless, so a failure here is not the creator's
      // problem and must not surface.
      confirmEvmMint({
        tokenId: sig.createdTokenId,
        txHash: result.hash,
        chainId: targetChain as number,
      }).catch((err) => console.warn('[MintExisting] confirm-mint queue failed:', err));

      toast.success(_copy("copy.4ae79158e4cd", { defaultValue: "Post minted" }), { id: toastId });
      return true;
    } catch (err: any) {
      console.error('[MintExisting] failed:', err);
      // The reason comes from the API or the wallet stack and is not always in
      // the reader's language, so the headline is ours and the reason sits under it.
      const reason = typeof err?.message === 'string' ? err.message : '';
      toast.error(_copy("copy.af3e311c0946", { defaultValue: "Could not mint this post" }), { id: toastId, ...(reason ? { description: reason } : {}) });
      return false;
    } finally {
      setIsMinting(false);
    }
  }, [isMinting, navigate, t, _copy]);

  return { mint, isMinting };
}
