/**
 * "Do this on DeHub" — from inside the game.
 * ==========================================
 * The companion to the exit and readiness bridges, and it exists for the same
 * reason: every embedded game runs in an iframe sandboxed WITHOUT
 * `allow-same-origin`, so its frame is an opaque origin. From in there
 * `window.open` is gone, top navigation is gone, and a `fetch` leaves with
 * `Origin: null`, which the API's allowlist — pinned to https://dehub.io — can
 * never match. A `postMessage` is the only channel there is.
 *
 * Trenchstar's desk is three monitors showing DeHub: the feed, your profile,
 * the composer. They are meant to be DeHub, not a painting of it, and neither
 * the data nor the click can reach the app from inside the frame. Both come
 * out through here.
 *
 * THE MESSAGES
 * ------------
 *   { source: '<game id>', type: 'navigate', to: '/app/post/2008' }
 *   { source: '<game id>', type: 'feed', limit: 2 }
 *   { source: '<game id>', type: 'desk', limit: 4 }
 *   { source: '<game id>', type: 'post', text: 'gm', key: '…' }
 *   { source: '<game id>', type: 'trade', chain: 8453, side: 'buy', token, fee, amountIn, minOut, key }
 *   { source: '<game id>', type: 'compose', text: 'gm' }
 *
 * and the replies, which are the only things this side ever sends:
 *
 *   { source: 'dehub', type: 'feed', items: [...] }        // raw rows
 *   { source: 'dehub', type: 'desk', posts, me, mine }     // painted straight
 *   { source: 'dehub', type: 'posted', ok, id?, reason? }
 *   { source: 'dehub', type: 'traded', ok, key, stage?, hash?, reason? }
 *
 * WHY `desk` WHEN `feed` ALREADY EXISTS
 * -------------------------------------
 * `feed` hands over raw API rows, which is everything a screen needs except
 * the pictures. The frame cannot fetch those either — worse, it cannot even
 * DRAW one it somehow got: a monitor is a canvas uploaded as a WebGL texture,
 * and an image without CORS taints the canvas, at which point the upload
 * throws and the desk goes black. The CDN answers `Origin: null` with no
 * `Access-Control-Allow-Origin`, and the Cloudflare image transform in front
 * of it sends none at all, so there is no origin the frame can ask.
 *
 * So the host inlines them. `/cdn-cgi/image` exists on every hostname in the
 * dehub.io zone, which makes the transform SAME-ORIGIN from here — no CORS in
 * the way — and a 192px card thumbnail comes back around 4 KB. Those bytes go
 * into the frame as `data:` URLs, which taint nothing.
 *
 * WHAT IS AND IS NOT GRANTED
 * --------------------------
 * The sandbox is the security boundary and this must not become a hole in it.
 * So: `to` is matched against an allowlist of internal paths and anything else
 * is dropped — a game cannot send somebody to an arbitrary URL, off-site or
 * on. Every fetch here is made WITHOUT credentials and every endpoint is one
 * an anonymous visitor can read, so what crosses into the frame is public
 * either way. Untrusted code gets the public internet, not the session.
 *
 * `post` is the one thing here that WRITES, and it is deliberately narrow: a
 * free text post, published off-chain, for the wallet this side is signed in
 * as, with an idempotency key so a retry cannot double-post. Anything with a
 * price on it, and any failure at all, falls through to `compose` instead —
 * the real composer opens on top of the game with the text in it, where the
 * cost is shown and the wallet is a tap away. The frame never gets the
 * session, the token or the ability to spend anything.
 *
 * WHO IS ALLOWED TO SEND
 * ----------------------
 * The sending WINDOW is the gate: `event.source` has to be the game frame's
 * own `contentWindow`. That test holds whatever the frame's origin is, which
 * is why it is the one used here — `event.origin` cannot do the job, because
 * an opaque frame posts with `origin: "null"` and so does every other
 * sandboxed frame on the page.
 *
 * The `source` name in the payload is NOT that gate and never was. It only
 * says which game is talking, so a page hosting more than one routes to the
 * right bridge. On its own it is written by the sender: any window holding a
 * handle to this one — a popup opener, or a page the game mounted in a nested
 * frame — can put that name in a payload. `post` publishes as the signed-in
 * wallet and `desk` answers with their address and their posts, so the window
 * check is what keeps both out of reach.
 *
 * Nothing in a payload is ever used as an address, a path or a lookup key:
 * `desk` reports on the wallet THIS side is signed in as, never on one the
 * frame names, or a game could farm profiles by asking.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEHUB_API_BASE } from '@/lib/api/dehub/core';
import { mintPost, quotePostCharge } from '@/lib/api/dehub';
// The trade relay signs with the same helpers every spend surface in the app
// uses, so a swap from the room is a swap from anywhere else.
import { BASE_CHAIN_ID, ROBINHOOD_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { AbiCoder, Interface, keccak256 } from 'ethers';
import {
  approveERC20,
  getERC20Allowance,
  readContract,
  parseTxError,
  writeContractAA,
  type AAWriteResult,
} from '@/lib/contracts/aa-utils';
import type { ChainId } from '@/components/app/ChainSelector';
import { buildAvatarUrl, buildFeedImageUrls, buildImageUrl, extractAvatarPath } from '@/lib/media-url';

export interface GameHostMessage {
  source?: string;
  type?: string;
  to?: string;
  limit?: number;
  text?: string;
  /** Idempotency key for `post` and `trade`, so a retry cannot double up. */
  key?: string;
  /** `trade`: the chain, side, token, best fee tier, and amounts in base units as decimal strings. */
  chain?: number;
  side?: string;
  token?: string;
  fee?: number;
  amountIn?: string;
  minOut?: string;
  /** `trade` on a Uniswap v4 pool: its key, and the pool id it must hash to. */
  v4?: unknown;
}

