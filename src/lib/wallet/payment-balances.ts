import { getCachedSolanaAddress } from '@/lib/solana/address-cache';
import { CHAIN_CONFIGS, initChainRpcUrls } from '@/lib/contracts/dhb-token';
import { solanaRpcUrl } from '@/lib/chains/solana';
import { readPaymentBalances } from '@/lib/payment-options';
import type { PaymentAsset } from '@/lib/crypto-purchase';
export async function loadPaymentBalances(assets: PaymentAsset[], wallet: string, solana?: string) {
  await initChainRpcUrls();
  return readPaymentBalances(assets, wallet, solana || getCachedSolanaAddress() || undefined, {
    base: [CHAIN_CONFIGS[8453].rpcUrl, 'https://base-rpc.publicnode.com', 'https://base.drpc.org'],
    eth: CHAIN_CONFIGS[1].rpcUrl,
    bsc: CHAIN_CONFIGS[56].rpcUrl,
    robinhood: CHAIN_CONFIGS[4663]?.rpcUrl,
    sol: solanaRpcUrl(),
  });
}
