import { translateCopy as _translateCopy } from '@/i18n/copy';

/** Pimlico validates user-operation fees independently of ordinary RPC estimates. */
export const pimlicoUserOperationFees = {
  async estimateFeesPerGas({ bundlerClient }: { bundlerClient: any }) {
    const prices = await bundlerClient.request({
      method: 'pimlico_getUserOperationGasPrice',
      params: [],
    });
    const quote = prices?.fast;
    if (!/^0x[\da-f]+$/i.test(quote?.maxFeePerGas ?? '') ||
        !/^0x[\da-f]+$/i.test(quote?.maxPriorityFeePerGas ?? '')) {
      throw new Error(_translateCopy('copy.85352185fc18', { defaultValue: 'Gas fee quote unavailable. Please retry.' }));
    }
    const maxFeePerGas = BigInt(quote.maxFeePerGas);
    const maxPriorityFeePerGas = BigInt(quote.maxPriorityFeePerGas);
    if (maxFeePerGas <= 0n || maxPriorityFeePerGas > maxFeePerGas) {
      throw new Error(_translateCopy('copy.85352185fc18', { defaultValue: 'Gas fee quote unavailable. Please retry.' }));
    }
    return { maxFeePerGas, maxPriorityFeePerGas };
  },
};
