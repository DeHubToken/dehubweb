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

  if (!tx.to || tx.to.toLowerCase() !== chainConfig.streamController.toLowerCase()) {
    throw new Error('Tip transaction was sent to an unexpected contract');
  }

  const parsed = tipTransactionInterface.parseTransaction({
    data: tx.data,
    value: tx.value,
  });

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
