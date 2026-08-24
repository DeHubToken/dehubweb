/**
 * Paying DeHub in DHB, from the wallet the user already has
 * =========================================================
 *
 * One ERC-20 transfer to the treasury, confirmed, on whichever of Base or BNB
 * can cover it. This is the shape every paid feature here settles in — a PPV
 * unlock, a tip, a stage dubbing session, a post past its daily allowance —
 * and it is deliberately not a deposit balance: DHB is the token the app runs
 * on and every user holds one, so making them fund a second pot first would
 * be a second money path for no reason.
 *
 * Extracted from `stage-dub-payment.ts`, which was the first caller and now
 * delegates here.
 */

import { Interface } from 'ethers';
import {
  writeContractAA,
  getERC20Balance,
  getWalletAddress,
  switchChain,
  parseTxError,
} from '@/lib/contracts/aa-utils';
import { toWei, getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

/** DHB this wallet holds right now, across both chains we accept. */
export async function readDhbBalance(): Promise<number> {
  try {
    const address = await getWalletAddress();
    if (!address) return 0;
    const [base, bnb] = await Promise.all([
      getERC20Balance(getChainConfig(BASE_CHAIN_ID).dhbToken, address, BASE_CHAIN_ID).catch(() => BigInt(0)),
      getERC20Balance(getChainConfig(BNB_CHAIN_ID).dhbToken, address, BNB_CHAIN_ID).catch(() => BigInt(0)),
    ]);
    // The larger of the two, not the sum: a transfer settles on one chain, so
    // what matters is whether either side can cover the bill on its own.
    const held = base > bnb ? base : bnb;
    return Number(held / BigInt(1e12)) / 1e6;
  } catch {
    return 0;
  }
}

export interface DhbPaymentResult {
  txHash: string;
  chain: 'Base' | 'BNB';
  chainId: number;
}

export interface DhbPaymentOptions {
  /** Shown in the wallet prompt and in transaction errors. */
  context: string;
  /** What to say when the wallet is short. Gets the rounded amount and what is held. */
  shortfallMessage?: (amount: number, held: number) => string;
  /** Refuse to send unless this wallet is the one signing. */
  expectedSigner?: string | null;
}

/**
 * Send `amountDhb` to `treasury` and return the mined transaction.
 *
 * Rounds up to a whole DHB: every price this is called with is quoted in
 * whole tokens, and a fractional amount only invites float error between the
 * quote and the transfer.
 */
export async function payDhb(
  amountDhb: number,
  treasury: string,
  options: DhbPaymentOptions,
): Promise<DhbPaymentResult> {
  const amount = Math.ceil(amountDhb);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nothing to pay.');
  if (!treasury) throw new Error('No payment address configured.');

  const amountWei = toWei(amount, 18);
  const signerAddress = await getWalletAddress();
  if (!signerAddress) throw new Error(`Connect a wallet to pay for ${options.context.toLowerCase()}.`);

  if (
    options.expectedSigner &&
    signerAddress.toLowerCase() !== options.expectedSigner.toLowerCase()
  ) {
    // The bill is opened against one account server-side; paying from another
    // would transfer real DHB and settle nothing.
    throw new Error('Your wallet changed while this was being prepared. Reload and try again.');
  }

  const [baseBalance, bnbBalance] = await Promise.all([
    getERC20Balance(getChainConfig(BASE_CHAIN_ID).dhbToken, signerAddress, BASE_CHAIN_ID).catch(() => BigInt(0)),
    getERC20Balance(getChainConfig(BNB_CHAIN_ID).dhbToken, signerAddress, BNB_CHAIN_ID).catch(() => BigInt(0)),
  ]);

  let payChainId: ChainId;
  let chain: 'Base' | 'BNB';
  if (baseBalance >= amountWei) {
    payChainId = BASE_CHAIN_ID;
    chain = 'Base';
  } else if (bnbBalance >= amountWei) {
    payChainId = BNB_CHAIN_ID;
    chain = 'BNB';
  } else {
    const held = Math.floor(Number(baseBalance > bnbBalance ? baseBalance : bnbBalance) / 1e18);
    throw new Error(
      options.shortfallMessage?.(amount, held) ??
        `Not enough DHB. This costs ${amount.toLocaleString()} DHB and you hold ${held.toLocaleString()}.`,
    );
  }

  await switchChain(payChainId);

  try {
    const result = await writeContractAA(
      getChainConfig(payChainId).dhbToken,
      erc20TransferInterface,
      'transfer',
      [treasury, amountWei],
      { context: options.context, chainId: payChainId },
    );
    // wait() resolves with status 0 for a REVERTED transaction rather than
    // throwing, so ignoring the receipt would report a failed transfer as paid.
    const receipt = await result.wait(1);
    if (receipt?.status !== 1) {
      throw new Error('The DHB transfer did not go through. Nothing has been charged.');
    }
    return { txHash: receipt.hash ?? result.hash, chain, chainId: payChainId };
  } catch (err) {
    throw new Error(parseTxError(err) || 'Payment failed.');
  }
}
