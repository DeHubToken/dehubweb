/**
 * NFT Market
 * ==========
 * Buy, sell and make offers on any NFT on BNB or Base: Riftn posts and any
 * other collection in your wallet. Each trade is one Seaport swap, so the NFT
 * and the payment move together and nobody waits on the other side.
 *
 * Built on the page kit like the other marketplaces.
 */
import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { KitButton, PageBody, PageEmpty, PageIsland, PageSection, PageTabs } from '@/components/app/page-kit/PageKit';
import { AuthContext } from '@/contexts/AuthContext';
import { NftArt, NftCard, formatPrice } from '@/components/app/nft-market/NftCard';
import { NftSheet, errorText, type NftSheetTarget } from '@/components/app/nft-market/NftSheet';
import { toast } from 'sonner';
import { CollectionsRow, formatVolume } from '@/components/app/nft-market/CollectionsRow';
import { OpenSeaSheet } from '@/components/app/nft-market/OpenSeaSheet';
import { NftSpotlight, type SpotlightItem } from '@/components/app/nft-market/NftSpotlight';
import { CHAIN_LABEL, EXPLORER, MARKET_CHAINS, OPENSEA_CHAINS, fillListings, walletAddress, fetchBestOffers, fetchCollections, fetchOpenSea, fetchOrders, fetchShowcase, fetchWalletNfts, type MarketCollection, type MarketOrder, type OpenSeaListing, type ShowcaseNft } from '@/lib/market/market';
import SlidersHorizontal from '@/components/ui/cut-icons/settings';
import { currentPrice } from '@/lib/market/seaport';

type Tab = 'browse' | 'sell' | 'mine' | 'activity';
type ActivityKind = 'all' | 'sale' | 'listing' | 'offer';

/** How long ago, short: 5m, 3h, 2d. */
function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
type Sort = 'new' | 'price_asc' | 'price_desc';

/** The one card that stands for Riftn Posts on every chain. */
const DEHUB_ALL = 'dehub:all';

const compactNumber = (n: number) => n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Riftn NFT Market',
  description: 'Buy, sell and make offers on NFTs on BNB Chain and Base. Every trade swaps the NFT and the payment in one step.',
  url: 'https://riftn.com/nfts',
};

const EmbeddedBody = ({ children }: { children: ReactNode }) => <>{children}</>;

function targetOf(o: MarketOrder): NftSheetTarget {
  return { chainId: o.chainId, contract: o.contract, tokenId: o.tokenId, standard: o.standard, name: o.nftName, image: o.nftImage, collectionName: o.collectionName };
}

/**
 * `embedded`: rendered as the NFTs tab of the Fractions page. The Fractions
 * page owns the SEO tags and the island; this market's own tabs and filters
 * are portalled into `islandSlot` so they still sit on the island's glass.
 * Its sub tab rides in `?view=` because `?tab=` is the Fractions page's.
 */
