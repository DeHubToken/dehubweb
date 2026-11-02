/**
 * NFT sheet: everything you can do with one NFT on the market.
 *
 * Buy the cheapest listing, list yours, make or accept an offer, cancel your
 * own orders, and see recent sales. Every trade is one Seaport swap, so the
 * buyer and seller never wait on each other.
 */
import { useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Interface, parseUnits } from 'ethers';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { KitButton } from '@/components/app/page-kit/PageKit';
import { AuthContext } from '@/contexts/AuthContext';
import { readContract } from '@/lib/contracts/aa-utils';
import type { ChainId } from '@/components/app/ChainSelector';
import {
  CHAIN_LABEL,
  EXPLORER,
  cancelOrder,
  ensureNftApproval,
  ensureTokenAllowance,
  fetchMarketConfig,
  fetchNft,
  fetchTerms,
  fillOrder,
  postOrder,
  walletAddress,
  type MarketCurrency,
  type MarketOrder,
} from '@/lib/market/market';
import { NATIVE, buildListing, buildOffer, sellerProceeds } from '@/lib/market/seaport';
import { NftArt, formatPrice } from './NftCard';

export interface NftSheetTarget {
  chainId: number;
  contract: string;
  tokenId: string;
  standard?: 'erc721' | 'erc1155';
  name?: string | null;
  image?: string | null;
  collectionName?: string | null;
}

const HOLD_IFACE = new Interface([
  'function ownerOf(uint256) view returns (address)',
  'function balanceOf(address,uint256) view returns (uint256)',
  'function supportsInterface(bytes4) view returns (bool)',
]);

const DAYS = [7, 30, 90];

function errorText(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string } | null;
  const msg = err?.shortMessage || err?.message || String(e);
  if (/user rejected|denied|cancell?ed by user/i.test(msg)) return 'Cancelled in your wallet';
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}

async function heldAmount(t: NftSheetTarget, me: string): Promise<{ held: bigint; standard: 'erc721' | 'erc1155' }> {
  const is721 = t.standard
    ? t.standard === 'erc721'
    : await readContract<boolean>(t.contract, HOLD_IFACE, 'supportsInterface', ['0x80ac58cd'], t.chainId as ChainId).catch(() => false);
  if (is721) {
    const owner = await readContract<string>(t.contract, HOLD_IFACE, 'ownerOf', [t.tokenId], t.chainId as ChainId).catch(() => '');
    return { held: owner.toLowerCase() === me ? 1n : 0n, standard: 'erc721' };
  }
  const bal = await readContract<bigint>(t.contract, HOLD_IFACE, 'balanceOf', [me, t.tokenId], t.chainId as ChainId).catch(() => 0n);
  return { held: BigInt(bal), standard: 'erc1155' };
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-white' : 'text-zinc-300'}`}>{value}</span>
    </div>
  );
}

