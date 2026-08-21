/**
 * Paying for a dubbing session in DHB.
 * ====================================
 *
 * One transfer, at the end, for the minutes actually listened to — the same
 * way a PPV unlock or a tip is paid, from the DHB the listener already holds.
 * Signing every minute is not something you can ask of someone in the middle
 * of live audio, so the minutes are counted server-side and the wallet is
 * asked once.
 *
 * Deliberately not routed through the AI credit balance. DHB is the token the
 * app runs on and every listener already has one; making them fund a separate
 * balance first would be a second money path for no reason.
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

/** DHB the listener holds right now, across both chains we accept. */
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

export interface DubPaymentResult {
  txHash: string;
  chain: 'Base' | 'BNB';
}

/** Send `amountDhb` to the treasury and return the mined transaction. */
export async function payForDubbing(amountDhb: number, treasury: string): Promise<DubPaymentResult> {
  const amount = Math.ceil(amountDhb);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nothing to pay.');

  const amountWei = toWei(amount, 18);
  const signerAddress = await getWalletAddress();
  if (!signerAddress) throw new Error('Connect a wallet to pay for dubbing.');

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
      `Not enough DHB. This session costs ${amount.toLocaleString()} DHB and you hold ${held.toLocaleString()}.`,
    );
  }

  await switchChain(payChainId);

  try {
    const result = await writeContractAA(
      getChainConfig(payChainId).dhbToken,
      erc20TransferInterface,
      'transfer',
      [treasury, amountWei],
      { context: 'Stage dubbing', chainId: payChainId },
    );
    // wait() resolves with status 0 for a REVERTED transaction rather than
    // throwing, so ignoring the receipt would report a failed transfer as paid.
    const receipt = await result.wait(1);
    if (receipt?.status !== 1) {
      throw new Error('The DHB transfer did not go through. Nothing has been charged.');
    }
    return { txHash: receipt.hash ?? result.hash, chain };
  } catch (err) {
    throw new Error(parseTxError(err) || 'Payment failed.');
  }
}
