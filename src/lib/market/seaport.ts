/**
 * Seaport 1.6 orders for the DeHub NFT market.
 *
 * Seaport is the open swap contract the market settles on: one canonical
 * deployment at the same address on BNB and Base. A seller signs an order
 * (nothing is sent on-chain), the backend checks and stores it, and a buyer
 * fills it in one transaction that moves the NFT and every payment at once.
 *
 * Orders never use a zone or conduit, so approvals go to Seaport itself. The
 * backend refuses any order shaped differently from what this file builds
 * (dehub-stream-backend src/market/seaport.ts), so keep the two in step.
 */
import { Interface, TypedDataEncoder, ZeroAddress, ZeroHash, hexlify, randomBytes } from 'ethers';

export const SEAPORT_ADDRESS = '0x0000000000000068F116a894984e2DB1123eB395';
export const NATIVE = ZeroAddress.toLowerCase();

export enum ItemType {
  NATIVE = 0,
  ERC20 = 1,
  ERC721 = 2,
  ERC1155 = 3,
}

export const SEAPORT_TYPES = {
  OrderComponents: [
    { name: 'offerer', type: 'address' },
    { name: 'zone', type: 'address' },
    { name: 'offer', type: 'OfferItem[]' },
    { name: 'consideration', type: 'ConsiderationItem[]' },
    { name: 'orderType', type: 'uint8' },
    { name: 'startTime', type: 'uint256' },
    { name: 'endTime', type: 'uint256' },
    { name: 'zoneHash', type: 'bytes32' },
    { name: 'salt', type: 'uint256' },
    { name: 'conduitKey', type: 'bytes32' },
    { name: 'counter', type: 'uint256' },
  ],
  OfferItem: [
    { name: 'itemType', type: 'uint8' },
    { name: 'token', type: 'address' },
    { name: 'identifierOrCriteria', type: 'uint256' },
    { name: 'startAmount', type: 'uint256' },
    { name: 'endAmount', type: 'uint256' },
  ],
  ConsiderationItem: [
    { name: 'itemType', type: 'uint8' },
    { name: 'token', type: 'address' },
    { name: 'identifierOrCriteria', type: 'uint256' },
    { name: 'startAmount', type: 'uint256' },
    { name: 'endAmount', type: 'uint256' },
    { name: 'recipient', type: 'address' },
  ],
};

export interface OfferItem {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
}
export interface ConsiderationItem extends OfferItem {
  recipient: string;
}
export interface OrderComponents {
  offerer: string;
  zone: string;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  orderType: number;
  startTime: string;
  endTime: string;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  counter: string;
}

const ITEM = '(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)';
const CITEM = '(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)';
const PARAMS = `(address offerer,address zone,${ITEM}[] offer,${CITEM}[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 totalOriginalConsiderationItems)`;
const COMPONENTS = `(address offerer,address zone,${ITEM}[] offer,${CITEM}[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)`;

export const SEAPORT_IFACE = new Interface([
  `function fulfillOrder((${PARAMS} parameters, bytes signature) order, bytes32 fulfillerConduitKey) payable returns (bool)`,
  `function cancel(${COMPONENTS}[] orders) returns (bool)`,
  'function getCounter(address offerer) view returns (uint256)',
]);

export const NFT_IFACE = new Interface([
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
]);

export function seaportDomain(chainId: number) {
  return { name: 'Seaport', version: '1.6', chainId, verifyingContract: SEAPORT_ADDRESS };
}

export function orderHash(c: OrderComponents): string {
  return TypedDataEncoder.hashStruct('OrderComponents', SEAPORT_TYPES, c).toLowerCase();
}

/** The full EIP-712 payload, as eth_signTypedData_v4 wants it. */
export function typedDataJson(c: OrderComponents, chainId: number): string {
  return JSON.stringify({
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...SEAPORT_TYPES,
    },
    primaryType: 'OrderComponents',
    domain: seaportDomain(chainId),
    message: c,
  });
}

export interface NftRef {
  contract: string;
  tokenId: string;
  standard: 'erc721' | 'erc1155';
  amount?: string;
}

export interface FeeTerms {
  feeRecipient: string;
  feeBps: number;
  royalty: { receiver: string; amount: string } | null;
}

const DAY = 24 * 60 * 60;

function nftItem(nft: NftRef): OfferItem {
  const amount = nft.standard === 'erc721' ? '1' : String(nft.amount ?? '1');
  return {
    itemType: nft.standard === 'erc721' ? ItemType.ERC721 : ItemType.ERC1155,
    token: nft.contract.toLowerCase(),
    identifierOrCriteria: nft.tokenId,
    startAmount: amount,
    endAmount: amount,
  };
}

