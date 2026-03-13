import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Copy, Check, Loader2, Globe, ExternalLink, AlertTriangle, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  SUPPORTED_CHAINS,
  DESTINATION_ASSETS,
  DEFAULT_DESTINATION,
  type ChainInfo,
  type TokenInfo,
  type QuoteResponse,
  type StatusResponse,
} from '@/lib/near-intents';

import ethLogo from '@/assets/eth-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import btcLogo from '@/assets/btc-logo.png';
import bnbLogo from '@/assets/bnb-logo.png';
import baseLogo from '@/assets/icons/base-logo.png';
import solLogo from '@/assets/icons/solana-logo.png';
import avaxLogo from '@/assets/avax-logo.png';

// Icon map: iconKey → image src
const ICON_MAP: Record<string, string> = {
  ETH: ethLogo,
  USDC: usdcLogo,
  USDT: usdtLogo,
  BTC: btcLogo,
  BNB: bnbLogo,
  BASE: baseLogo,
  WETH: ethLogo,
  SOL: solLogo,
  AVAX: avaxLogo,
};

function TokenIcon({ iconKey, size = 'w-7 h-7' }: { iconKey: string; size?: string }) {
  const src = ICON_MAP[iconKey];
  if (src) {
    return <img src={src} alt={iconKey} className={`${size} rounded-full`} />;
  }
  // Fallback: letter circle
  return (
    <div className={`${size} rounded-full bg-zinc-700 flex items-center justify-center shrink-0`}>
      <span className="text-[10px] font-bold text-zinc-300">{iconKey.slice(0, 2)}</span>
    </div>
  );
}

interface CrossChainDepositDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinationSymbol?: string;
}

type Step = 'chains' | 'amount' | 'deposit' | 'success' | 'error';

