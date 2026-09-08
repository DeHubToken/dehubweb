import { parseUnits } from 'ethers';
import { Buffer } from 'buffer';
import type { ChainId } from '@/components/app/ChainSelector';
import { ensureSignerOnChain, writeBatchAA } from '@/lib/contracts/aa-utils';
import { isSmartWalletSession } from '@/lib/connection-source';
import { sendERC20Token, sendNativeToken } from '@/lib/wallet/send';
import { DAO_TREASURY_ADDRESS } from '@/lib/dao-treasury';
import { connectSolanaWallet, getSolanaProvider, isValidSolanaAddress } from '@/lib/solana/wallet';
import { SOLANA_PUBLIC_RPC, SPL_TOKEN_PROGRAM_ID } from '@/lib/chains/solana';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_ENABLED, ROBINHOOD_TOKENS } from '@/lib/chains/robinhood';

export interface DaoPaymentOption {
  chainId: 1 | 56 | 101 | 4663 | 8453;
  chain: string;
  symbol: 'ETH' | 'BNB' | 'SOL' | 'USDC' | 'USDT';
  address: string;
  decimals: number;
  native: boolean;
  enabled: boolean;
  unavailableReason?: string;
}

const DAO_SOLANA_TREASURY_ADDRESS =
  ((import.meta.env.VITE_DAO_SOLANA_TREASURY_ADDRESS as string | undefined) ?? '').trim();

export const DAO_PAYMENT_OPTIONS: DaoPaymentOption[] = [
  { chainId: 8453, chain: 'Base', symbol: 'ETH', address: '0x0', decimals: 18, native: true, enabled: true },
  { chainId: 8453, chain: 'Base', symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, native: false, enabled: true },
  { chainId: 8453, chain: 'Base', symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, native: false, enabled: true },
  { chainId: 56, chain: 'BNB Chain', symbol: 'BNB', address: '0x0', decimals: 18, native: true, enabled: true },
  { chainId: 56, chain: 'BNB Chain', symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, native: false, enabled: true },
  { chainId: 56, chain: 'BNB Chain', symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, native: false, enabled: true },
  { chainId: 1, chain: 'Ethereum', symbol: 'ETH', address: '0x0', decimals: 18, native: true, enabled: true },
  { chainId: 1, chain: 'Ethereum', symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, native: false, enabled: true },
  { chainId: 1, chain: 'Ethereum', symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, native: false, enabled: true },
  ...(ROBINHOOD_ENABLED ? [
    { chainId: ROBINHOOD_CHAIN_ID, chain: 'Robinhood Chain', symbol: 'ETH', address: ROBINHOOD_TOKENS.ETH, decimals: 18, native: true, enabled: true },
    { chainId: ROBINHOOD_CHAIN_ID, chain: 'Robinhood Chain', symbol: 'USDC', address: ROBINHOOD_TOKENS.USDC, decimals: 6, native: false, enabled: true },
    { chainId: ROBINHOOD_CHAIN_ID, chain: 'Robinhood Chain', symbol: 'USDT', address: ROBINHOOD_TOKENS.USDT, decimals: 6, native: false, enabled: true },
  ] as DaoPaymentOption[] : []),
  {
    chainId: 101,
    chain: 'Solana',
    symbol: 'SOL',
    address: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    native: true,
    enabled: isValidSolanaAddress(DAO_SOLANA_TREASURY_ADDRESS),
    unavailableReason: 'The DAO Solana receiving address has not been configured yet.',
  },
  {
    chainId: 101,
    chain: 'Solana',
    symbol: 'USDC',
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    native: false,
    enabled: isValidSolanaAddress(DAO_SOLANA_TREASURY_ADDRESS),
    unavailableReason: 'The DAO Solana receiving address has not been configured yet.',
  },
  {
    chainId: 101,
    chain: 'Solana',
    symbol: 'USDT',
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    native: false,
    enabled: isValidSolanaAddress(DAO_SOLANA_TREASURY_ADDRESS),
    unavailableReason: 'The DAO Solana receiving address has not been configured yet.',
  },
];

