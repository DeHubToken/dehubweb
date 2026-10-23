import type { PostChainId } from '@/components/app/ChainSelector';
import { isSolanaChain } from '@/lib/chains/constants';

/** Off-chain publishing uses the account-authenticated EVM endpoint. The
 * Solana endpoint constructs a signing transaction even with mintOptOut set,
 * so selecting Solana in Settings must not send an off-chain post there. */
export function postUploadChainId(preferred: PostChainId, shouldMint: boolean): PostChainId {
  return !shouldMint && isSolanaChain(preferred) ? 8453 : preferred;
}