function Chips<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          data-kit-chip
          data-size="sm"
          data-active={o.id === value ? 'true' : undefined}
          onClick={() => onChange(o.id)}
        >
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function NftSheet({ target, onClose }: { target: NftSheetTarget | null; onClose: () => void }) {
  const { t } = useTranslation();
  // useContext, not useAuth: the state gallery renders this sheet with no AuthProvider.
  const auth = useContext(AuthContext);
  const isAuthenticated = !!auth?.isAuthenticated;
  const authWallet = auth?.walletAddress ?? null;
  const qc = useQueryClient();
  const open = !!target;
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'list' | 'offer'>('view');
  const [currency, setCurrency] = useState<string>(NATIVE);
  const [priceText, setPriceText] = useState('');
  const [days, setDays] = useState(30);
  const [qty, setQty] = useState('1');

  useEffect(() => {
    setMode('view');
    setPriceText('');
    setQty('1');
    setBusy(null);
  }, [target?.chainId, target?.contract, target?.tokenId]);

  const me: string = String(authWallet ?? '').toLowerCase();

  const config = useQuery({ queryKey: ['nft-market', 'config'], queryFn: fetchMarketConfig, staleTime: 10 * 60_000, enabled: open });
  const detail = useQuery({
    queryKey: ['nft-market', 'nft', target?.chainId, target?.contract, target?.tokenId],
    queryFn: () => fetchNft(target!.chainId, target!.contract, target!.tokenId),
    enabled: open,
    staleTime: 15_000,
  });
  const holding = useQuery({
    queryKey: ['nft-market', 'held', target?.chainId, target?.contract, target?.tokenId, me],
    queryFn: () => heldAmount(target!, me),
    enabled: open && !!me,
    staleTime: 15_000,
  });

  const currencies: MarketCurrency[] = useMemo(
    () => config.data?.chains.find((c) => c.chainId === target?.chainId)?.currencies ?? [],
    [config.data, target?.chainId],
  );
  const dhb = currencies.find((c) => c.symbol === 'DHB');
  const cur = currencies.find((c) => c.address === (mode === 'offer' ? dhb?.address : currency)) ?? currencies[0];

  const priceWei = useMemo(() => {
    try {
      if (!cur || !priceText.trim()) return 0n;
      return parseUnits(priceText.trim(), cur.decimals);
    } catch {
      return 0n;
    }
  }, [priceText, cur]);

  const standard = holding.data?.standard ?? target?.standard ?? 'erc721';
  const terms = useQuery({
    queryKey: ['nft-market', 'terms', target?.chainId, target?.contract, target?.tokenId, priceWei.toString(), cur?.address],
    queryFn: () =>
      fetchTerms({ chainId: target!.chainId, contract: target!.contract, tokenId: target!.tokenId, price: priceWei.toString(), currency: cur!.address }),
    enabled: open && mode !== 'view' && priceWei > 0n && !!cur,
    staleTime: 60_000,
  });

  const nft = detail.data?.nft;
  const name = nft?.name || target?.name || `#${target?.tokenId ?? ''}`;
  const image = nft?.image ?? target?.image ?? null;
  const collection = nft?.collectionName ?? target?.collectionName ?? null;
  const listings = detail.data?.listings ?? [];
  const offers = detail.data?.offers ?? [];
  const sales = detail.data?.sales ?? [];
  const held = holding.data?.held ?? 0n;
  const cheapest = listings.find((l) => l.maker !== me) ?? null;
  const mine = [...listings, ...offers].filter((o) => o.maker === me);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['nft-market'] });
  };

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      refresh();
      setMode('view');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const buy = (order: MarketOrder) =>
    run(`fill:${order.orderHash}`, async () => fillOrder(order, await walletAddress()), t('nftMarket.bought', { defaultValue: 'Bought. It is in your wallet now.' }));

  const accept = (order: MarketOrder) =>
    run(`fill:${order.orderHash}`, async () => fillOrder(order, await walletAddress()), t('nftMarket.sold', { defaultValue: 'Sold. The payment is in your wallet.' }));

  const cancel = (order: MarketOrder) =>
    run(`cancel:${order.orderHash}`, () => cancelOrder(order), t('nftMarket.cancelled', { defaultValue: 'Cancelled' }));

  const submit = () => {
    if (!target || !cur || priceWei <= 0n || !terms.data || !terms.data.feeRecipient) return;
    const feeTerms = { feeRecipient: terms.data.feeRecipient, feeBps: terms.data.feeBps, royalty: terms.data.royalty };
    if (mode === 'list') {
      const amount = standard === 'erc1155' ? String(Math.max(1, Math.min(Number(qty) || 1, Number(held) || 1))) : '1';
      return run(
        'post',
        async () => {
          const seller = await walletAddress();
          await ensureNftApproval(target.contract, seller, target.chainId);
          await postOrder('listing', target.chainId, seller, (counter) =>
            buildListing({ seller, nft: { contract: target.contract, tokenId: target.tokenId, standard, amount }, currency: cur.address, price: priceWei, terms: feeTerms, days, counter }),
          );
        },
        t('nftMarket.listed', { defaultValue: 'Listed. Anyone can buy it now.' }),
      );
    }
    return run(
      'post',
      async () => {
        const buyer = await walletAddress();
        await ensureTokenAllowance(cur.address, buyer, priceWei, target.chainId);
        await postOrder('offer', target.chainId, buyer, (counter) =>
          buildOffer({ buyer, nft: { contract: target.contract, tokenId: target.tokenId, standard, amount: '1' }, currency: cur.address, price: priceWei, terms: feeTerms, days, counter }),
        );
      },
      t('nftMarket.offered', { defaultValue: 'Offer sent. The holder can accept it any time.' }),
    );
  };

  const fee = priceWei > 0n && cur ? (priceWei * BigInt(cur.feeBps)) / 10_000n : 0n;
  const royalty = terms.data?.royalty ? BigInt(terms.data.royalty.amount) : 0n;
  const proceeds =
    terms.data && priceWei > 0n
      ? sellerProceeds(priceWei, { feeRecipient: terms.data.feeRecipient ?? '', feeBps: terms.data.feeBps, royalty: terms.data.royalty }, mode === 'list' ? me : '0x0')
      : 0n;
  const fmt = (v: bigint) => (cur ? `${formatPrice(v.toString(), cur.decimals)} ${cur.symbol}` : '');
  const ready = isAuthenticated && priceWei > 0n && !!terms.data?.feeRecipient && !terms.isFetching;

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent data-nft-sheet className="max-h-[92vh] bg-zinc-950 border-white/10">
        <DrawerHeader className="sr-only">
          <DrawerTitle>{name}</DrawerTitle>
        </DrawerHeader>
        <div className="mx-auto w-full max-w-xl overflow-y-auto px-4 pb-8">
          <div className="flex gap-3 pt-1">
            <NftArt src={image} alt={name} className="h-24 w-24 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-col justify-center gap-0.5">
              {collection ? <p className="truncate text-[12px] text-zinc-500">{collection}</p> : null}
              <p className="truncate text-[17px] font-bold text-white">{name}</p>
              <p className="text-[12px] text-zinc-500">
                {CHAIN_LABEL[target?.chainId ?? 0]} · #{target?.tokenId && target.tokenId.length > 12 ? `${target.tokenId.slice(0, 10)}…` : target?.tokenId}
                {held > 0n ? ` · ${t('nftMarket.youHold', { defaultValue: 'You hold {{n}}', n: held.toString() })}` : ''}
              </p>
              {detail.data?.isDehub ? (
                <p className="text-[12px] text-zinc-400">{t('nftMarket.dehubPost', { defaultValue: 'DeHub post' })}</p>
              ) : null}
            </div>
          </div>

          {detail.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
          ) : mode === 'view' ? (
            <div className="mt-4 flex flex-col gap-4">
              {cheapest ? (
                <div data-page-bento className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 p-3">
                  <div className="min-w-0">
                    <p className="text-[12px] text-zinc-500">{t('nftMarket.buyNow', { defaultValue: 'Buy now' })}</p>
                    <p className="text-[18px] font-bold tabular-nums text-white">
                      {formatPrice(cheapest.price, cheapest.currencyDecimals)} {cheapest.currencySymbol}
                    </p>
                    {cheapest.amount !== '1' ? <p className="text-[12px] text-zinc-500">× {cheapest.amount}</p> : null}
                  </div>
                  <KitButton disabled={!isAuthenticated || !!busy} onClick={() => buy(cheapest)}>
                    {busy === `fill:${cheapest.orderHash}` ? <Loader2 className="h-4 w-4 animate-spin" /> : t('nftMarket.buy', { defaultValue: 'Buy' })}
                  </KitButton>
                </div>
              ) : null}

              {isAuthenticated ? <div className="flex flex-wrap gap-2">
                {held > 0n ? (
                  <KitButton variant={cheapest ? 'quiet' : 'primary'} onClick={() => { setCurrency(NATIVE); setMode('list'); }}>
                    {t('nftMarket.listForSale', { defaultValue: 'List for sale' })}
                  </KitButton>
                ) : null}
                {dhb && held === 0n ? (
                  <KitButton variant="quiet" onClick={() => setMode('offer')}>
                    {t('nftMarket.makeOffer', { defaultValue: 'Make an offer' })}
                  </KitButton>
                ) : null}
              </div> : null}
              {!isAuthenticated ? (
                <p className="text-[12.5px] text-zinc-500">{t('nftMarket.signInToTrade', { defaultValue: 'Sign in with your wallet to buy, sell or make offers.' })}</p>
              ) : null}

              {offers.length ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-semibold text-white">{t('nftMarket.offers', { defaultValue: 'Offers' })}</h3>
                  {offers.map((o) => (
                    <div key={o.orderHash} className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
                      <div className="min-w-0 text-[13px]">
                        <span className="tabular-nums text-white">{formatPrice(o.price, o.currencyDecimals)} {o.currencySymbol}</span>
                        <span className="ml-2 text-zinc-500">{o.makerProfile?.username ? `@${o.makerProfile.username}` : `${o.maker.slice(0, 6)}…${o.maker.slice(-4)}`}</span>
                      </div>
                      {o.maker === me ? (
                        <KitButton variant="quiet" disabled={!!busy} onClick={() => cancel(o)}>
                          {busy === `cancel:${o.orderHash}` ? <Loader2 className="h-4 w-4 animate-spin" /> : t('nftMarket.cancel', { defaultValue: 'Cancel' })}
                        </KitButton>
                      ) : held > 0n ? (
                        <KitButton disabled={!!busy} onClick={() => accept(o)}>
                          {busy === `fill:${o.orderHash}` ? <Loader2 className="h-4 w-4 animate-spin" /> : t('nftMarket.accept', { defaultValue: 'Accept' })}
                        </KitButton>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}

              {mine.filter((o) => o.kind === 'listing').length ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-semibold text-white">{t('nftMarket.yourListings', { defaultValue: 'Your listings' })}</h3>
                  {mine.filter((o) => o.kind === 'listing').map((o) => (
                    <div key={o.orderHash} className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
                      <span className="text-[13px] tabular-nums text-white">{formatPrice(o.price, o.currencyDecimals)} {o.currencySymbol}</span>
                      <KitButton variant="quiet" disabled={!!busy} onClick={() => cancel(o)}>
                        {busy === `cancel:${o.orderHash}` ? <Loader2 className="h-4 w-4 animate-spin" /> : t('nftMarket.cancel', { defaultValue: 'Cancel' })}
                      </KitButton>
                    </div>
                  ))}
                </section>
              ) : null}

              {sales.length ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-semibold text-white">{t('nftMarket.recentSales', { defaultValue: 'Recent sales' })}</h3>
                  {sales.slice(0, 6).map((s) => (
                    <a
                      key={s.orderHash}
                      href={s.fillTxHash ? `${EXPLORER[s.chainId]}/tx/${s.fillTxHash}` : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 border-t border-white/10 pt-2 text-[13px]"
                    >
                      <span className="tabular-nums text-white">{formatPrice(s.price, s.currencyDecimals)} {s.currencySymbol}</span>
                      <span className="text-zinc-500">{s.filledAt ? new Date(s.filledAt).toLocaleDateString() : ''}</span>
                    </a>
                  ))}
                </section>
              ) : null}

              {!cheapest && !offers.length && !sales.length && held === 0n ? (
                <p className="text-[13px] text-zinc-500">{t('nftMarket.notListed', { defaultValue: 'Not for sale yet. Make an offer and the holder can accept it.' })}</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-[15px] font-semibold text-white">
                {mode === 'list' ? t('nftMarket.listForSale', { defaultValue: 'List for sale' }) : t('nftMarket.makeOffer', { defaultValue: 'Make an offer' })}
              </p>
              {mode === 'list' ? (
                <Chips value={currency} options={currencies.map((c) => ({ id: c.address, label: c.symbol }))} onChange={(v) => setCurrency(String(v))} />
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-zinc-500">
                  {mode === 'list'
                    ? t('nftMarket.priceBuyerPays', { defaultValue: 'Price the buyer pays ({{symbol}})', symbol: cur?.symbol ?? '' })
                    : t('nftMarket.yourOffer', { defaultValue: 'Your offer ({{symbol}})', symbol: cur?.symbol ?? '' })}
                </span>
                <input
                  id="nft-market-price"
                  inputMode="decimal"
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.0"
                  className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-[16px] tabular-nums text-white outline-none focus:border-white/30"
                />
              </label>
              {mode === 'list' && standard === 'erc1155' && held > 1n ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] text-zinc-500">{t('nftMarket.quantity', { defaultValue: 'How many (you hold {{n}})', n: held.toString() })}</span>
                  <input
                    id="nft-market-qty"
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                    className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-[16px] tabular-nums text-white outline-none focus:border-white/30"
                  />
                </label>
              ) : null}
              <div className="flex flex-col gap-1">
                <span className="text-[12px] text-zinc-500">{t('nftMarket.lasts', { defaultValue: 'Lasts' })}</span>
                <Chips value={days} options={DAYS.map((d) => ({ id: d, label: t('nftMarket.days', { defaultValue: '{{n}} days', n: d }) }))} onChange={(v) => setDays(Number(v))} />
              </div>
              {priceWei > 0n ? (
                <div data-page-bento className="flex flex-col gap-1.5 rounded-xl bg-zinc-900 p-3">
                  <Row label={t('nftMarket.dehubFee', { defaultValue: 'DeHub fee ({{pct}}%)', pct: (cur?.feeBps ?? 0) / 100 })} value={fmt(fee)} />
                  {royalty > 0n ? <Row label={t('nftMarket.creatorRoyalty', { defaultValue: 'Creator royalty' })} value={fmt(royalty)} /> : null}
                  <Row
                    strong
                    label={mode === 'list' ? t('nftMarket.youGet', { defaultValue: 'You get' }) : t('nftMarket.holderGets', { defaultValue: 'Holder gets' })}
                    value={terms.isFetching ? '…' : fmt(proceeds)}
                  />
                </div>
              ) : null}
              {mode === 'offer' && cur ? (
                <p className="text-[12px] text-zinc-500">
                  {t('nftMarket.offerNote', { defaultValue: 'Your {{symbol}} stays in your wallet until the holder accepts. Cancel any time.', symbol: cur.symbol })}
                </p>
              ) : (
                <p className="text-[12px] text-zinc-500">
                  {t('nftMarket.listNote', { defaultValue: 'The NFT stays in your wallet until it sells. The first time, your wallet asks to let the market move this collection.' })}
                </p>
              )}
              {terms.data && !terms.data.feeRecipient ? (
                <p className="text-[12px] text-red-400">{t('nftMarket.notOpen', { defaultValue: 'The market is not open yet.' })}</p>
              ) : null}
              <div className="flex gap-2">
                <KitButton variant="quiet" disabled={!!busy} onClick={() => setMode('view')}>{t('nftMarket.back', { defaultValue: 'Back' })}</KitButton>
                <KitButton disabled={!ready || !!busy} onClick={submit}>
                  {busy === 'post' ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'list' ? t('nftMarket.list', { defaultValue: 'List' }) : t('nftMarket.sendOffer', { defaultValue: 'Send offer' })}
                </KitButton>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
