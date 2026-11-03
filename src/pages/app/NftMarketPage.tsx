/**
 * NFT Market
 * ==========
 * Buy, sell and make offers on any NFT on BNB or Base: DeHub posts and any
 * other collection in your wallet. Each trade is one Seaport swap, so the NFT
 * and the payment move together and nobody waits on the other side.
 *
 * Built on the page kit like the other marketplaces.
 */
import { useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { KitButton, PageBody, PageEmpty, PageIsland, PageSection, PageTabs } from '@/components/app/page-kit/PageKit';
import { AuthContext } from '@/contexts/AuthContext';
import { NftCard, formatPrice } from '@/components/app/nft-market/NftCard';
import { NftSheet, type NftSheetTarget } from '@/components/app/nft-market/NftSheet';
import { CollectionsRow } from '@/components/app/nft-market/CollectionsRow';
import { NftSpotlight, type SpotlightItem } from '@/components/app/nft-market/NftSpotlight';
import { CHAIN_LABEL, EXPLORER, MARKET_CHAINS, fetchCollections, fetchOrders, fetchShowcase, fetchWalletNfts, type MarketCollection, type MarketOrder, type ShowcaseNft } from '@/lib/market/market';
import SlidersHorizontal from '@/components/ui/cut-icons/settings';
import { currentPrice } from '@/lib/market/seaport';

type Tab = 'browse' | 'sell' | 'mine' | 'sales';
type Sort = 'new' | 'price_asc' | 'price_desc';

/** The one card that stands for DeHub Posts on every chain. */
const DEHUB_ALL = 'dehub:all';

const compactNumber = (n: number) => n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'DeHub NFT Market',
  description: 'Buy, sell and make offers on NFTs on BNB Chain and Base. Every trade swaps the NFT and the payment in one step.',
  url: 'https://riftn.com/nfts',
};

function targetOf(o: MarketOrder): NftSheetTarget {
  return { chainId: o.chainId, contract: o.contract, tokenId: o.tokenId, standard: o.standard, name: o.nftName, image: o.nftImage, collectionName: o.collectionName };
}