export function daoPaymentRecipient(chainId: number): string | null {
  return chainId === 101
    ? (isValidSolanaAddress(DAO_SOLANA_TREASURY_ADDRESS) ? DAO_SOLANA_TREASURY_ADDRESS : null)
    : DAO_TREASURY_ADDRESS;
}

const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

function amountToLeBytes(amount: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let rest = amount;
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return bytes;
}

async function sendSolana(
  option: DaoPaymentOption,
  recipient: string,
  amount: number,
): Promise<string> {
  const {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
  } = await import('@solana/web3.js');
  const connection = new Connection(SOLANA_PUBLIC_RPC, 'confirmed');
  const embedded = isSmartWalletSession();
  const phantom = embedded ? null : getSolanaProvider();
  const payerAddress = embedded
    ? await import('@/lib/smart-wallet').then(wallet => wallet.getDerivedSolanaAddress())
    : phantom ? await connectSolanaWallet() : null;
  if (!payerAddress) {
    throw new Error('Unlock your DeHub wallet or connect Phantom to pay on Solana.');
  }

  const payer = new PublicKey(payerAddress);
  const destination = new PublicKey(recipient);
  const transaction = new Transaction();

  if (option.native) {
    transaction.add(SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: destination,
      lamports: parseUnits(String(amount), option.decimals),
    }));
  } else {
    const tokenProgram = new PublicKey(SPL_TOKEN_PROGRAM_ID);
    const associatedProgram = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
    const mint = new PublicKey(option.address);
    const [sourceToken] = PublicKey.findProgramAddressSync(
      [payer.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      associatedProgram,
    );
    const [destinationToken] = PublicKey.findProgramAddressSync(
      [destination.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      associatedProgram,
    );

    // Create-idempotent is safe when the DAO already has this token account and
    // creates it (with the buyer paying rent) when it does not.
    transaction.add(new TransactionInstruction({
      programId: associatedProgram,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: destinationToken, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1]),
    }));

    const units = parseUnits(String(amount), option.decimals);
    transaction.add(new TransactionInstruction({
      programId: tokenProgram,
      keys: [
        { pubkey: sourceToken, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: destinationToken, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([12, ...amountToLeBytes(units), option.decimals]),
    }));
  }

  const latest = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = payer;
  const signed = phantom
    ? await phantom.signTransaction(transaction)
    : await import('@/lib/smart-wallet').then((wallet) => wallet.signDerivedSolanaTransaction(transaction));
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  return signature;
}

/**
 * Send one accepted offer payment directly to the DAO. No escrow and no claim:
 * the returned transaction hash is submitted separately for manual review.
 */
export async function sendDaoOfferPayment(
  option: DaoPaymentOption,
  amount: number,
): Promise<{ hash: string; recipient: string }> {
  if (!option.enabled) throw new Error(option.unavailableReason || 'That payment route is not available yet.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid payment amount.');
  const recipient = daoPaymentRecipient(option.chainId);
  if (!recipient) throw new Error(option.unavailableReason || 'No DAO receiving address is configured for that chain.');

  if (option.chainId === 101) {
    return { hash: await sendSolana(option, recipient, amount), recipient };
  }

  const chainId = option.chainId as ChainId;
  await ensureSignerOnChain(chainId);
  let result;
  if (option.native && isSmartWalletSession()) {
    result = await writeBatchAA(
      [{ to: recipient, data: '0x', value: parseUnits(String(amount), option.decimals) }],
      { context: 'DAO buy offer payment', chainId },
    );
  } else if (option.native) {
    result = await sendNativeToken(recipient, String(amount), option.decimals, chainId);
  } else {
    result = await sendERC20Token(option.address, recipient, String(amount), option.decimals, chainId);
  }

  const receipt = await result.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error('The payment transaction did not confirm.');
  return { hash: receipt.hash || result.hash, recipient };
}
