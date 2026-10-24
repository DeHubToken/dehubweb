import { isAddress, ZeroAddress } from 'ethers';
import { getMintFee } from '@/lib/api/dehub/content';
import { translateCopy as _translateCopy } from '@/i18n/copy';

/** Refresh routing without changing the amount the creator already accepted. */
export async function currentMintFeeRecipient(chainId: number): Promise<string> {
  const latest = await getMintFee(chainId);
  if (!latest?.chargeable || latest.chainId !== chainId || !latest.recipient ||
    !isAddress(latest.recipient) || latest.recipient.toLowerCase() === ZeroAddress) {
    throw new Error(_translateCopy("copy.51119a7f87de", { defaultValue: "Unable to verify the mint fee destination. Please try again." }));
  }
  return latest.recipient;
}
