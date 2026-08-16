import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { mintExistingPost, getMintFee, type MintFeeQuoteResponse } from '@/lib/api/dehub';
import { confirmEvmMint } from '@/lib/api/dehub/solana';
import { isSmartWalletSession } from '@/lib/connection-source';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
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
  const [isMinting, setIsMinting] = useState(false);
  const navigate = useNavigate();

  const mint = useCallback(async (tokenId: number | string, chainId?: number) => {
    if (isMinting) return false;
    setIsMinting(true);
    const toastId = 'mint-existing';

    try {
      const targetChain = (chainId || BASE_CHAIN_ID) as ChainId;

      const [{ mintOnChainWithFee }, { getDHBBalance }, { getERC20Balance }] = await Promise.all([
        import('@/lib/contracts/stream-collection'),
        import('@/lib/contracts/stream-controller'),
        import('@/lib/contracts/aa-utils'),
      ]);

      // Price and affordability first: finding out after the signature has been
      // issued would leave the post briefly exempt from nothing and the creator
      // staring at a failed transfer.
      let fee: MintFeeQuoteResponse | null = null;
      if (isSmartWalletSession()) {
        fee = await getMintFee(targetChain);
        if (fee?.chargeable && fee.amount > 0 && !fee.isNative) {
          const { getWeb3AuthSigner } = await import('@/lib/contracts/stream-collection');
          const address = await getWeb3AuthSigner();
          // Balance of the QUOTE's token at the QUOTE's decimals — hardcoding
          // chainConfig.dhbToken at 1e18 broke any non-18-dp fee token.
          const balance = fee.tokenAddress
            ? await getERC20Balance(fee.tokenAddress, address, targetChain)
            : await getDHBBalance(address, targetChain);
          const needed =
            (BigInt(Math.ceil(fee.amount * 1e6)) * BigInt(10) ** BigInt(fee.decimals ?? 18)) /
            BigInt(1e6);
          if (balance < needed) {
            toast.error('Not enough DHB to mint', {
              description: `Minting this post costs ${fee.amount} ${fee.symbol}.`,
              action: { label: 'Get DHB', onClick: () => navigate('/app/buy') },
              duration: 10000,
            });
            return false;
          }
        }
      }

      toast.loading('Minting post', { id: toastId, duration: Infinity });

      const sig = await mintExistingPost(tokenId);
      const result = await mintOnChainWithFee(
        {
          tokenId: sig.createdTokenId,
          timestamp: sig.timestamp,
          v: sig.v,
          r: sig.r,
          s: sig.s,
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

      toast.success('Post minted', { id: toastId });
      return true;
    } catch (err: any) {
      console.error('[MintExisting] failed:', err);
      toast.error(err?.message || 'Could not mint this post', { id: toastId });
      return false;
    } finally {
      setIsMinting(false);
    }
  }, [isMinting, navigate]);

  return { mint, isMinting };
}