export default function NftMarketPage({ embedded = false, islandSlot = null }: { embedded?: boolean; islandSlot?: HTMLElement | null } = {}) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const me = String(auth?.walletAddress ?? '').toLowerCase();
  const [params, setParams] = useSearchParams();
  const tabParam = embedded ? 'view' : 'tab';
  const [tab, setTabState] = useState<Tab>(() => {
    const asked = params.get(tabParam);
    if (asked === 'sales' || asked === 'activity') return 'activity';
    return asked === 'sell' || asked === 'mine' ? asked : 'browse';
  });
  const setTab = (next: Tab) => {
    setTabState(next);
    if (!embedded) return;
    const p = new URLSearchParams(window.location.search);
    if (next === 'browse') p.delete('view');
    else p.set('view', next);
    setParams(p, { replace: true });
  };
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

  // Minted Riftn posts, listed or not, so the market never looks empty.
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

  // Best open offer on each NFT you hold, so a good offer is visible without opening each one.
  const bestOffers = useQuery({
    queryKey: ['nft-market', 'best-offers', sellChain, (wallet.data?.items ?? []).map((n) => `${n.contract}:${n.tokenId}`).join(',')],
    queryFn: () => fetchBestOffers(sellChain, (wallet.data?.items ?? []).map((n) => ({ contract: n.contract, tokenId: n.tokenId }))),
    enabled: tab === 'sell' && !!wallet.data?.items.length,
    staleTime: 30_000,
  });
  const offerOn = useMemo(() => {
    const m = new Map<string, { amount: string; decimals: number; symbol: string }>();
    for (const o of bestOffers.data?.items ?? []) m.set(`${o.contract}:${o.tokenId}`, { amount: o.price, decimals: o.currencyDecimals, symbol: o.currencySymbol });
    return m;
  }, [bestOffers.data]);

  // OpenSea's best listings on their top collections (Base and Ethereum),
  // buyable here, so the market is full from day one.
  const [osOpen, setOsOpen] = useState<OpenSeaListing | null>(null);
  const osChains = chain === 'all' ? [...OPENSEA_CHAINS] : (OPENSEA_CHAINS as readonly number[]).includes(chain) ? [chain] : [];
  const openSea = useQuery({
    queryKey: ['nft-market', 'opensea', osChains.join(',')],
    queryFn: async () => {
      const lists = await Promise.all(osChains.map((c) => fetchOpenSea(c).then((r) => r.items, () => [] as OpenSeaListing[])));
      return lists.flat();
    },
    enabled: tab === 'browse' && osChains.length > 0,
    staleTime: 5 * 60_000,
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

  // Activity: sales, new listings and offers on one tape, newest first.
  const [activityKind, setActivityKind] = useState<ActivityKind>('all');
  const activity = useQuery({
    queryKey: ['nft-market', 'activity', chain],
    queryFn: async () => {
      const chainId = chain === 'all' ? undefined : chain;
      const [sold, listed, offered] = await Promise.all([
        fetchOrders({ kind: 'listing', status: 'filled', chainId, limit: 40 }),
        fetchOrders({ kind: 'listing', chainId, sort: 'new', limit: 40 }),
        fetchOrders({ kind: 'offer', chainId, limit: 40 }).catch(() => ({ items: [] as MarketOrder[], hasMore: false })),
      ]);
      const rows = [
        ...sold.items.map((o) => ({ type: 'sale' as const, at: o.filledAt ?? o.createdAt, o })),
        ...listed.items.map((o) => ({ type: 'listing' as const, at: o.createdAt, o })),
        ...offered.items.map((o) => ({ type: 'offer' as const, at: o.createdAt, o })),
      ];
      return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
    enabled: tab === 'activity',
    staleTime: 30_000,
  });
  const activityRows = useMemo(
    () => (activity.data ?? []).filter((r) => activityKind === 'all' || r.type === activityKind),
    [activity.data, activityKind],
  );

  // Cart: pick several listings and buy them in one transaction. One chain
  // and one currency per cart, because one transaction pays in one coin.
  const qc = useQueryClient();
  const [cartMode, setCartMode] = useState(false);
  const [cart, setCart] = useState<MarketOrder[]>([]);
  const [buying, setBuying] = useState(false);
  const cartFits = (o: MarketOrder) =>
    o.maker.toLowerCase() !== me && (!cart.length || (o.chainId === cart[0].chainId && o.currency === cart[0].currency));
  const toggleCart = (o: MarketOrder) => {
    if (cart.some((c) => c.orderHash === o.orderHash)) {
      setCart((list) => list.filter((c) => c.orderHash !== o.orderHash));
      return;
    }
    if (o.maker.toLowerCase() === me) {
      toast(t('nftMarket.cartOwn', { defaultValue: 'That one is yours' }));
      return;
    }
    if (!cartFits(o)) {
      toast(t('nftMarket.cartOneCoin', { defaultValue: 'One chain and one coin per cart. Clear it to switch.' }));
      return;
    }
    if (cart.length >= 20) {
      toast(t('nftMarket.cartFull', { defaultValue: 'Up to 20 at a time' }));
      return;
    }
    setCart((list) => [...list, o]);
  };
  const priceOf = (o: MarketOrder) => (o.endPrice && o.endPrice !== o.price ? currentPrice(o.components) : BigInt(o.price));
  const cartTotal = cart.reduce((sum, o) => sum + priceOf(o), 0n);
  const exitCart = () => {
    setCartMode(false);
    setCart([]);
  };
  const buyCart = async () => {
    if (!me) {
      auth?.openLoginModal?.();
      return;
    }
    setBuying(true);
    try {
      await fillListings(cart, await walletAddress());
      toast.success(t('nftMarket.cartBought', { defaultValue: 'Bought {{n}}. They are in your wallet now.', n: cart.length }));
      exitCart();
      qc.invalidateQueries({ queryKey: ['nft-market'] });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBuying(false);
    }
  };

  const listings = useMemo(() => browse.data?.pages.flatMap((p) => p.items) ?? [], [browse.data]);

  // Riftn Posts live on every chain as one contract each; show them as one
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
      name: t('nftMarket.dehubPostsName', { defaultValue: 'Riftn Posts' }),
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
    collectionName: t('nftMarket.dehubPostsName', { defaultValue: 'Riftn Posts' }),
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
              <span>{t('nftMarket.dehubPosts', { defaultValue: 'Riftn posts' })}</span>
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
    ) : tab === 'activity' ? (
      <>
        {chainChips}
        <PageTabs
          size="sm"
          value={activityKind}
          onChange={setActivityKind}
          tabs={[
            { id: 'all', label: t('nftMarket.actAll', { defaultValue: 'All' }) },
            { id: 'sale', label: t('nftMarket.actSales', { defaultValue: 'Sales' }) },
            { id: 'listing', label: t('nftMarket.actListings', { defaultValue: 'Listings' }) },
            { id: 'offer', label: t('nftMarket.actOffers', { defaultValue: 'Offers' }) },
          ]}
        />
      </>
    ) : null;

  const signedOut = (
    <PageEmpty
      icon="nfts"
      title={t('nftMarket.signInTitle', { defaultValue: 'Sign in to trade' })}
      body={t('nftMarket.signInBody', { defaultValue: 'Connect your wallet to sell what you hold and track your listings and offers.' })}
      action={<KitButton onClick={() => auth?.openLoginModal?.()}>{t('nftMarket.signInToTradeCta', { defaultValue: 'Sign in to trade' })}</KitButton>}
    />
  );

  const filterButton =
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
    ) : null;

  const subTabs = (
    <PageTabs
      size="sm"
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'browse', label: t('nftMarket.tabBrowse', { defaultValue: 'Browse' }) },
        { id: 'sell', label: t('nftMarket.tabSell', { defaultValue: 'Sell' }) },
        { id: 'mine', label: t('nftMarket.tabMine', { defaultValue: 'My orders' }) },
        { id: 'activity', label: t('nftMarket.tabRecent', { defaultValue: 'Recent' }) },
      ]}
    />
  );

  const embeddedControls = (
    <>
      <div data-nft-subtabs className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{subTabs}</div>
        {filterButton}
      </div>
      {filters}
    </>
  );

  // Embedded: the Fractions page already wraps us in its PageBody.
  const Body = embedded ? EmbeddedBody : PageBody;
  return (
    <div className={embedded ? undefined : 'min-h-screen'}>
      {embedded ? (
        islandSlot ? createPortal(embeddedControls, islandSlot) : null
      ) : (
        <>
          <SEOHead
            title={t('nftMarket.seoTitle', { defaultValue: 'NFT Market: buy and sell NFTs on BNB and Base | Riftn' })}
            description={t('nftMarket.seoDescription', {
              defaultValue: 'Buy, sell and make offers on NFTs on BNB Chain and Base. Pay in BNB, ETH or DHB. Every trade swaps the NFT and the payment in one step.',
            })}
            image="https://riftn.com/og/nfts.jpg"
            url="https://riftn.com/nfts"
            jsonLd={JSON_LD}
          />
          <PageIsland icon="nfts" title={t('nftMarket.shortTitle', { defaultValue: 'NFTs' })} actions={filterButton} tabs={subTabs}>
            {filters}
          </PageIsland>
        </>
      )}

      <Body>
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
                    <div data-page-bento className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold text-white">
                          {coll.name || t('nftMarket.thisCollection', { defaultValue: 'This collection' })}
                        </p>
                        <p data-nft-coll-stats className="flex flex-wrap gap-x-3 text-[12px] tabular-nums text-zinc-500">
                          {coll.floor ? (
                            <span>
                              {t('nftMarket.floor', { defaultValue: 'Floor' })}{' '}
                              <span className="font-semibold text-white">{formatPrice(coll.floor.amount, coll.floor.decimals)} {coll.floor.symbol}</span>
                            </span>
                          ) : null}
                          {coll.volume && coll.sales ? (
                            <span>
                              {t('nftMarket.volume', { defaultValue: 'Volume' })}{' '}
                              <span className="font-semibold text-white">{formatVolume(coll.volume)}</span>
                            </span>
                          ) : null}
                          {coll.sales ? <span>{t('nftMarket.salesCount', { defaultValue: '{{n}} sold', n: coll.sales })}</span> : null}
                          <span>
                            {coll.listed
                              ? t('nftMarket.listedCount', { defaultValue: '{{n}} for sale', n: coll.listed })
                              : t('nftMarket.mintedCount', { defaultValue: '{{n}} minted', n: coll.minted ?? 0 })}
                          </span>
                        </p>
                      </div>
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
                      <div data-page-bento className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900 px-3 py-2">
                        <h2 className="text-[15px] font-bold text-white">
                          {cartMode
                            ? t('nftMarket.cartPick', { defaultValue: 'Tap to add to cart' })
                            : coll
                              ? t('nftMarket.forSaleHere', { defaultValue: 'For sale here' })
                              : t('nftMarket.forSale', { defaultValue: 'For sale' })}
                        </h2>
                        {gridListings.length > 1 || cartMode ? (
                          <button
                            type="button"
                            data-kit-chip
                            data-size="sm"
                            data-active={cartMode ? 'true' : undefined}
                            onClick={() => (cartMode ? exitCart() : setCartMode(true))}
                          >
                            <span>{cartMode ? t('nftMarket.cancel', { defaultValue: 'Cancel' }) : t('nftMarket.buySeveral', { defaultValue: 'Buy several' })}</span>
                          </button>
                        ) : null}
                      </div>
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
                            selected={cartMode ? cart.some((c) => c.orderHash === o.orderHash) : undefined}
                            dimmed={cartMode && !cart.some((c) => c.orderHash === o.orderHash) && !cartFits(o)}
                            onClick={() => (cartMode ? toggleCart(o) : setOpen(targetOf(o)))}
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
                      <div data-page-bento className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900 px-3 py-2">
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

                  {!coll && !dehubOnly && !cartMode && openSea.data?.length ? (
                    <section data-nft-opensea className="flex flex-col gap-2">
                      <div data-page-bento className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900 px-3 py-2">
                        <h2 className="text-[15px] font-bold text-white">{t('nftMarket.fromOpenSea', { defaultValue: 'Top collections on OpenSea' })}</h2>
                        <span className="text-[11.5px] text-zinc-500">{t('nftMarket.buyHere', { defaultValue: 'Buy them here' })}</span>
                      </div>
                      <div data-nft-grid className={gridClass}>
                        {openSea.data.slice(0, 24).map((l, i) => (
                          <NftCard
                            key={l.orderHash}
                            compact
                            index={i}
                            name={l.nftName || `${l.collectionName ?? ''} #${l.tokenId}`}
                            collection={l.collectionName}
                            image={l.nftImage}
                            chainId={l.chainId}
                            price={{ amount: l.price, decimals: l.currencyDecimals, symbol: l.currencySymbol }}
                            onClick={() => setOsOpen(l)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {!listings.length && !showcaseItems.length ? (
                    <PageEmpty
                      icon="nfts"
                      title={t('nftMarket.emptyTitle', { defaultValue: 'Nothing listed yet' })}
                      body={t('nftMarket.emptyBody', { defaultValue: 'Be the first. List an NFT from your wallet and anyone on Riftn can buy it.' })}
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
                          price={picking ? null : offerOn.get(`${n.contract}:${n.tokenId}`) ?? null}
                          priceLabel={t('nftMarket.bestOffer', { defaultValue: 'Best offer' })}
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

          {tab === 'activity' ? (
            activity.isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
            ) : activityRows.length ? (
              <PageSection flush>
                {activityRows.map(({ type, at, o }) => (
                  <div key={`${type}:${o.orderHash}`} data-nft-activity className="flex items-center gap-3 border-b border-white/10 px-3 py-2.5 last:border-b-0">
                    <button type="button" onClick={() => setOpen(targetOf(o))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <NftArt src={o.nftImage} alt="" className="h-11 w-11 shrink-0 rounded-lg" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-white">{o.isCollection ? (o.collectionName || t('nftMarket.anyInCollection', { defaultValue: 'Any in collection' })) : titleOf(o.nftName, o.tokenId)}</p>
                        <p className="truncate text-[12px] text-zinc-400">
                          <span data-nft-activity-kind={type} className="font-semibold text-zinc-200">
                            {type === 'sale'
                              ? t('nftMarket.actSale', { defaultValue: 'Sale' })
                              : type === 'listing'
                                ? t('nftMarket.actListed', { defaultValue: 'Listed' })
                                : o.isCollection
                                  ? t('nftMarket.actCollectionOffer', { defaultValue: 'Collection offer' })
                                  : t('nftMarket.actOffer', { defaultValue: 'Offer' })}
                          </span>
                          {' · '}
                          {CHAIN_LABEL[o.chainId]}
                          {o.makerProfile?.username ? ` · @${o.makerProfile.username}` : ''}
                        </p>
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col items-end">
                      {type === 'sale' && o.fillTxHash ? (
                        <a href={`${EXPLORER[o.chainId]}/tx/${o.fillTxHash}`} target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold tabular-nums text-white underline-offset-2 hover:underline">
                          {formatPrice(o.price, o.currencyDecimals)} {o.currencySymbol}
                        </a>
                      ) : (
                        <span className="text-[13.5px] font-semibold tabular-nums text-white">{formatPrice(o.price, o.currencyDecimals)} {o.currencySymbol}</span>
                      )}
                      <span className="text-[11px] tabular-nums text-zinc-400">{ago(at)}</span>
                    </div>
                  </div>
                ))}
              </PageSection>
            ) : (
              <PageEmpty icon="stats" title={t('nftMarket.noActivity', { defaultValue: 'Nothing here yet' })} />
            )
          ) : null}
        </div>
      </Body>

      {cartMode && cart.length ? (
        <div data-nft-cart className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-6">
          <div data-page-bento className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]">
            <div className="flex -space-x-2">
              {cart.slice(0, 3).map((o) => (
                <NftArt key={o.orderHash} src={o.nftImage} alt="" className="h-8 w-8 rounded-lg ring-2 ring-zinc-900" />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold text-white">{t('nftMarket.cartCount', { defaultValue: '{{n}} in cart', n: cart.length })}</p>
              <p className="truncate text-[12px] tabular-nums text-zinc-400">
                {formatPrice(cartTotal.toString(), cart[0].currencyDecimals)} {cart[0].currencySymbol} · {CHAIN_LABEL[cart[0].chainId]}
              </p>
            </div>
            <KitButton disabled={buying} onClick={buyCart}>
              {buying ? <Loader2 className="h-4 w-4 animate-spin" /> : t('nftMarket.buyAll', { defaultValue: 'Buy all' })}
            </KitButton>
          </div>
        </div>
      ) : null}

      <NftSheet target={open} onClose={closeSheet} />
      <NftSheet target={collOffer} collectionOffer onClose={() => setCollOffer(null)} />
      <OpenSeaSheet item={osOpen} onClose={() => setOsOpen(null)} />
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