/** One feed post, painted onto a monitor exactly as it arrives. */
export interface DeskCard {
  id: number;
  user: string;
  name: string;
  text: string;
  likes: number;
  tips: number;
  views: number;
  kind: string;
  /** data: URL, or absent when the picture could not be inlined. */
  img?: string;
  avatar?: string;
}

/** Whoever is signed in on THIS side. Public profile fields only. */
export interface DeskMe {
  /** Their public wallet address — what the room values a portfolio from. */
  address: string;
  handle: string;
  name: string;
  followers: number;
  following: number;
  posts: number;
  likes: number;
  tips: number;
  badge: number;
  /** The Solana account linked to the profile, if one is. Public, like the address. */
  solana: string;
  avatar?: string;
}

export interface DeskTile {
  id: number;
  img?: string;
}

export interface GameHostOptions {
  /** The signed-in wallet, from the host's own auth — never from the frame. */
  address?: string | null;
  /** Open the real composer with this text in it. */
  onCompose?: (text: string) => void;
}

/**
 * Where a game is allowed to send you. Internal paths only, each one a place
 * the desk actually draws: the feed, a single post, your profile, the
 * composer. Extend deliberately — every entry here is a route third-party
 * code can put somebody on.
 */
const NAVIGABLE: RegExp[] = [
  /^\/app$/,
  /^\/app\/post\/\d{1,12}$/,
  /^\/app\/profile$/,
  /^\/creator$/,
];

const FEED_MAX = 6;
/** Device pixels for the three sizes the desk draws. A card is 300 canvas px. */
const CARD_WIDTH = 360;
const AVATAR_WIDTH = 64;
const TILE_WIDTH = 192;
/**
 * A relayed picture that comes back bigger than this is dropped rather than
 * inlined. base64 costs a third on top, and the desk would rather paint its
 * gradient than push half a megabyte through postMessage for a 40px tile.
 */
const MAX_IMAGE_BYTES = 120_000;
/** Matches the composer's own body limit. */
const COMPOSE_MAX = 500;

/**
 * The `/cdn-cgi/image` transform, addressed at the origin we are already on.
 *
 * The builders in media-url pin it to https://dehub.io so that dev and preview
 * resolve somewhere real. Here that pin is the one thing we cannot have: a
 * cross-origin fetch of a transform that sends no CORS headers is unreadable,
 * and reading the bytes is the whole point. Every hostname in the zone serves
 * the transform, so on staging or prod the current origin is both same-origin
 * and correct. Anywhere else (localhost) the URL is left alone and the fetch
 * fails — the desk paints its gradient, which is what it did before.
 */
function sameOriginTransform(url: string | undefined): string | undefined {
  if (!url || typeof window === 'undefined') return url;
  const PIN = 'https://dehub.io';
  if (!url.startsWith(`${PIN}/cdn-cgi/`)) return url;
  const host = window.location.hostname;
  if (host !== 'dehub.io' && !host.endsWith('.dehub.io')) return url;
  return window.location.origin + url.slice(PIN.length);
}

