/**
 * BillingTab
 * ==========
 * Advertiser wallet: prepaid USD balance (funded by verified on-chain DHB
 * transfers), lifetime totals, DHB top-up entry point, a manual
 * "credit a transaction" recovery input, and the full payment ledger.
 */

import { useState } from 'react';
import { Wallet, Plus, ArrowDownToLine, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdAccount, useAdPayments, useTopUpCredit } from '@/hooks/use-ads';
import { AdTopUpModal } from '@/components/app/ads/AdTopUpModal';
import { formatCompact, formatUsd } from '@/lib/ads/povr';

const EXPLORERS: Record<string, string> = {
  Base: 'https://basescan.org/tx/',
  BNB: 'https://bscscan.com/tx/',
};

export function BillingTab() {
  const { data: account } = useAdAccount();
  const { data: payments = [], isLoading } = useAdPayments();
  const topUp = useTopUpCredit();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [manualHash, setManualHash] = useState('');

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Wallet className="w-3.5 h-3.5" /> Ads balance
            </div>
            <p className="text-3xl font-bold text-foreground">{formatUsd(account?.balance_usd)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Deposited {formatUsd(account?.total_deposited_usd)} · Spent {formatUsd(account?.total_spent_usd)}
            </p>
          </div>
          <Button variant="glass" onClick={() => setTopUpOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Top up with DHB
          </Button>
        </div>
      </div>

      {/* Manual credit recovery */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
        <p className="text-sm font-semibold text-foreground mb-1">Credit a transaction</p>
        <p className="text-xs text-muted-foreground mb-3">
          Sent DHB to the ads treasury but it didn't credit? Paste the transaction hash — we verify it on-chain.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="0x… transaction hash"
            value={manualHash}
            onChange={(e) => setManualHash(e.target.value)}
            className="font-mono text-xs"
          />
          <Button
            variant="glass"
            disabled={!/^0x[a-fA-F0-9]{64}$/.test(manualHash.trim()) || topUp.isPending}
            onClick={() => topUp.mutate(manualHash.trim(), { onSuccess: () => setManualHash('') })}
          >
            {topUp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Payment history */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
        <p className="text-sm font-semibold text-foreground mb-3">Payment history</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No top-ups yet.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">+{formatUsd(p.usd_value)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCompact(Number(p.dhb_amount))} DHB · {p.chain} · {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <a
                  href={`${EXPLORERS[p.chain] ?? EXPLORERS.Base}${p.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="View transaction"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdTopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} />
    </div>
  );
}