export default function NftMarketPage() {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const me = String(auth?.walletAddress ?? '').toLowerCase();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const asked = params.get('tab');
    return asked === 'sell' || asked === 'mine' || asked === 'sales' ? asked : 'browse';
  });
  const [chain, setChain] = useState<number | 'all'>(() => {
    const c = Number(params.get('chain'));
    return (MARKET_CHAINS as readonly number[]).includes(c) ? c : 'all';
  });
  const [sellChain, setSellChain] = useState<number>(56);
  const [sort, setSort] = useState<Sort>('new');
  const [dehubOnly, setDehubOnly] = useState(false);
  const [open, setOpen] = useState<NftSheetTarget | null>(null);
  // Collections first: pick a collection from the trending row to see only its items.
  const [coll, setColl] = useState<MarketCollection | null>(null);
  const [collOffer, setCollOffer] = useState<NftSheetTarget | null>(null);
  // Chains and sort sit behind one button so the top bar stays slim.
  const [showFilters, setShowFilters] = useState(false);
  // Bundle builder on the Sell tab: pick two to four NFTs, list them together.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<NftSheetTarget[]>([]);
  const [bundle, setBundle] = useState<NftSheetTarget[] | null>(null);
  const togglePick = (n: NftSheetTarget) =>
    setPicked((list) =>
      list.some((p) => p.contract === n.contract && p.tokenId === n.tokenId)
        ? list.filter((p) => !(p.contract === n.contract && p.tokenId === n.tokenId))
        : list.length >= 4 ? list : [...list, n],
    );

  // A shared NFT link (?chain=56&contract=0x…&token=12) opens its sheet.
  useEffect(() => {
    const contract = params.get('contract');
    const token = params.get('token');
    const c = Number(params.get('chain'));
    if (contract && token && (MARKET_CHAINS as readonly number[]).includes(c)) {
      setOpen({ chainId: c, contract: contract.toLowerCase(), tokenId: token });
    }
    // Read once for the incoming link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeSheet = () => {
    setOpen(null);
    if (params.get('contract')) {
      const next = new URLSearchParams(params);
      next.delete('contract');
      next.delete('token');
      setParams(next, { replace: true });
    }
  };

  const browse = useInfiniteQuery({
    queryKey: ['nft-market', 'browse', chain, sort, dehubOnly, coll?.chainId, coll?.contract],
    queryFn: ({ pageParam }) =>
      fetchOrders({
        kind: 'listing',
        chainId: coll ? coll.chainId : chain === 'all' ? undefined : chain,
        contract: coll?.contract,
        sort,
        dehub: dehubOnly ? 'true' : undefined,
        limit: 24,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * 24 : undefined),
    enabled: tab === 'browse',
    staleTime: 20_000,
  });

  const collections = useQuery({
    queryKey: ['nft-market', 'collections', chain],
    queryFn: () => fetchCollections({ chainId: chain === 'all' ? undefined : chain, limit: 12 }),
    enabled: tab === 'browse',
    staleTime: 30_000,
  });

  // Minted DeHub posts, listed or not, so the market never looks empty.
  const showcase = useQuery({
    queryKey: ['nft-market', 'showcase', chain],
    queryFn: () => fetchShowcase({ chainId: chain === 'all' ? undefined : chain, limit: 30 }),
    enabled: tab === 'browse',
    staleTime: 60_000,
  });

  // A chain or filter change can hide the picked collection; drop it then.
  useEffect(() => {
    if (coll && chain !== 'all' && coll.chainId !== chain) setColl(null);
  }, [chain, coll]);

  const wallet = useQuery({
    queryKey: ['nft-market', 'wallet', me, sellChain],
    queryFn: () => fetchWalletNfts(me, sellChain),
    enabled: tab === 'sell' && !!me,
    staleTime: 60_000,
  });

  const mine = useQuery({
    queryKey: ['nft-market', 'mine', me],
    queryFn: async () => {
      const [l, o] = await Promise.all([
        fetchOrders({ kind: 'listing', maker: me, limit: 60 }),
        fetchOrders({ kind: 'offer', maker: me, limit: 60 }),
      ]);
      return [...l.items, ...o.items];
    },
    enabled: tab === 'mine' && !!me,
    staleTime: 20_000,
  });

  const sales = useQuery({
    queryKey: ['nft-market', 'sales', chain],
    queryFn: () => fetchOrders({ kind: 'listing', status: 'filled', chainId: chain === 'all' ? undefined : chain, limit: 40 }),
    enabled: tab === 'sales',
    staleTime: 30_000,
  });

  const listings = useMemo(() => browse.data?.pages.flatMap((p) => p.items) ?? [], [browse.data]);

  // DeHub Posts live on every chain as one contract each; show them as one
  // collection, not one card per chain. Other collections keep their own card.
  const dehubTotals = useMemo(() => {
    const per = showcase.data?.collections ?? [];
    const listedDehub = (collections.data?.items ?? []).filter((c) => c.isDehub);
    return {
      minted: per.reduce((s, c) => s + (c.minted ?? 0), 0),
      listed: listedDehub.reduce((s, c) => s + c.listed, 0),
      image: per[0]?.image ?? listedDehub[0]?.image ?? null,
      any: per.length > 0 || listedDehub.length > 0,
    };
  }, [collections.data, showcase.data]);

  const allCollections = useMemo<MarketCollection[]>(() => {
    const others = (collections.data?.items ?? []).filter((c) => !c.isDehub);
    if (!dehubTotals.any) return others;
    const dehub: MarketCollection = {
      chainId: 0,
      contract: DEHUB_ALL,
      name: t('nftMarket.dehubPostsName', { defaultValue: 'DeHub Posts' }),
      image: dehubTotals.image,
      isDehub: true,
      listed: dehubTotals.listed,
      floor: null,
      minted: dehubTotals.minted,
    };
    return [dehub, ...others];
  }, [collections.data, dehubTotals, t]);

  const pickCollection = (c: MarketCollection | null) => {
    if (c?.contract === DEHUB_ALL) {
      setColl(null);
      setDehubOnly((v) => !v);
      return;
    }
    setDehubOnly(false);
    setColl(c);
  };
  const pickedCollection = dehubOnly ? { chainId: 0, contract: DEHUB_ALL } : coll;
  const forSaleTotal = useMemo(() => (collections.data?.items ?? []).reduce((s, c) => s + c.listed, 0), [collections.data]);

  const showcaseItems = useMemo<ShowcaseNft[]>(() => {
    const items = showcase.data?.items ?? [];
    return coll ? items.filter((n) => n.chainId === coll.chainId && n.contract === coll.contract) : items;
  }, [showcase.data, coll]);

  const showcaseTarget = (n: ShowcaseNft): NftSheetTarget => ({
    chainId: n.chainId,
    contract: n.contract,
    tokenId: n.tokenId,
    standard: 'erc1155',
    name: n.name,
    image: n.image,
    collectionName: t('nftMarket.dehubPostsName', { defaultValue: 'DeHub Posts' }),
  });
  const titleOf = (name: string | null | undefined, tokenId: string) => name?.trim() || `#${tokenId}`;

  // The spotlight: newest listings when there are any, newest mints otherwise.
  // Whatever it shows is left out of the grid below, so nothing appears twice.
  const spotlightFromListings = !coll && listings.length > 0;
  const spotlight = useMemo<SpotlightItem[]>(() => {
    if (coll) return [];
    if (listings.length) {
      return listings.slice(0, 5).map((o) => ({
        key: o.orderHash,
        name: titleOf(o.nftName, o.tokenId),
        image: o.nftImage,
        chainId: o.chainId,
        price: { amount: o.endPrice && o.endPrice !== o.price ? currentPrice(o.components).toString() : o.price, decimals: o.currencyDecimals, symbol: o.currencySymbol },
        onOpen: () => setOpen(targetOf(o)),
      }));
    }
    return showcaseItems.filter((n) => n.image).slice(0, 5).map((n) => ({
      key: `${n.chainId}:${n.contract}:${n.tokenId}`,
      name: titleOf(n.name, n.tokenId),
      image: n.image,
      chainId: n.chainId,
      onOpen: () => setOpen(showcaseTarget(n)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coll, listings, showcaseItems]);
  const inSpotlight = useMemo(() => new Set(spotlight.map((s) => s.key)), [spotlight]);
  const gridListings = spotlightFromListings ? listings.filter((o) => !inSpotlight.has(o.orderHash)) : listings;
  const gridMints = spotlightFromListings ? showcaseItems : showcaseItems.filter((n) => !inSpotlight.has(`${n.chainId}:${n.contract}:${n.tokenId}`));
  const gridClass = 'grid grid-cols-3 gap-1.5 sm:gap-2.5 lg:grid-cols-4 xl:grid-cols-5';

  const chainChips = (
    <PageTabs
      size="sm"
      value={String(chain)}
      onChange={(v) => setChain(v === 'all' ? 'all' : Number(v))}
      tabs={[
        { id: 'all', label: t('nftMarket.allChains', { defaultValue: 'All chains' }) },
        ...MARKET_CHAINS.map((c) => ({ id: String(c), label: CHAIN_LABEL[c] })),
      ]}
    />
  );


  // Filters ride inside the island, on its glass, so they read on every theme's backdrop.
  const filters =
    tab === 'browse' ? (
      showFilters ? (
      <>
        {chainChips}
        <PageTabs
          size="sm"
          value={sort}
          onChange={setSort}
          tabs={[
            { id: 'new', label: t('nftMarket.sortNew', { defaultValue: 'Newest' }) },
            { id: 'price_asc', label: t('nftMarket.sortLow', { defaultValue: 'Lowest price' }) },
            { id: 'price_desc', label: t('nftMarket.sortHigh', { defaultValue: 'Highest price' }) },
          ]}
          beforeTabs={
            <button type="button" data-kit-chip data-size="sm" data-active={dehubOnly ? 'true' : undefined} onClick={() => setDehubOnly((v) => !v)}>
              <span>{t('nftMarket.dehubPosts', { defaultValue: 'DeHub posts' })}</span>
            </button>
          }
        />
      </>
      ) : null
    ) : tab === 'sell' && me ? (
      <PageTabs
        size="sm"
        value={String(sellChain)}
        onChange={(v) => setSellChain(Number(v))}
        tabs={MARKET_CHAINS.map((c) => ({ id: String(c), label: CHAIN_LABEL[c] }))}
      />
    ) : tab === 'sales' ? (
      chainChips
    ) : null;

  const signedOut = (
    <PageEmpty
      icon="nfts"
      title={t('nftMarket.signInTitle', { defaultValue: 'Sign in to trade' })}
      body={t('nftMarket.signInBody', { defaultValue: 'Connect your wallet to sell what you hold and track your listings and offers.' })}
      action={<KitButton onClick={() => auth?.openLoginModal?.()}>{t('nftMarket.signInToTradeCta', { defaultValue: 'Sign in to trade' })}</KitButton>}
    />
  );

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('nftMarket.seoTitle', { defaultValue: 'NFT Market: buy and sell NFTs on BNB and Base | DeHub' })}
        description={t('nftMarket.seoDescription', {
          defaultValue: 'Buy, sell and make offers on NFTs on BNB Chain and Base. Pay in BNB, ETH or DHB. Every trade swaps the NFT and the payment in one step.',
        })}
        image="https://riftn.com/og/nfts.jpg"
        url="https://riftn.com/nfts"
        jsonLd={JSON_LD}
      />

      <PageIsland
        icon="nfts"
        title={t('nftMarket.shortTitle', { defaultValue: 'NFTs' })}
        actions={
          tab === 'browse' ? (
            <button
              type="button"
              data-kit-square
              data-active={showFilters || chain !== 'all' || sort !== 'new' || dehubOnly ? 'true' : undefined}
              onClick={() => setShowFilters((v) => !v)}
              aria-pressed={showFilters}
              aria-label={t('nftMarket.filters', { defaultValue: 'Filters' })}
              title={t('nftMarket.filters', { defaultValue: 'Filters' })}
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" />
            </button>
          ) : null
        }
        tabs={
          <PageTabs
            size="sm"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'browse', label: t('nftMarket.tabBrowse', { defaultValue: 'Browse' }) },
              { id: 'sell', label: t('nftMarket.tabSell', { defaultValue: 'Sell' }) },
              { id: 'mine', label: t('nftMarket.tabMine', { defaultValue: 'My orders' }) },
              { id: 'sales', label: t('nftMarket.tabSales', { defaultValue: 'Sales' }) },
            ]}
          />
        }
      >
        {filters}
      </PageIsland>

      <PageBody>
        <div className="flex flex-col gap-3">
          {tab === 'browse' ? (
            <>
              {browse.isLoading && showcase.isLoading ? (
                <>
                  <div className="aspect-[4/3] w-full animate-pulse rounded-2xl bg-white/5 sm:aspect-[21/9]" />
                  <div className={gridClass}>
                    {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/5" />)}
                  </div>
                </>
              ) : (
                <>
                  <NftSpotlight items={spotlight} />

                  {!coll ? (
                    <div data-nft-stats className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                      <div data-page-bento className="flex flex-col justify-center rounded-xl bg-zinc-900 px-3 py-2.5">
                        <span className="text-[19px] font-extrabold tabular-nums leading-none text-white sm:text-[24px]">{compactNumber(dehubTotals.minted)}</span>
                        <span className="mt-1 text-[11px] text-zinc-500">{t('nftMarket.statMinted', { defaultValue: 'Minted' })}</span>
                      </div>
                      <div data-page-bento className="flex flex-col justify-center rounded-xl bg-zinc-900 px-3 py-2.5">
                        <span className="text-[19px] font-extrabold tabular-nums leading-none text-white sm:text-[24px]">{compactNumber(forSaleTotal)}</span>
                        <span className="mt-1 text-[11px] text-zinc-500">{t('nftMarket.statForSale', { defaultValue: 'For sale' })}</span>
                      </div>
                      <button
                        type="button"
                        data-page-bento
                        onClick={() => setTab('sell')}
                        className="flex flex-col justify-center rounded-xl bg-zinc-900 px-3 py-2.5 text-left transition-transform active:scale-[0.98]"
                      >
                        <span className="text-[14px] font-bold leading-tight text-white sm:text-[16px]">{t('nftMarket.sellYours', { defaultValue: 'Sell yours' })} →</span>
                        <span className="mt-1 text-[11px] text-zinc-500">{t('nftMarket.sellYoursHint', { defaultValue: 'List from your wallet' })}</span>
                      </button>
                    </div>
                  ) : null}

                  {allCollections.length > 1 ? (
                    <CollectionsRow items={allCollections} selected={pickedCollection} onSelect={pickCollection} />
                  ) : null}

                  {coll ? (
                    <div className="flex items-center justify-between gap-2 px-1">
                      <p className="min-w-0 truncate text-[15px] font-bold text-white">
                        {coll.name || t('nftMarket.thisCollection', { defaultValue: 'This collection' })}
                        <span className="text-[13px] font-normal text-zinc-500">
                          {' · '}
                          {coll.listed
                            ? t('nftMarket.listedCount', { defaultValue: '{{n}} for sale', n: coll.listed })
                            : t('nftMarket.mintedCount', { defaultValue: '{{n}} minted', n: coll.minted ?? 0 })}
                        </span>
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {listings[0] || showcaseItems[0] ? (
                          <button
                            type="button"
                            data-kit-chip
                            data-size="sm"
                            onClick={() => setCollOffer(listings[0] ? targetOf(listings[0]) : showcaseTarget(showcaseItems[0]))}
                          >
                            <span>{t('nftMarket.collectionOffer', { defaultValue: 'Offer on any' })}</span>
                          </button>
                        ) : null}
                        <button type="button" data-kit-chip data-size="sm" onClick={() => setColl(null)}>
                          <span>{t('nftMarket.showAll', { defaultValue: 'Show all' })}</span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {gridListings.length ? (
                    <section className="flex flex-col gap-2">
                      {!coll ? (
                        <h2 className="px-1 text-[15px] font-bold text-white">{t('nftMarket.forSale', { defaultValue: 'For sale' })}</h2>
                      ) : null}
                      <div data-nft-grid className={gridClass}>
                        {gridListings.map((o, i) => (
                          <NftCard
                            key={o.orderHash}
                            compact
                            index={i}
                            name={titleOf(o.nftName, o.tokenId)}
                            collection={o.collectionName}
                            image={o.nftImage}
                            chainId={o.chainId}
                            badge={
                              (o.items?.length ?? 1) > 1
                                ? t('nftMarket.bundleBadge', { defaultValue: 'Bundle ×{{n}}', n: o.items!.length })
                                : o.endPrice && o.endPrice !== o.price
                                  ? t('nftMarket.dropBadge', { defaultValue: 'Price drop' })
                                  : o.amount !== '1' ? `×${o.amount}` : null
                            }
                            price={{
                              amount: o.endPrice && o.endPrice !== o.price ? currentPrice(o.components).toString() : o.price,
                              decimals: o.currencyDecimals,
                              symbol: o.currencySymbol,
                            }}
                            onClick={() => setOpen(targetOf(o))}
                          />
                        ))}
                      </div>
                      {browse.hasNextPage ? (
                        <div className="flex justify-center pt-2">
                          <KitButton variant="quiet" disabled={browse.isFetchingNextPage} onClick={() => browse.fetchNextPage()}>
                            {browse.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : t('nftMarket.loadMore', { defaultValue: 'Load more' })}
                          </KitButton>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {gridMints.length && (!coll || !listings.length) ? (
                    <section className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between gap-2 px-1">
                        <h2 className="text-[15px] font-bold text-white">
                          {coll ? t('nftMarket.openToOffers', { defaultValue: 'Open to offers' }) : t('nftMarket.latestMints', { defaultValue: 'Latest mints' })}
                        </h2>
                        <span className="text-[11.5px] text-zinc-500">{t('nftMarket.tapToOffer', { defaultValue: 'Tap one to make an offer' })}</span>
                      </div>
                      <div data-nft-grid className={gridClass}>
                        {gridMints.map((n, i) => (
                          <NftCard
                            key={`${n.chainId}:${n.contract}:${n.tokenId}`}
                            compact
                            index={i}
                            name={titleOf(n.name, n.tokenId)}
                            image={n.image}
                            chainId={n.chainId}
                            onClick={() => setOpen(showcaseTarget(n))}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {!listings.length && !showcaseItems.length ? (
                    <PageEmpty
                      icon="nfts"
                      title={t('nftMarket.emptyTitle', { defaultValue: 'Nothing listed yet' })}
                      body={t('nftMarket.emptyBody', { defaultValue: 'Be the first. List an NFT from your wallet and anyone on DeHub can buy it.' })}
                      action={<KitButton onClick={() => setTab('sell')}>{t('nftMarket.sellOne', { defaultValue: 'Sell an NFT' })}</KitButton>}
                    />
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {tab === 'sell' ? (
            !me ? signedOut : (
              <>
                {wallet.isLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
                ) : wallet.isError ? (
                  <PageEmpty icon="nfts" title={t('nftMarket.walletError', { defaultValue: 'Could not read your wallet' })} body={t('nftMarket.tryAgain', { defaultValue: 'Try again in a moment.' })} />
                ) : wallet.data?.items.length ? (
                  <>
                  <div className="flex flex-wrap items-center gap-2 pb-2.5">
                    {picking ? (
                      <>
                        <KitButton disabled={picked.length < 2} onClick={() => setBundle(picked)}>
                          {t('nftMarket.listPicked', { defaultValue: 'List {{n}} as a bundle', n: picked.length })}
                        </KitButton>
                        <KitButton variant="quiet" onClick={() => { setPicking(false); setPicked([]); }}>
                          {t('nftMarket.cancel', { defaultValue: 'Cancel' })}
                        </KitButton>
                        <span className="text-[12px] text-zinc-500">{t('nftMarket.pickHint', { defaultValue: 'Pick 2 to 4' })}</span>
                      </>
                    ) : (
                      <KitButton variant="quiet" onClick={() => setPicking(true)}>
                        {t('nftMarket.makeBundle', { defaultValue: 'Make a bundle' })}
                      </KitButton>
                    )}
                  </div>
                  <div data-nft-grid className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                    {wallet.data.items.map((n) => {
                      const target: NftSheetTarget = { chainId: sellChain, contract: n.contract, tokenId: n.tokenId, standard: n.standard, name: n.name, image: n.image, collectionName: n.collectionName };
                      const isPicked = picked.some((p) => p.contract === n.contract && p.tokenId === n.tokenId);
                      return (
                        <NftCard
                          key={`${n.contract}:${n.tokenId}`}
                          name={n.name || `#${n.tokenId}`}
                          collection={n.collectionName}
                          image={n.image}
                          chainId={sellChain}
                          badge={picking ? (isPicked ? '✓' : null) : n.standard === 'erc1155' && n.balance !== '1' ? `×${n.balance}` : null}
                          onClick={() => (picking ? togglePick(target) : setOpen(target))}
                        />
                      );
                    })}
                  </div>
                  </>
                ) : (
                  <PageEmpty
                    icon="nfts"
                    title={t('nftMarket.noNfts', { defaultValue: 'No NFTs on {{chain}}', chain: CHAIN_LABEL[sellChain] })}
                    body={t('nftMarket.noNftsBody', { defaultValue: 'Mint a post as an NFT, or switch chains to see what else you hold.' })}
                  />
                )}
              </>
            )
          ) : null}

          {tab === 'mine' ? (
            !me ? signedOut : mine.isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
            ) : mine.data?.length ? (
              <PageSection flush>
                {mine.data.map((o) => (
                  <button
                    key={o.orderHash}
                    type="button"
                    onClick={() => setOpen(targetOf(o))}
                    className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-left last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-white">{o.nftName || `#${o.tokenId}`}</p>
                      <p className="text-[12px] text-zinc-500">
                        {o.kind === 'listing' ? t('nftMarket.listing', { defaultValue: 'Listing' }) : t('nftMarket.offer', { defaultValue: 'Offer' })} · {CHAIN_LABEL[o.chainId]}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] tabular-nums text-white">{formatPrice(o.price, o.currencyDecimals)} {o.currencySymbol}</span>
                  </button>
                ))}
              </PageSection>
            ) : (
              <PageEmpty icon="stores" title={t('nftMarket.noOrders', { defaultValue: 'No open listings or offers' })} />
            )
          ) : null}

          {tab === 'sales' ? (
            <>
              {sales.isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
              ) : sales.data?.items.length ? (
                <PageSection flush>
                  {sales.data.items.map((s) => (
                    <div key={s.orderHash} className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 last:border-b-0">
                      <button type="button" className="min-w-0 text-left" onClick={() => setOpen(targetOf(s))}>
                        <p className="truncate text-[13.5px] font-semibold text-white">{s.nftName || `#${s.tokenId}`}</p>
                        <p className="text-[12px] text-zinc-500">{CHAIN_LABEL[s.chainId]} · {s.filledAt ? new Date(s.filledAt).toLocaleDateString() : ''}</p>
                      </button>
                      <a
                        href={s.fillTxHash ? `${EXPLORER[s.chainId]}/tx/${s.fillTxHash}` : undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-[13px] tabular-nums text-white"
                      >
                        {formatPrice(s.price, s.currencyDecimals)} {s.currencySymbol}
                      </a>
                    </div>
                  ))}
                </PageSection>
              ) : (
                <PageEmpty icon="stats" title={t('nftMarket.noSales', { defaultValue: 'No sales yet' })} />
              )}
            </>
          ) : null}
        </div>
      </PageBody>

      <NftSheet target={open} onClose={closeSheet} />
      <NftSheet target={collOffer} collectionOffer onClose={() => setCollOffer(null)} />
      <NftSheet
        target={bundle?.[0] ?? null}
        bundle={bundle}
        onClose={() => {
          setBundle(null);
          setPicking(false);
          setPicked([]);
        }}
      />
    </div>
  );
}
