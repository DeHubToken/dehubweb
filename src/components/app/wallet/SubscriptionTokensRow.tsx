import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, ChartNoAxesColumn, Lock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useSubscriptionCredits } from '@/hooks/use-subscription-credits';
import dehubCoin from '@/assets/dehub-coin.png';

/**
 * Subscription tokens in the wallet list. The balance is a dollar amount
 * shown as tokens at today's price, so the count moves with the price and the
 * value does not. They can only be spent on subscriptions, so every way out
 * of the wallet says so.
 */
export function SubscriptionTokensRow() {
  const { t } = useTranslation();
  const { data: credits } = useSubscriptionCredits();
  const [open, setOpen] = useState(false);

  if (!credits || credits.tokens <= 0) return null;

  const tokens = credits.tokens.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const usd = credits.usd.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  const refuse = () => toast.info(t('credits.untradableTokens'));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition-colors text-left"
      >
        <div className="relative shrink-0">
          <img src={dehubCoin} alt="" className="w-9 h-9 rounded-full" />
          <Lock className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 p-0.5 rounded-full bg-zinc-900 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{t('credits.subscriptionTokens')}</p>
          <p className="text-xs text-zinc-500 truncate">{t('credits.subscriptionTokensOnly')}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-medium text-white">{tokens}</p>
          <p className="text-xs text-zinc-500">{usd}</p>
        </div>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="bg-zinc-950 border-zinc-800">
          <DrawerHeader>
            <DrawerTitle className="text-white">{t('credits.subscriptionTokens')}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <p className="text-2xl font-bold text-white">{t('credits.tokenAmount', { amount: tokens })}</p>
              <p className="mt-1 text-sm text-zinc-400">{t('credits.earningsWorth', { amount: usd })}</p>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">{t('credits.subscriptionTokensValueNote')}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={refuse}>
                <Send className="w-5 h-5" />
                <span className="text-xs">{t('wallet.send')}</span>
              </Button>
              <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={refuse}>
                <ChartNoAxesColumn className="w-5 h-5" />
                <span className="text-xs">{t('wallet.trade')}</span>
              </Button>
              <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={refuse}>
                <ArrowDownToLine className="w-5 h-5 rotate-180" />
                <span className="text-xs">{t('credits.withdraw')}</span>
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
