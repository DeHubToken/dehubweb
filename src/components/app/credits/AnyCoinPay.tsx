import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import { ArrowLeft, Check, Copy, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
// Context, not useAuth: the state gallery shows this sheet with no AuthProvider.
import { AuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { estimateMinutes, formatPaymentAmount, paymentChainName } from '@/lib/crypto-purchase';
import {
  ANY_COIN_MIN_USD,
  anyCoinIntentStatus,
  fetchAnyCoins,
  intentInFlight,
  isEvmCoin,
  listAnyCoinIntents,
  openAnyCoinIntent,
  quoteAnyCoin,
  type AnyCoin,
  type AnyCoinIntent,
} from '@/lib/studio-coin-intent';
import ethLogo from '@/assets/eth-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import btcLogo from '@/assets/btc-logo.png';
import bnbLogo from '@/assets/bnb-logo.png';
import avaxLogo from '@/assets/avax-logo.png';
import solLogo from '@/assets/icons/solana-logo.png';

const LOGOS: Record<string, string> = { ETH: ethLogo, USDC: usdcLogo, USDT: usdtLogo, BTC: btcLogo, BNB: bnbLogo, SOL: solLogo, AVAX: avaxLogo };

function AnyCoinIcon({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const logo = LOGOS[symbol];
  if (logo) return <img src={logo} alt="" className="shrink-0 rounded-full object-contain" style={{ width: size, height: size }} />;
  // No logo on file: the ticker's first letters on a tone picked from its name.
  const hue = [...symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 45% 32%)` }}
    >
      {symbol.slice(0, 3)}
    </span>
  );
}

function Qr({ value }: { value: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [value]);
  return <div className="h-[132px] w-[132px] shrink-0 rounded-2xl bg-white p-2.5 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const coinKey = (c: AnyCoin) => c.assetId;

/**
 * "Any other coin": pay from any wallet or exchange in one of the 200+ coins
 * NEAR Intents carries. The dollars land in the Studio balance, then
 * `onFunded` runs and the job is paid from it.
 */
export default function AnyCoinPay({
  usdNeeded,
  onBack,
  onFunded,
  preview,
}: {
  usdNeeded: number;
  onBack: () => void;
  onFunded: () => void;
  /** State gallery only: fixed coins and an optional open payment, nothing is sent. */
  preview?: { coins: AnyCoin[]; intent?: AnyCoinIntent };
}) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const walletAddress = auth?.walletAddress || '';
  const solanaAddress = (auth?.user as { solanaAddress?: string | null } | null | undefined)?.solanaAddress || '';
  const queryClient = useQueryClient();
  const usd = Math.max(ANY_COIN_MIN_USD, Math.ceil(usdNeeded * 100) / 100);

  const coinsQuery = useQuery({ queryKey: ['any-coin-options'], queryFn: fetchAnyCoins, staleTime: 5 * 60_000, enabled: !preview });
  const coins = preview?.coins || coinsQuery.data || [];
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<AnyCoin | null>(null);
  const [refund, setRefund] = useState('');
  const [intent, setIntent] = useState<AnyCoinIntent | null>(preview?.intent || null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  // A payment opened earlier and not finished picks up where it left off.
  const openQuery = useQuery({
    queryKey: ['any-coin-intents'],
    queryFn: listAnyCoinIntents,
    enabled: !preview && !!auth?.isAuthenticated,
    staleTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (intent || !openQuery.data) return;
    const live = openQuery.data.find((row) => intentInFlight(row));
    if (live) setIntent(live);
  }, [openQuery.data, intent]);

  useEffect(() => {
    if (!picked) return;
    setRefund(isEvmCoin(picked) ? walletAddress : picked.blockchain === 'sol' ? solanaAddress : '');
    setError('');
  }, [picked?.assetId, walletAddress, solanaAddress]);

  const quoteQuery = useQuery({
    queryKey: ['any-coin-quote', picked?.assetId, usd],
    queryFn: () => quoteAnyCoin(picked!.assetId, usd),
    enabled: !!picked && !preview && !intent,
    staleTime: 25_000,
    retry: false,
  });
  const quote = preview && picked
    ? { amountInFormatted: picked.price ? String(usd / picked.price) : null, amountInUsd: null, timeEstimateSeconds: 60, usd, raisedToMinimum: false }
    : quoteQuery.data;

  // Watch an open payment until the dollars are in the Studio balance.
  useEffect(() => {
    if (!intent || preview || intent.credited || !intentInFlight(intent)) return;
    const timer = window.setTimeout(async () => {
      try { setIntent(await anyCoinIntentStatus(intent.id)); } catch { /* next tick */ }
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [intent, preview]);
  useEffect(() => {
    if (!intent?.credited || preview) return;
    void (async () => {
      await queryClient.invalidateQueries({ queryKey: ['subscription-credits'] });
      await queryClient.invalidateQueries({ queryKey: ['any-coin-intents'] });
      toast.success(t('anyCoin.landed', { defaultValue: '${{usd}} added to your Studio balance', usd: (intent.creditedUsd ?? intent.usd).toFixed(2) }));
      onFunded();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.credited]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? coins.filter((c) => `${c.symbol} ${paymentChainName(c.blockchain)} ${c.blockchain} ${c.contractAddress || ''}`.toLowerCase().includes(q))
      : coins;
    return list.slice(0, q ? 60 : 30);
  }, [coins, search]);

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success(t('anyCoin.copied', { defaultValue: 'Copied' })); }
    catch { toast.error(t('anyCoin.copyFailed', { defaultValue: 'Could not copy. Select it and copy by hand.' })); }
  };

  const open = async () => {
    if (!picked || preview || opening) return;
    setOpening(true);
    setError('');
    try {
      setIntent(await openAnyCoinIntent(picked.assetId, quote?.usd || usd, refund.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('anyCoin.openFailed', { defaultValue: 'Could not open that payment. Try again.' }));
    } finally {
      setOpening(false);
    }
  };

  const header = (title: string, back: () => void) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={back}
        aria-label={t('anyCoin.back', { defaultValue: 'Back' })}
        className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.08] text-white hover:bg-white/[0.14]"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <h3 className="text-[17px] font-extrabold text-white">{title}</h3>
    </div>
  );

  // Step 3: the address to send to.
  if (intent) {
    const minutes = estimateMinutes(intent.timeEstimateSeconds);
    const waiting = intent.settlement === 'PENDING_DEPOSIT' || intent.settlement === 'INCOMPLETE_DEPOSIT';
    const failed = !intent.credited && !intentInFlight(intent);
    const status = intent.credited
      ? t('anyCoin.statusDone', { defaultValue: 'Paid. Starting your job…' })
      : failed
        ? intent.settlement === 'REFUNDED'
          ? t('anyCoin.statusRefunded', { defaultValue: 'Refunded to your address.' })
          : t('anyCoin.statusExpired', { defaultValue: 'This payment address has closed. Nothing was taken.' })
        : intent.settlement === 'INCOMPLETE_DEPOSIT'
          ? t('anyCoin.statusShort', { defaultValue: 'Less than the amount arrived. Send the rest to the same address.' })
          : waiting
            ? t('anyCoin.statusWaiting', { defaultValue: 'Waiting for your payment…' })
            : t('anyCoin.statusSwapping', { defaultValue: 'Payment seen. Converting it…' });
    return (
      <div className="mt-1 flex flex-col gap-3">
        {header(
          t('anyCoin.sendTitle', { defaultValue: 'Send {{symbol}}', symbol: intent.originSymbol }),
          () => { setIntent(null); if (!picked) onBack(); },
        )}
        <div className="flex gap-3 rounded-[18px] bg-white/[0.06] p-3">
          <Qr value={intent.depositAddress} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-zinc-400">{t('anyCoin.exactAmount', { defaultValue: 'Send exactly' })}</p>
            <button type="button" onClick={() => copy(intent.amountInFormatted)} className="flex items-center gap-1.5 text-left">
              <span className="text-[22px] font-extrabold leading-tight text-white tabular-nums">{formatPaymentAmount(intent.amountInFormatted)}</span>
              <Copy className="h-3.5 w-3.5 text-zinc-400" />
            </button>
            <p className="text-[13px] font-bold text-white">
              {intent.originSymbol} <span className="font-semibold text-zinc-400">{t('anyCoin.onChain', { defaultValue: 'on {{chain}}', chain: paymentChainName(intent.originBlockchain) })}</span>
            </p>
            <p className="mt-1 text-[12px] text-zinc-400">{t('anyCoin.worth', { defaultValue: '≈ ${{usd}} to your Studio balance', usd: intent.usd.toFixed(2) })}</p>
          </div>
        </div>
        <div>
          <p className="mb-1 text-[12px] text-zinc-400">{t('anyCoin.toAddress', { defaultValue: 'To this address' })}</p>
          <button
            type="button"
            onClick={() => copy(intent.depositAddress)}
            className="flex w-full items-center gap-2 rounded-[14px] bg-white/[0.06] px-3 py-2.5 text-left font-mono text-[12px] text-white hover:bg-white/[0.1]"
          >
            <span className="min-w-0 flex-1 break-all">{intent.depositAddress}</span>
            <Copy className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
        </div>
        {intent.depositMemo != null && intent.depositMemo !== '' && (
          <div className="rounded-[14px] border border-amber-400/40 p-3">
            <p className="text-[12px] text-amber-300">{t('anyCoin.memo', { defaultValue: 'Add this memo or the payment is lost:' })}</p>
            <button type="button" onClick={() => copy(intent.depositMemo!)} className="mt-1 flex items-center gap-2 font-mono text-[13px] text-white">
              {intent.depositMemo} <Copy className="h-3.5 w-3.5 text-zinc-400" />
            </button>
          </div>
        )}
        <div className={cn('flex items-center gap-2 rounded-[14px] px-3 py-2.5 text-[13px] font-semibold', failed ? 'bg-red-500/10 text-red-300' : 'bg-white/[0.06] text-white')}>
          {intent.credited ? <Check className="h-4 w-4 text-emerald-400" /> : !failed && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          <span aria-live="polite">{status}</span>
        </div>
        {!failed && !intent.credited && (
          <p className="text-[11px] text-zinc-500">
            {minutes
              ? t('anyCoin.timing', { defaultValue: 'Usually about {{minutes}} min after your payment confirms. You can close this; it still lands.', minutes })
              : t('anyCoin.timingUnknown', { defaultValue: 'Lands once your payment confirms. You can close this; it still lands.' })}{' '}
            {t('anyCoin.deadline', { defaultValue: 'Open until {{time}}.', time: new Date(intent.expiresAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
          </p>
        )}
      </div>
    );
  }

  // Step 2: refund address and price.
  if (picked) {
    const needsRefund = !refund.trim();
    return (
      <div className="mt-1 flex flex-col gap-3">
        {header(t('anyCoin.payTitle', { defaultValue: 'Pay with {{symbol}}', symbol: picked.symbol }), () => setPicked(null))}
        <div className="flex items-center gap-3 rounded-[18px] bg-white/[0.06] px-3 py-3">
          <AnyCoinIcon symbol={picked.symbol} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold text-white">{picked.symbol} <span className="text-[12px] font-semibold text-zinc-400">{paymentChainName(picked.blockchain)}</span></p>
            <p className="text-[12px] text-zinc-400">{t('anyCoin.covers', { defaultValue: 'Covers ${{usd}}', usd: (quote?.usd || usd).toFixed(2) })}</p>
          </div>
          <div className="text-right">
            {quoteQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            ) : quote?.amountInFormatted ? (
              <span className="text-[16px] font-extrabold text-white tabular-nums">≈ {formatPaymentAmount(quote.amountInFormatted)}</span>
            ) : (
              <span className="text-[12px] text-zinc-400">—</span>
            )}
          </div>
        </div>
        {quote?.raisedToMinimum && (
          <p className="text-[12px] text-amber-200">
            {t('anyCoin.minimum', { defaultValue: '{{symbol}} payments start at ${{usd}}. The extra stays in your Studio balance.', symbol: picked.symbol, usd: quote.usd.toFixed(2) })}
          </p>
        )}
        {quoteQuery.isError && (
          <p className="text-[12px] text-red-300">{(quoteQuery.error as Error)?.message || t('anyCoin.quoteFailed', { defaultValue: 'Could not price this coin right now.' })}</p>
        )}
        <label className="block">
          <span className="text-[12px] text-zinc-400">
            {t('anyCoin.refundLabel', { defaultValue: 'Your {{chain}} address, for refunds', chain: paymentChainName(picked.blockchain) })}
          </span>
          <input
            value={refund}
            onChange={(e) => setRefund(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            placeholder={t('anyCoin.refundPlaceholder', { defaultValue: 'Paste an address you own' })}
            className="mt-1 h-11 w-full rounded-[14px] border border-white/10 bg-white/[0.06] px-3 font-mono text-[13px] text-white outline-none placeholder:font-sans placeholder:text-zinc-500 focus:border-white/30"
          />
          <span className="mt-1 block text-[11px] text-zinc-500">
            {t('anyCoin.refundHint', { defaultValue: 'Only used if the payment can’t go through. Use your own wallet, not an exchange.' })}
          </span>
        </label>
        {error && <p role="alert" className="text-[12px] text-red-300">{error}</p>}
        <button
          type="button"
          onClick={open}
          disabled={opening || needsRefund || !quote?.amountInFormatted}
          className="flex h-[52px] items-center justify-center gap-2 rounded-full bg-white text-[16px] font-extrabold text-black transition-opacity disabled:opacity-50"
        >
          {opening && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('anyCoin.getAddress', { defaultValue: 'Get payment address' })}
        </button>
      </div>
    );
  }

  // Step 1: pick a coin.
  return (
    <div className="mt-1 flex flex-col gap-3">
      {header(t('anyCoin.title', { defaultValue: 'Any other coin' }), onBack)}
      <label className="flex h-11 items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.06] px-3 focus-within:border-white/30">
        <Search className="h-4 w-4 text-zinc-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('anyCoin.search', { defaultValue: 'Search {{count}} coins', count: coins.length || 200 })}
          aria-label={t('anyCoin.searchLabel', { defaultValue: 'Search coins' })}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-zinc-500"
        />
      </label>
      <div className="flex max-h-[44vh] flex-col gap-1.5 overflow-y-auto [scrollbar-width:none]">
        {!preview && coinsQuery.isLoading ? (
          <div className="flex justify-center py-8 text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : coinsQuery.isError && !preview ? (
          <p className="py-6 text-center text-sm text-zinc-400">{t('anyCoin.loadFailed', { defaultValue: 'Could not load coins. Try again shortly.' })}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">{t('anyCoin.noMatch', { defaultValue: 'No coin matches that.' })}</p>
        ) : (
          rows.map((coin) => (
            <button
              key={coinKey(coin)}
              type="button"
              onClick={() => setPicked(coin)}
              className="flex items-center gap-3 rounded-[18px] bg-white/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.1]"
            >
              <AnyCoinIcon symbol={coin.symbol} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold text-white">{coin.symbol}</span>
                <span className="block text-[12px] text-zinc-400">{paymentChainName(coin.blockchain)}</span>
              </span>
              {coin.price != null && coin.price > 0 && (
                <span className="text-right text-[13px] font-bold text-white tabular-nums">
                  {formatPaymentAmount(String(usd / coin.price))}
                  <span className="block text-[11px] font-semibold text-zinc-400">{coin.symbol}</span>
                </span>
              )}
            </button>
          ))
        )}
      </div>
      <p className="text-center text-[11px] text-zinc-500">
        {t('anyCoin.note', { defaultValue: 'Send from any wallet or exchange. It lands in your Studio balance.' })}
      </p>
    </div>
  );
}