function base(offerer: string, days: number, counter: string) {
  const now = Math.floor(Date.now() / 1000);
  return {
    offerer: offerer.toLowerCase(),
    zone: ZeroAddress.toLowerCase(),
    orderType: 0,
    startTime: String(now - 60),
    endTime: String(now + Math.max(1, Math.min(180, days)) * DAY),
    zoneHash: ZeroHash,
    salt: BigInt(hexlify(randomBytes(16))).toString(),
    conduitKey: ZeroHash,
    counter,
  };
}

/** Royalty owed by someone other than the seller, or nothing. */
function royaltyFor(terms: FeeTerms, seller: string): bigint {
  if (!terms.royalty) return 0n;
  if (terms.royalty.receiver.toLowerCase() === seller.toLowerCase()) return 0n;
  return BigInt(terms.royalty.amount);
}

/** What the seller keeps from a sale at `price`. */
export function sellerProceeds(price: bigint, terms: FeeTerms, seller: string): bigint {
  return price - (price * BigInt(terms.feeBps)) / 10_000n - royaltyFor(terms, seller);
}

function feeItems(itemType: number, currency: string, price: bigint, terms: FeeTerms, seller: string): ConsiderationItem[] {
  const out: ConsiderationItem[] = [];
  const fee = (price * BigInt(terms.feeBps)) / 10_000n;
  const item = (amount: bigint, recipient: string): ConsiderationItem => ({
    itemType,
    token: currency,
    identifierOrCriteria: '0',
    startAmount: amount.toString(),
    endAmount: amount.toString(),
    recipient: recipient.toLowerCase(),
  });
  if (fee > 0n) out.push(item(fee, terms.feeRecipient));
  const royalty = royaltyFor(terms, seller);
  if (royalty > 0n) out.push(item(royalty, terms.royalty!.receiver));
  return out;
}

/** A listing: the NFT for `price` (total the buyer pays) in `currency`. */
export function buildListing(args: {
  seller: string;
  nft: NftRef;
  currency: string;
  price: bigint;
  terms: FeeTerms;
  days: number;
  counter: string;
}): OrderComponents {
  const currency = args.currency.toLowerCase();
  const itemType = currency === NATIVE ? ItemType.NATIVE : ItemType.ERC20;
  const proceeds = sellerProceeds(args.price, args.terms, args.seller);
  if (proceeds <= 0n) throw new Error('Price is too low to cover fees');
  return {
    ...base(args.seller, args.days, args.counter),
    offer: [nftItem(args.nft)],
    consideration: [
      {
        itemType,
        token: currency,
        identifierOrCriteria: '0',
        startAmount: proceeds.toString(),
        endAmount: proceeds.toString(),
        recipient: args.seller.toLowerCase(),
      },
      ...feeItems(itemType, currency, args.price, args.terms, args.seller),
    ],
  };
}

/**
 * An offer: `price` of an ERC-20 for the NFT. The fee and royalty are paid out
 * of the offer when the holder accepts, so they keep price minus fees.
 */
export function buildOffer(args: {
  buyer: string;
  nft: NftRef;
  currency: string;
  price: bigint;
  terms: FeeTerms;
  days: number;
  counter: string;
  /** Who currently holds it; a royalty owed to them is skipped. */
  holder?: string;
}): OrderComponents {
  const currency = args.currency.toLowerCase();
  if (currency === NATIVE) throw new Error('Offers are made in a token, not the native coin');
  const nft = nftItem(args.nft);
  return {
    ...base(args.buyer, args.days, args.counter),
    offer: [{ itemType: ItemType.ERC20, token: currency, identifierOrCriteria: '0', startAmount: args.price.toString(), endAmount: args.price.toString() }],
    consideration: [
      { ...nft, recipient: args.buyer.toLowerCase() },
      ...feeItems(ItemType.ERC20, currency, args.price, args.terms, args.holder ?? ZeroAddress),
    ],
  };
}

/** The struct fulfillOrder takes: components minus the counter, plus the item count. */
export function toOrderParameters(c: OrderComponents) {
  const { counter: _counter, ...rest } = c;
  return { ...rest, totalOriginalConsiderationItems: String(c.consideration.length) };
}

/** Native coin a buyer must send to fill a listing (zero for token listings). */
export function nativeValue(c: OrderComponents): bigint {
  return c.consideration
    .filter((i) => i.itemType === ItemType.NATIVE)
    .reduce((sum, i) => sum + BigInt(i.startAmount), 0n);
}

/** Token amount the filler pays out of pocket (listing price, or fees on an offer). */
export function fillerTokenSpend(c: OrderComponents, kind: 'listing' | 'offer'): { token: string; amount: bigint } | null {
  const items = c.consideration.filter((i) => i.itemType === ItemType.ERC20);
  if (!items.length) return null;
  const amount = items.reduce((sum, i) => sum + BigInt(i.startAmount), 0n);
  return kind === 'listing' || amount > 0n ? { token: items[0].token, amount } : null;
}