export function CrossChainDepositDrawer({ open, onOpenChange, destinationSymbol }: CrossChainDepositDrawerProps) {
  const { walletAddress } = useAuth();
  const { t } = useTranslation();
  const dest = (destinationSymbol && DESTINATION_ASSETS[destinationSymbol]) || DEFAULT_DESTINATION;
  const destLabel = dest.label;

  const [step, setStep] = useState<Step>('chains');
  const [selectedChain, setSelectedChain] = useState<ChainInfo | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [amount, setAmount] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [copied, setCopied] = useState(false);
  const [statusPolling, setStatusPolling] = useState(false);
  const [depositStatus, setDepositStatus] = useState<StatusResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setStep('chains');
      setSelectedChain(null);
      setSelectedToken(null);
      setAmount('');
      setQuote(null);
      setQuoteError('');
      setDepositStatus(null);
      setErrorMsg('');
      setCopied(false);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  const handleSelectToken = (chain: ChainInfo, token: TokenInfo) => {
    setSelectedChain(chain);
    setSelectedToken(token);
    setStep('amount');
    setAmount('');
    setQuote(null);
    setQuoteError('');
  };

  const fetchQuote = useCallback(async () => {
    if (!selectedToken || !amount || !walletAddress || parseFloat(amount) <= 0) return;

    setQuoteLoading(true);
    setQuoteError('');
    setQuote(null);

    try {
      const amountInSmallest = (parseFloat(amount) * Math.pow(10, selectedToken.decimals)).toFixed(0);
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/cross-chain-quote?action=quote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originAsset: selectedToken.assetId,
            destinationAsset: dest.assetId,
            amount: amountInSmallest,
            recipient: `base:${walletAddress}`,
            amountType: 'in',
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || 'Quote failed');
      setQuote(data);
    } catch (err: any) {
      setQuoteError(err?.message || 'Failed to get quote');
    } finally {
      setQuoteLoading(false);
    }
  }, [selectedToken, amount, walletAddress]);

  useEffect(() => {
    if (step !== 'amount' || !amount || parseFloat(amount) <= 0) return;
    const timer = setTimeout(fetchQuote, 800);
    return () => clearTimeout(timer);
  }, [amount, step, fetchQuote]);

  const handleProceedToDeposit = () => {
    if (!quote) return;
    setStep('deposit');
    startStatusPolling(quote.deposit_address);
  };

  const destSymbol = destinationSymbol || 'ETH';

  const startStatusPolling = (depositAddress: string) => {
    setStatusPolling(true);
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/cross-chain-quote?action=status&depositAddress=${depositAddress}`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        const status: StatusResponse = await res.json();
        setDepositStatus(status);

        if (status.status === 'COMPLETED') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatusPolling(false);
          setStep('success');
          toast.success(t('commandCentre.crossChainCompleted', { symbol: destSymbol }));
        } else if (status.status === 'FAILED' || status.status === 'EXPIRED') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatusPolling(false);
          setErrorMsg(status.status === 'EXPIRED' ? t('commandCentre.depositExpired') : t('commandCentre.depositFailedMsg'));
          setStep('error');
        }
      } catch {
        // Continue polling on network errors
      }
    }, 5000);
  };

  const handleCopyAddress = () => {
    if (!quote?.deposit_address) return;
    navigator.clipboard.writeText(quote.deposit_address);
    setCopied(true);
    toast.success(t('toasts.deposit_address_copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const estimatedOut = quote?.amount_out
    ? (parseInt(quote.amount_out) / Math.pow(10, dest.decimals)).toLocaleString(undefined, { maximumFractionDigits: dest.decimals <= 8 ? dest.decimals : 6 })
    : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass hideHandle={false}>
        <div className="p-5 pb-8 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-3">
            {step !== 'chains' && step !== 'success' && (
              <button
                onClick={() => {
                  if (step === 'amount') setStep('chains');
                  if (step === 'deposit') { setStep('amount'); if (pollRef.current) clearInterval(pollRef.current); }
                  if (step === 'error') setStep('chains');
                }}
                className="text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h3 className="text-white font-semibold text-base">
                {step === 'chains' && t('commandCentre.depositFromAnyChain')}
                {step === 'amount' && t('commandCentre.send') + ' ' + selectedToken?.symbol}
                {step === 'deposit' && t('commandCentre.sendToDepositAddress')}
                {step === 'success' && t('commandCentre.depositComplete')}
                {step === 'error' && t('commandCentre.depositFailed')}
              </h3>
              {step === 'chains' && (
                <p className="text-xs text-white/40">{t('commandCentre.sendCryptoToReceive', { dest: destLabel })}</p>
              )}
            </div>
          </div>

          {/* Step: Chain & Token Selection */}
          {step === 'chains' && (
            <div className="space-y-1.5">
              {SUPPORTED_CHAINS.map((chain) => (
                <div key={chain.id}>
                  {chain.tokens.map((token) => (
                    <button
                      key={token.assetId}
                      onClick={() => handleSelectToken(chain, token)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors mb-1.5"
                    >
                      <TokenIcon iconKey={token.iconKey} />
                      <div className="text-left flex-1">
                        <span className="text-sm font-medium text-white">{token.symbol}</span>
                        <p className="text-xs text-white/40">{chain.name}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/20" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Step: Amount Input */}
          {step === 'amount' && selectedToken && selectedChain && (
            <>
              <div className="flex items-center gap-2 text-xs text-white/50">
                <TokenIcon iconKey={selectedToken.iconKey} size="w-5 h-5" />
                <span>{t('commandCentre.tokenOnChainTo', { symbol: selectedToken.symbol, chain: selectedChain.name, dest: destLabel })}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-white/50">{t('commandCentre.tokenAmount', { symbol: selectedToken.symbol })}</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={`e.g. ${selectedToken.symbol === 'USDC' || selectedToken.symbol === 'USDT' ? '50' : '0.01'}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-white/[0.06] border-white/10 text-white backdrop-blur-sm text-lg font-mono"
                />
              </div>

              {/* Quote display */}
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">{t('commandCentre.estimatedReceived', { symbol: destSymbol })}</span>
                  {quoteLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-white/40 animate-spin" />
                  ) : estimatedOut ? (
                    <span className="text-white font-mono">{estimatedOut} {destSymbol}</span>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </div>
                {quoteError && (
                  <p className="text-xs text-amber-400/80 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {quoteError}
                  </p>
                )}
              </div>

              <Button
                variant="glass"
                className="w-full rounded-xl"
                disabled={!quote || quoteLoading}
                onClick={handleProceedToDeposit}
              >
                <Globe className="w-4 h-4 mr-2" />
                {t('commandCentre.getDepositAddress')}
              </Button>
            </>
          )}

          {/* Step: Deposit Address */}
          {step === 'deposit' && quote && selectedToken && selectedChain && (
            <>
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
                <p className="text-xs text-white/50 text-center">
                  {t('commandCentre.sendExactlyTo', { amount, symbol: selectedToken.symbol, chain: selectedChain.name })}
                </p>
                <div className="bg-white/[0.06] rounded-lg p-3 break-all font-mono text-xs text-white/80 text-center">
                  {quote.deposit_address}
                </div>
                <Button
                  variant="glass"
                  className="w-full rounded-xl"
                  onClick={handleCopyAddress}
                >
                  {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? t('commandCentre.copiedAddress') : t('commandCentre.copyAddress')}
                </Button>
              </div>

              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">{t('commandCentre.status')}</span>
                  <span className="flex items-center gap-1.5">
                    {statusPolling && <Loader2 className="w-3 h-3 text-white/40 animate-spin" />}
                    <span className="text-white/70">
                      {depositStatus?.status === 'EXECUTING' ? t('commandCentre.processingDeposit') : t('commandCentre.waitingForDeposit')}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">{t('commandCentre.youllReceive')}</span>
                  <span className="text-white font-mono">{estimatedOut} {destSymbol}</span>
                </div>
              </div>

              <p className="text-[10px] text-white/30 text-center">
                {t('commandCentre.depositExpireNote')}
              </p>
            </>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm text-white font-medium">{t('commandCentre.tokenReceived', { symbol: destSymbol })}</p>
              <p className="text-xs text-white/40">
                {t('commandCentre.depositedToWallet', { amount: estimatedOut, symbol: destSymbol })}
              </p>
              {depositStatus?.tx_hash && (
                <button
                  onClick={() => window.open(`https://basescan.org/tx/${depositStatus.tx_hash}`, '_blank')}
                  className="text-xs text-white flex items-center gap-1 hover:underline"
                >
                  {t('commandCentre.viewOnBaseScan')} <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <Button variant="glass" className="w-full rounded-xl mt-2" onClick={() => onOpenChange(false)}>
                {t('commandCentre.done')}
              </Button>
            </div>
          )}

          {/* Step: Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-sm text-white font-medium">{t('commandCentre.depositFailed')}</p>
              <p className="text-xs text-white/40 text-center max-w-[260px]">{errorMsg}</p>
              <Button variant="glass" className="w-full rounded-xl mt-2" onClick={() => setStep('chains')}>
                {t('commandCentre.tryAgain')}
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}