/** Fetch a picture and hand it back as a data: URL the frame can draw. */
async function inlineImage(url: string | undefined): Promise<string | undefined> {
  const src = sameOriginTransform(url);
  if (!src) return undefined;
  try {
    const res = await fetch(src, { credentials: 'omit' });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    if (!blob.size || blob.size > MAX_IMAGE_BYTES) return undefined;
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** A public, uncredentialed GET against the API. Null on anything unexpected. */
async function publicGet<T>(path: string, params: Record<string, string>): Promise<T | null> {
  try {
    const url = new URL(path, DEHUB_API_BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { credentials: 'omit' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function num(value: unknown): number {
  return typeof value === 'number' && isFinite(value) ? value : 0;
}

type FeedRow = Record<string, any>;

/**
 * A post's picture, from whichever of the two fields carries it.
 *
 * `feed-images` posts — most of the feed — have no `imageUrl` at all, only
 * `imageUrls: ["nfts/images/2149-1.jpg"]`, and only the filename in that is
 * true: the object lives under `feed-images/` and the path as given is a 403.
 * buildFeedImageUrls is what already knows this, so the two fields go through
 * the two builders rather than one guess covering both.
 */
function postImage(row: FeedRow, width: number): string | undefined {
  if (row.imageUrl) return buildImageUrl(row.tokenId, row.imageUrl, width) || undefined;
  return buildFeedImageUrls(row.imageUrls, width)?.[0];
}

async function feedRows(limit: number, minter?: string): Promise<FeedRow[]> {
  const params: Record<string, string> = { page: '1', limit: String(limit) };
  if (minter) params.minter = minter;
  const json = await publicGet<{ result?: unknown }>('/api/feed', params);
  return Array.isArray(json?.result) ? (json!.result as FeedRow[]) : [];
}

async function toCard(row: FeedRow): Promise<DeskCard> {
  const minter = typeof row.minter === 'string' ? row.minter : '';
  const [img, avatar] = await Promise.all([
    inlineImage(postImage(row, CARD_WIDTH)),
    inlineImage(buildAvatarUrl(minter, extractAvatarPath(row), AVATAR_WIDTH)),
  ]);
  return {
    id: num(row.tokenId),
    user: row.minterUsername || row.minterDisplayName || 'dehub',
    name: row.minterDisplayName || row.minterUsername || 'dehub',
    text: row.name || row.description || '',
    // The scalar `likes` on a feed row is not the vote count; totalVotes.for
    // is the number the post page itself shows.
    likes: num(row.totalVotes?.for) || num(row.likes),
    tips: num(row.totalTips) || num(row.receivedTips),
    views: num(row.totalViews) || num(row.views),
    kind: typeof row.postType === 'string' ? row.postType : '',
    img,
    avatar,
  };
}

/**
 * Everything the desk paints, in one reply: the public feed, the signed-in
 * profile, and the four most recent posts by that profile.
 *
 * One message rather than three because all three monitors repaint together,
 * and a desk that filled in over three round trips would show three different
 * moments of DeHub at once.
 */
async function relayDesk(
  to: MessageEventSource | null,
  limit: number,
  address: string | null | undefined,
): Promise<void> {
  if (!to) return;
  const want = Math.min(Math.max(limit || 2, 1), FEED_MAX);
  const wallet = typeof address === 'string' && address ? address.toLowerCase() : '';

  const [rows, account, mineRows] = await Promise.all([
    feedRows(want),
    wallet
      ? publicGet<{ result?: FeedRow } | FeedRow>(`/api/account_info/${wallet}`, {})
      : Promise.resolve(null),
    wallet ? feedRows(4, wallet) : Promise.resolve([] as FeedRow[]),
  ]);

  const user: FeedRow | null = account
    ? ((account as any).result ?? account) as FeedRow
    : null;

  const [posts, mine, avatar] = await Promise.all([
    Promise.all(rows.map(toCard)),
    Promise.all(
      mineRows.map(async (row) => ({
        id: num(row.tokenId),
        img: await inlineImage(postImage(row, TILE_WIDTH)),
      })),
    ),
    user ? inlineImage(buildAvatarUrl(wallet, extractAvatarPath(user), AVATAR_WIDTH)) : undefined,
  ]);

  const me: DeskMe | null = user
    ? {
        // The public address of the account THIS side is signed in as, so the
        // room can value the right bag without asking anybody to connect a
        // wallet a second time. It is a public key, it is on every post they
        // have ever made, and it buys the frame nothing on its own — reading
        // a balance from it is something any visitor can do.
        address: wallet,
        handle: user.username || '',
        name: user.displayName || user.username || '',
        followers: num(user.followers),
        following: num(user.followings),
        posts: num(user.uploads),
        likes: num(user.likes),
        tips: num(user.receivedTips),
        badge: num(user.badgeBalance),
        solana: typeof user.solanaAddress === 'string' ? user.solanaAddress : '',
        avatar,
      }
    : null;

  if (!posts.length && !me) return;
  // The frame is an opaque origin, so '*' is the only targetOrigin that can
  // reach it. Nothing here is private, which is why it can be.
  (to as Window).postMessage({ source: 'dehub', type: 'desk', posts, me, mine }, '*');
}

async function relayFeed(to: MessageEventSource | null, limit: number): Promise<void> {
  if (!to) return;
  const rows = await feedRows(Math.min(Math.max(limit || 2, 1), FEED_MAX));
  if (!rows.length) return;
  // A feed that will not load is not an error here: the game paints its own
  // demo posts when nothing arrives, which is what it showed before this
  // bridge existed.
  (to as Window).postMessage({ source: 'dehub', type: 'feed', items: rows }, '*');
}

/**
 * What the frame typed, made safe to put in a text box.
 *
 * Control characters go (a lone \r or \f in the composer is invisible and
 * survives into the post), the length is capped where the composer caps it,
 * and everything else is left exactly as typed — it is somebody's post, not a
 * command.
 */
function cleanCompose(text: unknown): string {
  if (typeof text !== 'string') return '';
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // Newline is the one control character a post is allowed to carry.
    if (code === 10 || (code >= 32 && code !== 127)) out += ch;
    if (out.length >= COMPOSE_MAX) break;
  }
  return out.slice(0, COMPOSE_MAX).trim();
}

/**
 * Post what was typed at the desk, without taking anybody out of the room.
 *
 * A free text post is the whole of what this path does, and that is on
 * purpose. The composer's own flow is not one call — it prices the post
 * against today's allowance, settles DHB when the allowance is gone, and
 * optionally mints on-chain. Reimplementing that here would be a second
 * pipeline to keep in step with the first, and the day they drifted the game
 * would be posting on terms nobody agreed to.
 *
 * So the split is: free and simple happens here, silently, and anything with
 * a price on it opens the REAL composer with the text already in it, where
 * the cost is shown and the wallet is a tap away. Same for a stale session —
 * the composer can re-auth, this cannot.
 *
 * `mintOptOut` because there is no wallet in this path to sign a mint with:
 * the post lands in feeds as an off-chain post, which is exactly what the
 * composer does when minting is off.
 */
async function relayPost(
  to: MessageEventSource | null,
  text: string,
  key: string,
  address: string | null | undefined,
  toComposer: (text: string) => void,
): Promise<void> {
  const say = (ok: boolean, extra: Record<string, unknown> = {}) => {
    if (to) (to as Window).postMessage({ source: 'dehub', type: 'posted', ok, ...extra }, '*');
  };
  if (!text) return say(false, { reason: 'empty' });
  if (!address) return say(false, { reason: 'signin' });

  // Null means the quote could not be fetched, which every caller treats as
  // "post it" — the server checks the same thing again before storing.
  const cost = await quotePostCharge('feed-simple', 0);
  if (cost?.chargeable) {
    toComposer(text);
    return say(false, { reason: 'charge' });
  }

  try {
    const res = await mintPost({
      // What the composer sends for a text post with no title: the body is
      // the description and the title is a single space.
      name: ' ',
      description: text,
      postType: 'feed-simple',
      chainId: BASE_CHAIN_ID,
      category: [],
      minterAddress: address,
      mintOptOut: true,
      // Makes a retry safe: the same key returns the post it already made
      // rather than publishing a second copy.
      idempotencyKey: key,
    });
    say(true, { id: res?.createdTokenId ?? '' });
  } catch {
    // Payment required, a dead session, a server that said no — all of them
    // are things the composer can show and the game cannot.
    toComposer(text);
    say(false, { reason: 'composer' });
  }
}

/**
 * A swap, signed by the wallet THIS side is signed in as.
 *
 * Trenchstar's wallet panel is a trading desk, and the desk wants to buy and
 * sell without a second wallet: the app's own smart account, gas-sponsored,
 * one confirmation press inside the room. The frame never gets a key. It
 * names the token, the amount and the floor it will accept, and the host
 * builds the calldata itself — nothing that arrives from the frame is ever
 * forwarded as bytes to sign.
 *
 * Chains are the two where Uniswap's SwapRouter02 is deployed AND the smart
 * account exists: Base and Robinhood Chain. Both are ETH-gas chains, so a buy
 * is ETH in and a sell is token → WETH → ETH, unwrapped in the same call.
 */
const TRADE_CHAINS: Record<number, { router: string; weth: string }> = {
  [BASE_CHAIN_ID]: {
    router: '0x2626664c2603336E57B271c5C0b26F421741e481',
    weth: '0x4200000000000000000000000000000000000006',
  },
  [ROBINHOOD_CHAIN_ID]: {
    router: '0xcaf681a66d020601342297493863e78c959e5cb2',
    weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
  },
};
const TRADE_FEES = new Set([100, 500, 3000, 10000]);
/** SwapRouter02's "send the output to me, the router" sentinel. */
const ROUTER_SELF = '0x0000000000000000000000000000000000000002';
const TRADE_DEADLINE_SECONDS = 60;

const tradeRouterInterface = new Interface([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) external payable',
  'function multicall(uint256 deadline, bytes[] data) external payable returns (bytes[] results)',
]);

function bigFrom(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d{1,78}$/.test(value)) return null;
  try {
    const n = BigInt(value);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

/**
 * Uniswap v4, for the pools v3 cannot see.
 *
 * Robinhood Chain's trench pairs are mostly v4 pools behind a launchpad hook.
 * The frame recovers the pool key (fee, tick spacing, hook) from the
 * PoolManager's Initialize log and sends it along; this side rebuilds the
 * calldata for the Universal Router itself — one V4_SWAP command carrying
 * SWAP_EXACT_IN_SINGLE, SETTLE_ALL and TAKE_ALL — and checks that the key
 * really hashes to the pool the frame named before signing anything against
 * it. A sell settles through Permit2, which is one extra approval.
 *
 * Router addresses are universal-router-sdk's, not sdk-core's: on Robinhood
 * the two sdk-core "router" entries are the V2 factory and V2 router.
 */
const V4_CHAINS: Record<number, { router: string; quoter: string }> = {
  [BASE_CHAIN_ID]: {
    router: '0x6ff5693b99212da76ad316178a184ab56d299b43',
    quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
  },
  [ROBINHOOD_CHAIN_ID]: {
    router: '0x8876789976decbfcbbbe364623c63652db8c0904',
    quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
  },
};
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;

const universalRouterInterface = new Interface([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) external payable',
]);
const permit2Interface = new Interface([
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
]);

interface V4Key {
  fee: number;
  ts: number;
  hooks: string;
  pool: string;
}

function v4KeyFrom(raw: unknown): V4Key | null {
  const v = raw as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return null;
  const fee = typeof v.fee === 'number' && Number.isInteger(v.fee) && v.fee >= 0 && v.fee < 1 << 24 ? v.fee : -1;
  const ts = typeof v.ts === 'number' && Number.isInteger(v.ts) && v.ts > 0 && v.ts < 1 << 23 ? v.ts : -1;
  const hooks = typeof v.hooks === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.hooks) ? v.hooks : '';
  const pool = typeof v.pool === 'string' && /^0x[0-9a-f]{64}$/.test(v.pool) ? v.pool : '';
  if (fee < 0 || ts < 0 || !hooks || !pool) return null;
  return { fee, ts, hooks, pool };
}

/** The V4_SWAP calldata for an ETH-quoted pool: buy is ETH → token, sell is token → ETH. */
function v4SwapArgs(token: string, key: V4Key, buy: boolean, amountIn: bigint, minOut: bigint): [string, string[], bigint] {
  const coder = AbiCoder.defaultAbiCoder();
  const poolKey = [ZERO_ADDRESS, token, key.fee, key.ts, key.hooks];
  const swap = coder.encode(
    ['tuple(tuple(address,address,uint24,int24,address),bool,uint128,uint128,bytes)'],
    [[poolKey, buy, amountIn, minOut, '0x']],
  );
  const settle = coder.encode(['address', 'uint256'], [buy ? ZERO_ADDRESS : token, amountIn]);
  const take = coder.encode(['address', 'uint256'], [buy ? token : ZERO_ADDRESS, minOut]);
  // SWAP_EXACT_IN_SINGLE (0x06), SETTLE_ALL (0x0c), TAKE_ALL (0x0f)
  const input = coder.encode(['bytes', 'bytes[]'], ['0x060c0f', [swap, settle, take]]);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
  // V4_SWAP (0x10)
  return ['0x10', [input], deadline];
}

async function tradeV4(
  chainId: number,
  address: string,
  token: string,
  key: V4Key,
  buy: boolean,
  amountIn: bigint,
  minOut: bigint,
  say: (ok: boolean, extra?: Record<string, unknown>) => void,
): Promise<AAWriteResult> {
  const v4 = V4_CHAINS[chainId];
  const coder = AbiCoder.defaultAbiCoder();
  const poolId = keccak256(
    coder.encode(['address', 'address', 'uint24', 'int24', 'address'], [ZERO_ADDRESS, token, key.fee, key.ts, key.hooks]),
  );
  if (poolId.toLowerCase() !== key.pool) throw new Error('pool key does not match the pool');

  if (!buy) {
    const allowance = await getERC20Allowance(token, address, PERMIT2, chainId as ChainId);
    if (allowance < amountIn) {
      const approval = await approveERC20(token, PERMIT2, MAX_UINT256, chainId as ChainId);
      say(true, { stage: 'approved', hash: approval.hash });
      await approval.wait();
    }
    const [granted, expiration] = await readContract<[bigint, bigint, bigint]>(
      PERMIT2, permit2Interface, 'allowance', [address, token, v4.router], chainId as ChainId,
    );
    const now = Math.floor(Date.now() / 1000);
    if (granted < amountIn || Number(expiration) < now + 120) {
      const grant = await writeContractAA(
        PERMIT2, permit2Interface, 'approve',
        [token, v4.router, MAX_UINT160, now + 30 * 86400],
        { chainId, context: 'token approval' },
      );
      say(true, { stage: 'approved', hash: grant.hash });
      await grant.wait();
    }
  }

  return writeContractAA(
    v4.router, universalRouterInterface, 'execute', v4SwapArgs(token, key, buy, amountIn, minOut),
    { value: buy ? amountIn : 0n, chainId, context: 'swap' },
  );
}

async function relayTrade(
  to: MessageEventSource | null,
  data: GameHostMessage,
  address: string | null | undefined,
): Promise<void> {
  const key = typeof data.key === 'string' ? data.key.slice(0, 64) : '';
  const say = (ok: boolean, extra: Record<string, unknown> = {}) => {
    if (to) (to as Window).postMessage({ source: 'dehub', type: 'traded', ok, key, ...extra }, '*');
  };
  if (!address) return say(false, { reason: 'signin' });

  const chainId = typeof data.chain === 'number' ? data.chain : NaN;
  const chain = TRADE_CHAINS[chainId];
  const token = typeof data.token === 'string' && /^0x[0-9a-fA-F]{40}$/.test(data.token) ? data.token : '';
  const fee = typeof data.fee === 'number' && TRADE_FEES.has(data.fee) ? data.fee : 0;
  const amountIn = bigFrom(data.amountIn);
  const minOut = bigFrom(data.minOut);
  const side = data.side === 'buy' || data.side === 'sell' ? data.side : '';
  const v4 = data.v4 !== undefined ? v4KeyFrom(data.v4) : null;
  if (data.v4 !== undefined && !v4) return say(false, { reason: 'bad request' });
  if (!chain || !token || (!fee && !v4) || !amountIn || !minOut || !side) return say(false, { reason: 'bad request' });

  try {
    let result: AAWriteResult;
    if (v4) {
      result = await tradeV4(chainId, address, token, v4, side === 'buy', amountIn, minOut, say);
    } else if (side === 'buy') {
      result = await writeContractAA(
        chain.router,
        tradeRouterInterface,
        'exactInputSingle',
        [{
          tokenIn: chain.weth,
          tokenOut: token,
          fee,
          recipient: address,
          amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
        }],
        { value: amountIn, chainId, context: 'swap' },
      );
    } else {
      const allowance = await getERC20Allowance(token, address, chain.router, chainId as ChainId);
      if (allowance < amountIn) {
        const approval = await approveERC20(token, chain.router, amountIn, chainId as ChainId);
        say(true, { stage: 'approved', hash: approval.hash });
        await approval.wait();
      }
      const swap = tradeRouterInterface.encodeFunctionData('exactInputSingle', [{
        tokenIn: token,
        tokenOut: chain.weth,
        fee,
        recipient: ROUTER_SELF,
        amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: 0n,
      }]);
      const unwrap = tradeRouterInterface.encodeFunctionData('unwrapWETH9', [minOut, address]);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + TRADE_DEADLINE_SECONDS);
      result = await writeContractAA(
        chain.router,
        tradeRouterInterface,
        'multicall',
        [deadline, [swap, unwrap]],
        { chainId, context: 'swap' },
      );
    }
    say(true, { stage: 'sent', hash: result.hash });
    const receipt = await result.wait();
    say(receipt.status === 1, { stage: 'mined', hash: result.hash, reason: receipt.status === 1 ? undefined : 'reverted' });
  } catch (error) {
    say(false, { reason: parseTxError(error, 'swap') });
  }
}

/**
 * Honour `navigate`, `feed`, `desk`, `compose`, `post` and `trade` from the game
 * identified by `source`.
 *
 * Pass `undefined` for `source` to listen for nothing — the caller may not
 * know which game it is hosting yet.
 */
export function useGameHostBridge(
  source: string | undefined,
  frame: RefObject<HTMLIFrameElement>,
  options?: GameHostOptions,
): void {
  const navigate = useNavigate();
  // The listener is bound once per game. Reading these through a ref keeps a
  // new wallet or a new callback from tearing it down and rebinding mid-play.
  const opts = useRef<GameHostOptions | undefined>(options);
  opts.current = options;
  // Last time each kind of request was honoured. The desk asks every 90
  // seconds; anything asking faster than this is either broken or using the
  // host as the network it was denied, and neither deserves the requests.
  const last = useRef<Record<string, number>>({});
  const tradeBusy = useRef(false);

  useEffect(() => {
    if (!source) return;

    const THROTTLE_MS = 5000;
    const tooSoon = (kind: string) => {
      const now = Date.now();
      if (now - (last.current[kind] ?? 0) < THROTTLE_MS) return true;
      last.current[kind] = now;
      return false;
    };

    const onMessage = (event: MessageEvent<GameHostMessage | null>) => {
      const data = event.data;
      if (!data || data.source !== source) return;
      // The game frame itself, not any other window that knows the name. A
      // popup opener or a page the game mounted in a nested frame can post the
      // same payload, and `post` mints as the signed-in wallet.
      if (event.source !== frame.current?.contentWindow) return;

      if (data.type === 'navigate') {
        const to = typeof data.to === 'string' ? data.to : '';
        if (NAVIGABLE.some((re) => re.test(to))) navigate(to);
        return;
      }

      if (data.type === 'feed') {
        if (!tooSoon('feed')) void relayFeed(event.source, data.limit ?? 2);
        return;
      }

      if (data.type === 'desk') {
        if (!tooSoon('desk')) void relayDesk(event.source, data.limit ?? 2, opts.current?.address);
        return;
      }

      if (data.type === 'compose') {
        if (tooSoon('compose')) return;
        const text = cleanCompose(data.text);
        opts.current?.onCompose?.(text);
        return;
      }

      if (data.type === 'trade') {
        // One at a time. A second press while the first is in the wallet is
        // the classic double-buy, and the frame already disarms its button.
        if (tradeBusy.current) return;
        tradeBusy.current = true;
        void relayTrade(event.source, data, opts.current?.address).finally(() => {
          tradeBusy.current = false;
        });
        return;
      }

      if (data.type === 'post') {
        if (tooSoon('post')) return;
        const text = cleanCompose(data.text);
        const key = typeof data.key === 'string' ? data.key.slice(0, 64) : '';
        void relayPost(
          event.source,
          text,
          key,
          opts.current?.address,
          (t) => opts.current?.onCompose?.(t),
        );
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [source, navigate]);
}
