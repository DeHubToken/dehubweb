import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Copy, Check, Loader2, Globe, ExternalLink, AlertTriangle, ChevronRight } from 'lucide-react';
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

interface CrossChainDepositDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target token symbol to receive (ETH, USDC, BTC, USDT). Defaults to ETH. */
  destinationSymbol?: string;
}

type Step = 'chains' | 'amount' | 'deposit' | 'success' | 'error';

export function CrossChainDepositDrawer({ open, onOpenChange, destinationSymbol }: CrossChainDepositDrawerProps) {
  const { walletAddress } = useAuth();
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

  // Reset on open
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
      // Convert amount to smallest unit
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

  // Debounced quote
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
          toast.success('Cross-chain deposit completed! ETH received on Base.');
        } else if (status.status === 'FAILED' || status.status === 'EXPIRED') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatusPolling(false);
          setErrorMsg(status.status === 'EXPIRED' ? 'Deposit expired. Please try again.' : 'Deposit failed.');
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
    toast.success('Deposit address copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const estimatedOut = quote?.amount_out
    ? (parseInt(quote.amount_out) / Math.pow(10, dest.decimals)).toLocaleString(undefined, { maximumFractionDigits: dest.decimals <= 8 ? dest.decimals : 6 })
    : null;
  const destSymbol = destinationSymbol || 'ETH';

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
                {step === 'chains' && 'Deposit from Any Chain'}
                {step === 'amount' && `Send ${selectedToken?.symbol}`}
                {step === 'deposit' && 'Send to Deposit Address'}
                {step === 'success' && 'Deposit Complete!'}
                {step === 'error' && 'Deposit Failed'}
              </h3>
              {step === 'chains' && (
                <p className="text-xs text-white/40">Send crypto from any chain → receive ETH on Base</p>
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
                      <span className="text-lg w-7 text-center">{token.icon}</span>
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
                <span className="text-lg">{selectedToken.icon}</span>
                <span>{selectedToken.symbol} on {selectedChain.name} → ETH on Base</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-white/50">{selectedToken.symbol} Amount</label>
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
                  <span className="text-white/50">Estimated ETH received</span>
                  {quoteLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-white/40 animate-spin" />
                  ) : estimatedOut ? (
                    <span className="text-white font-mono">{estimatedOut} ETH</span>
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
                Get Deposit Address
              </Button>
            </>
          )}

          {/* Step: Deposit Address */}
          {step === 'deposit' && quote && selectedToken && selectedChain && (
            <>
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
                <p className="text-xs text-white/50 text-center">
                  Send exactly <span className="text-white font-mono font-medium">{amount} {selectedToken.symbol}</span> on <span className="text-white">{selectedChain.name}</span> to:
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
                  {copied ? 'Copied!' : 'Copy Address'}
                </Button>
              </div>

              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Status</span>
                  <span className="flex items-center gap-1.5">
                    {statusPolling && <Loader2 className="w-3 h-3 text-white/40 animate-spin" />}
                    <span className="text-white/70">
                      {depositStatus?.status === 'EXECUTING' ? 'Processing…' : 'Waiting for deposit…'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">You'll receive</span>
                  <span className="text-white font-mono">{estimatedOut} ETH</span>
                </div>
              </div>

              <p className="text-[10px] text-white/30 text-center">
                The deposit address expires in ~10 minutes. Send the exact amount on the correct chain.
              </p>
            </>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm text-white font-medium">ETH Received!</p>
              <p className="text-xs text-white/40">
                {estimatedOut} ETH deposited to your Base wallet
              </p>
              {depositStatus?.tx_hash && (
                <button
                  onClick={() => window.open(`https://basescan.org/tx/${depositStatus.tx_hash}`, '_blank')}
                  className="text-xs text-blue-400 flex items-center gap-1 hover:underline"
                >
                  View on BaseScan <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <Button variant="glass" className="w-full rounded-xl mt-2" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          )}

          {/* Step: Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-sm text-white font-medium">Deposit Failed</p>
              <p className="text-xs text-white/40 text-center max-w-[260px]">{errorMsg}</p>
              <Button variant="glass" className="w-full rounded-xl mt-2" onClick={() => setStep('chains')}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
