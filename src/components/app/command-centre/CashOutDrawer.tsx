import { useCallback, useEffect, useState } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Landmark, Loader2, ArrowDownUp, RefreshCw } from 'lucide-react';
import ExternalLink from '@/components/ui/cut-icons/open-externally';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  cashoutHistory, cashoutTone, startCashout, validCashoutAmount,
  type CashoutConfig, type CashoutNetwork, type CashoutOrder,
} from '@/lib/cashout';

interface CashOutDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: CashoutConfig;
}

const TONE_CLASS = {
  done: 'text-emerald-400 bg-emerald-400/10',
  pending: 'text-amber-300 bg-amber-300/10',
  failed: 'text-red-400 bg-red-400/10',
} as const;

export function CashOutDrawer({ open, onOpenChange, config }: CashOutDrawerProps) {
  const { t: _copy } = _useCopy();
  const { walletAddress } = useAuth();
  const navigate = useNavigate();
  const [network, setNetwork] = useState<CashoutNetwork['id']>(config.networks[0]?.id ?? 'base');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [orders, setOrders] = useState<CashoutOrder[] | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const statusLabel = (status: string) => ({
    started: _copy("copy.ecbc89cd37a0", { defaultValue: "Started" }),
    awaiting_crypto: _copy("copy.8a6b7f593d16", { defaultValue: "Waiting for your USDC" }),
    processing: _copy("copy.c8e3e92a62ec", { defaultValue: "Processing" }),
    completed: _copy("copy.feb08d1139ec", { defaultValue: "Paid out" }),
    failed: _copy("copy.031a8f0f659d", { defaultValue: "Failed" }),
    cancelled: _copy("copy.d353a99eb455", { defaultValue: "Cancelled" }),
    expired: _copy("copy.424a2551d356", { defaultValue: "Expired" }),
    refunded: _copy("copy.117f6a7cf037", { defaultValue: "Refunded" }),
  } as Record<string, string>)[status] ?? _copy("copy.c8e3e92a62ec", { defaultValue: "Processing" });

  const loadOrders = useCallback(async () => {
    if (!walletAddress) return;
    setLoadingOrders(true);
    try {
      setOrders(await cashoutHistory());
    } catch {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!open) return;
    setHandoff(null);
    void loadOrders();
  }, [open, loadOrders]);

  const valid = validCashoutAmount(amount, config);

  async function handleContinue() {
    if (!valid || busy) return;
    // Open the tab inside the click so popup blockers allow it; point it at
    // the partner once the session exists.
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const { url } = await startCashout(Number(amount), network);
      if (tab) { tab.opener = null; tab.location.href = url; }
      setHandoff(url);
      setAmount('');
      void loadOrders();
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : _copy("copy.b694a59e2709", { defaultValue: "Could not start cash out." }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass hideHandle={false}>
        <div className="p-5 pb-8 space-y-4 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-white/70" />
            <h3 className="text-white font-semibold text-base">{_copy("copy.f246590c4765", { defaultValue: "Cash out to bank" })}</h3>
          </div>

          <button
            type="button"
            onClick={() => { onOpenChange(false); navigate('/dex'); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-left transition-colors"
          >
            <ArrowDownUp className="w-4 h-4 text-white/60 shrink-0" />
            <div className="flex-1">
              <span className="text-sm text-white">{_copy("copy.da5aa0780a2b", { defaultValue: "Earnings in DHB? Sell for USDC first" })}</span>
              <p className="text-xs text-white/40">{_copy("copy.f058c8af001b", { defaultValue: "Cash out pays out USDC. Open the exchange to convert." })}</p>
            </div>
          </button>

          {handoff ? (
            <div className="space-y-3 p-4 rounded-xl bg-white/[0.06] border border-white/10">
              <p className="text-sm text-white">{_copy("copy.18c42c370ed5", { defaultValue: "Finish in the Transak tab" })}</p>
              <p className="text-xs text-white/50">{_copy("copy.aa4eb75e8d1d", { defaultValue: "Verify your identity, add your bank, then send the USDC from this wallet when asked. Your payout shows below once it moves." })}</p>
              <a href={handoff} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-white/80 underline">
                {_copy("copy.0ba4239dac2d", { defaultValue: "Open payout page" })} <ExternalLink size={12} />
              </a>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                {config.networks.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setNetwork(item.id)}
                    className={`flex-1 py-2 rounded-xl text-xs border transition-colors ${network === item.id ? 'bg-white/[0.12] border-white/30 text-white' : 'bg-white/[0.04] border-white/10 text-white/50'}`}
                  >
                    {item.currency} · {item.label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/50" htmlFor="cashout-amount">{_copy("copy.615fc853e956", { defaultValue: "Amount (USDC)" })}</label>
                <Input
                  id="cashout-amount"
                  inputMode="decimal"
                  placeholder="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
                  className="bg-white/[0.06] border-white/10 text-white backdrop-blur-sm"
                />
                <p className="text-xs text-white/40">{_copy("copy.12852de3954f", { defaultValue: "Our partner Transak verifies your identity and pays your bank. Fees and the exact payout are shown before you confirm. Minimum {{min}} USDC.", min: config.min })}</p>
              </div>
              <Button variant="glass" className="w-full rounded-xl" disabled={!valid || busy || !walletAddress} onClick={() => void handleContinue()}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Landmark className="w-4 h-4 mr-2" />}
                {_copy("copy.80d2e8599973", { defaultValue: "Continue to payout" })}
              </Button>
            </>
          )}

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-white/40">{_copy("copy.c3871a7f650d", { defaultValue: "Cash-out history" })}</span>
              <button type="button" onClick={() => void loadOrders()} aria-label={_copy("copy.0e9161011702", { defaultValue: "Refresh" })} className="text-white/40 hover:text-white/70">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {orders === null ? (
              <Loader2 className="w-4 h-4 animate-spin text-white/40" />
            ) : orders.length === 0 ? (
              <p className="text-xs text-white/40">{_copy("copy.222abf21e2c9", { defaultValue: "No cash-outs yet." })}</p>
            ) : orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/10">
                <div>
                  <p className="text-sm text-white">
                    {Number(order.crypto_amount).toLocaleString()} {order.crypto_currency}
                    {order.fiat_amount && order.fiat_currency ? <span className="text-white/50"> → {Number(order.fiat_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {order.fiat_currency}</span> : null}
                  </p>
                  <p className="text-[11px] text-white/40">
                    {new Date(order.created_at).toLocaleDateString()}{order.partner_order_id ? ` · ${order.partner_order_id.slice(0, 8)}` : ''}
                  </p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${TONE_CLASS[cashoutTone(order.status)]}`}>
                  {statusLabel(order.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
