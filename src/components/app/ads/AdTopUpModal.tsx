/**
 * AdTopUpModal
 * ============
 * Dialog chrome around AdTopUpPanel, which holds the whole funding flow (pick
 * an amount → transfer DHB → verify → credit, with a buy-DHB step for wallets
 * that are short). The panel is shared with the campaign wizard, which embeds
 * it directly rather than stacking a second dialog on its own.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { AdTopUpPanel } from '@/components/app/ads/AdTopUpPanel';

interface AdTopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects an amount — what the caller needs in the balance. */
  suggestedUsd?: number;
  /** Balance credited. The caller resumes whatever it was doing. */
  onCredited?: (usdCredited: number) => void;
}

export function AdTopUpModal({ open, onOpenChange, suggestedUsd, onCredited }: AdTopUpModalProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wallet className="w-5 h-5" />
            Top up ads balance
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Pay in DHB — credited in USD at the live price
          </DialogDescription>
        </DialogHeader>

        <AdTopUpPanel
          suggestedUsd={suggestedUsd}
          onBusyChange={setBusy}
          onCancel={() => onOpenChange(false)}
          onCredited={(usd) => {
            onCredited?.(usd);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
