import type { Purchase } from '@/lib/crypto-purchase';
import { buildDirectSolanaPayment } from '@/lib/api/crypto-purchase';
import { getDerivedSolanaAddress, signDerivedSolanaTransaction } from '@/lib/smart-wallet';
import { isSmartWalletSession } from '@/lib/connection-source';
import { connectSolanaWallet, getSolanaProvider } from '@/lib/solana/wallet';
import { solanaRpcUrl } from '@/lib/chains/solana';

export async function sendSolanaPurchase(receipt: Purchase): Promise<string> {
  const embedded = isSmartWalletSession();
  const payer = embedded ? await getDerivedSolanaAddress() : await connectSolanaWallet();
  if (payer !== receipt.refundTo) throw new Error('Connected Solana wallet does not match this purchase.');
  if (receipt.expiresAt * 1000 <= Date.now()) throw new Error('This payment quote expired.');
  const build = await buildDirectSolanaPayment(receipt.id);
  const { Connection, Transaction } = await import('@solana/web3.js');
  const tx = Transaction.from(Uint8Array.from(atob(build.transaction), c => c.charCodeAt(0)));
  if (tx.feePayer?.toBase58() !== payer) throw new Error('Invalid payment wallet.');
  const signed = embedded ? await signDerivedSolanaTransaction(tx) : await getSolanaProvider()!.signTransaction(tx);
  return new Connection(solanaRpcUrl(), 'confirmed').sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
}

export async function connectPurchaseSolanaWallet(baseAddress: string): Promise<void> {
  const { buildDeHubLoginMessage } = await import('@/lib/dehub-login-message');
  const timestamp = Math.floor(Date.now() / 1000);
  const message = buildDeHubLoginMessage(baseAddress, timestamp);
  const proof = isSmartWalletSession()
    ? await import('@/lib/smart-wallet').then(wallet => wallet.signDerivedSolanaMessage(message))
    : await import('@/lib/solana/wallet').then(wallet => wallet.signSolanaLoginProof(message));
  if (!proof) throw new Error('Solana wallet connection was not completed.');
  const { linkSolanaWallet } = await import('@/lib/api/dehub/solana');
  await linkSolanaWallet({ solanaAddress: proof.address, signature: proof.signature, timestamp });
}
