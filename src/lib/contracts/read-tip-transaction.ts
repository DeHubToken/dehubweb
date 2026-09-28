import { Interface, JsonRpcProvider, formatUnits } from 'ethers';
import type { ChainId } from '@/components/app/ChainSelector';
import { DHB_TOKEN, getChainConfig } from '@/lib/contracts/dhb-token';

const TIP_TX_ABI = [
  'function sendTip(uint256 tokenId, uint256 amount, address to, address tokenAddress)',
] as const;

const tipTransactionInterface = new Interface(TIP_TX_ABI);

export interface ConfirmedTipDetails {
  tokenId: string | null;
  amount: number;
  receiverAddress: string;
}

/**
 * A smart-wallet tip lands on-chain as an EntryPoint bundle, so the outer
 * transaction's `to` is the EntryPoint, never the stream controller. Checking
 * `to` alone rejected every such tip and nothing was ever saved. The sendTip
 * call is still inside the bundle's calldata with its four static arguments
 * inline, so find its selector and decode from there — after the receipt
 * proves the stream controller actually ran in this transaction.
 */
async function parseWrappedTip(
  provider: JsonRpcProvider,
  txHash: string,
  data: string,
  streamController: string,
) {
  const receipt = await provider.getTransactionReceipt(txHash);
  const ranController = receipt?.status === 1
    && receipt.logs.some((log) => log.address.toLowerCase() === streamController.toLowerCase());
  if (!ranController) {
    throw new Error('Tip transaction was sent to an unexpected contract');
  }

  const selector = tipTransactionInterface.getFunction('sendTip')!.selector.slice(2);
  const at = data.toLowerCase().indexOf(selector);
  if (at < 0) return null;
  // Selector + 4 × 32-byte words.
  return tipTransactionInterface.parseTransaction({ data: `0x${data.slice(at, at + 8 + 256)}` });
}

export async function readConfirmedTipDetails(
  txHash: string,
  chainId: ChainId,
): Promise<ConfirmedTipDetails> {
  const chainConfig = getChainConfig(chainId);
  const provider = new JsonRpcProvider(chainConfig.rpcUrl);
  const tx = await provider.getTransaction(txHash);

  if (!tx) {
    throw new Error('Tip transaction not found on-chain');
  }

  const parsed = tx.to?.toLowerCase() === chainConfig.streamController.toLowerCase()
    ? tipTransactionInterface.parseTransaction({ data: tx.data, value: tx.value })
    : await parseWrappedTip(provider, txHash, tx.data, chainConfig.streamController);

  if (!parsed || parsed.name !== 'sendTip') {
    throw new Error('Unable to decode tip transaction');
  }

  const tokenAddress = String(parsed.args[3]);
  if (tokenAddress.toLowerCase() !== chainConfig.dhbToken.toLowerCase()) {
    throw new Error('Tip transaction used an unexpected token');
  }

  const amount = Number(formatUnits(parsed.args[1], DHB_TOKEN.decimals));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Decoded tip amount is invalid');
  }

  const tokenId = parsed.args[0].toString();

  return {
    tokenId: tokenId === '0' ? null : tokenId,
    amount,
    receiverAddress: String(parsed.args[2]),
  };
}
