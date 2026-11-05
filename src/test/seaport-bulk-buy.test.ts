import { describe, expect, it } from 'vitest';
import { NATIVE, SEAPORT_IFACE, buildListing, nativeValue, toOrderParameters } from '@/lib/market/seaport';

const SELLER = '0x1111111111111111111111111111111111111111';
const listing = (tokenId: string, price: bigint) =>
  buildListing({
    seller: SELLER,
    nft: { contract: '0x2222222222222222222222222222222222222222', tokenId, standard: 'erc721', amount: '1' },
    currency: NATIVE,
    price,
    terms: { feeRecipient: '0x3333333333333333333333333333333333333333', feeBps: 200, royalty: null },
    days: 7,
    counter: '0',
  });

describe('bulk buy (fulfillAvailableOrders)', () => {
  it('encodes several listings with one fulfillment per item and pays their sum', () => {
    const orders = [listing('1', 10n ** 16n), listing('2', 3n * 10n ** 16n)];
    const data = SEAPORT_IFACE.encodeFunctionData('fulfillAvailableOrders', [
      orders.map((c) => ({ parameters: toOrderParameters(c), signature: '0x' })),
      orders.flatMap((c, i) => c.offer.map((_, j) => [{ orderIndex: i, itemIndex: j }])),
      orders.flatMap((c, i) => c.consideration.map((_, j) => [{ orderIndex: i, itemIndex: j }])),
      '0x' + '0'.repeat(64),
      orders.length,
    ]);
    expect(data.slice(0, 10)).toBe(SEAPORT_IFACE.getFunction('fulfillAvailableOrders')!.selector);
    expect(orders.reduce((s, c) => s + nativeValue(c), 0n)).toBe(4n * 10n ** 16n);
  });
});
