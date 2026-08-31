/**
 * Gated media
 * ===========
 * One paywall for every kind of post. It wraps whatever the card would have
 * rendered — a player, a poster frame, a live video — and stands in front of it
 * while the viewer is not entitled to it, with the sheet that resolves the
 * particular gate behind the tap.
 *
 * The four gates it knows, in the order they are shown:
 *
 * - **Mature** sits outermost. It is a warning, not a lock, and revealing it
 *   falls through to whatever real gate the post has rather than replacing it.
 * - **PPV** — pay once, per post.
 * - **Subscribers** — hold an active subscription to THIS creator. Not a hold
 *   gate: only the creator can grant it.
 * - **Holdings** — own N of a token. Any stranger can satisfy it by buying some.
 *
 * PPV and holdings can both be set on one post; that combination gets its own
 * panel, because unlocking the first still leaves the second.
 *
 * Bundle note: this renders inside eager feed cards, so nothing here may
 * statically import the wallet stack (scripts/check-entry-bundle.mjs fails the
 * build otherwise) — SubscriberGateDrawer pulls in the subscription contracts
 * and is therefore lazy, exactly as the cards load it today.
 */
import { Suspense, lazy, useState } from 'react';
import { Lock, Ticket, Star, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import dehubCoinSmall from '@/assets/dehub-coin.png';
import { MatureContentGate, useMatureGate } from './MatureContentGate';
import { PPVDrawerContent } from './PPVDrawerContent';
import { VerifyUnlockButton } from './VerifyUnlockButton';
import { isTokenUnlocked, markTokenUnlocked } from '@/lib/unlocked-tokens-store';
import {
  isHoldGated,
  isSubscriberGated,
  cheapestSubscriberPlan,
  subscriberPlanPrice,
  type SubscriberPlan,
} from '@/lib/content-gate';
import type { ContentRating } from '@/lib/api/dehub/types';

const SubscriberGateDrawer = lazy(() =>
  import('./SubscriberGateDrawer').then((m) => ({ default: m.SubscriberGateDrawer }))
);

export interface ContentGateInfo {
  /** The post's tokenId — what a PPV payment is recorded against. */
  tokenId: string;
  creatorAddress?: string;
  /** Shown when the creator's plans have no price to name. */
  creatorName?: string;
  isPPV?: boolean;
  ppvPrice?: number;
  ppvCurrency?: string;
  /** The chain a PPV payment settles on. Absent means the post's default. */
  ppvChainId?: number;
  isLocked?: boolean;
  lockedPrice?: number;
  lockedCurrency?: string;
  lockedTokenAddress?: string;
  lockedChainId?: number;
  subscriberPlans?: SubscriberPlan[];
  contentRating?: ContentRating;
  /**
   * The creator, or someone who has already paid or subscribed. Every gate is
   * open to them — a creator who could not watch their own stream would be a
   * bug report within the hour.
   */
  canBypass?: boolean;
}

interface GatedMediaProps {
  gate: ContentGateInfo;
  /** Image blurred behind the gate. A dark panel is used without one. */
  preview?: string;
  className?: string;
  children: React.ReactNode;
}

function formatCompact(num: number): string {
  if (!Number.isFinite(num)) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(num * 100) / 100);
}

export function GatedMedia({ gate, preview, className, children }: GatedMediaProps) {
  const { t } = useTranslation();
  const [showPPVDrawer, setShowPPVDrawer] = useState(false);
  const [showLockedDrawer, setShowLockedDrawer] = useState(false);
  const [showSubDrawer, setShowSubDrawer] = useState(false);
  // An unlock that lands while the card is mounted opens it there and then; the
  // store remembers it across a remount so a scroll away and back does not put
  // the paywall back over content that has been paid for.
  const [locallyUnlocked, setLocallyUnlocked] = useState(false);
  const [locallySubscribed, setLocallySubscribed] = useState(false);

  const matureGate = useMatureGate(gate.contentRating);

  const canBypass = !!gate.canBypass || locallyUnlocked || isTokenUnlocked(gate.tokenId);
  const isPPVLocked = !!gate.isPPV && !canBypass;
  const isHoldingsLocked = isHoldGated(gate.isLocked, gate.lockedPrice) && !canBypass;
  const isSubGated = isSubscriberGated(gate.subscriberPlans, !!gate.canBypass || locallySubscribed);
  const isComboLocked = isPPVLocked && isHoldingsLocked;

  const onUnlocked = () => {
    markTokenUnlocked(gate.tokenId);
    setLocallyUnlocked(true);
  };

  const isGated = matureGate.isGated || isPPVLocked || isHoldingsLocked || isSubGated;

  if (!isGated) return <>{children}</>;

  const cheapestPlanPrice = subscriberPlanPrice(cheapestSubscriberPlan(gate.subscriberPlans));

  /** Every gate is the same tile: blurred poster, glass icon, two lines, one tap. */
  const panel = (
    icon: React.ReactNode,
    heading: string,
    detail: string,
    onOpen: () => void,
  ) => (
    <>
      {preview ? (
        <img src={preview} alt="" aria-hidden className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full bg-zinc-900" />
      )}
      <button
        type="button"
        data-no-navigate
        className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-center px-6"
        onClick={(e) => {
          // Cards navigate on click; opening the sheet must not open the post.
          e.stopPropagation();
          onOpen();
        }}
      >
        <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 mb-3">
          {icon}
        </div>
        <p className="text-white font-semibold text-sm mb-1">{heading}</p>
        <p className="text-white/70 text-xs">{detail}</p>
      </button>
    </>
  );

  return (
    <div className={cn('relative w-full h-full overflow-hidden', className)}>
      {matureGate.isGated ? (
        <MatureContentGate
          preview={preview}
          onReveal={matureGate.reveal}
          className="w-full h-full [&>img]:h-full [&>img]:max-h-none"
        />
      ) : isComboLocked ? (
        panel(
          <div className="flex items-center gap-1">
            <Ticket className="h-5 w-5 text-white" />
            <Lock className="h-5 w-5 text-white" />
          </div>,
          `${t('drawers.unlockFor')} ${formatCompact(Number(gate.ppvPrice))} ${gate.ppvCurrency || 'DHB'}`,
          `Must be holding ${formatCompact(Number(gate.lockedPrice))} ${gate.lockedCurrency || 'DHB'}`,
          () => setShowPPVDrawer(true),
        )
      ) : isPPVLocked ? (
        panel(
          <Ticket className="h-7 w-7 text-white" />,
          t('drawers.ppvTitle'),
          `${t('drawers.unlockFor')} ${formatCompact(Number(gate.ppvPrice))} ${gate.ppvCurrency || 'DHB'}`,
          () => setShowPPVDrawer(true),
        )
      ) : isSubGated ? (
        panel(
          <Star className="h-7 w-7 text-white" />,
          'Subscribers only',
          cheapestPlanPrice !== undefined
            ? `Subscribe from ${formatCompact(cheapestPlanPrice)} DHB`
            : `Subscribe to ${gate.creatorName || 'this creator'}`,
          () => setShowSubDrawer(true),
        )
      ) : (
        panel(
          <Lock className="h-7 w-7 text-white" />,
          'Holdings Required',
          `Must be holding ${formatCompact(Number(gate.lockedPrice))} ${gate.lockedCurrency || 'DHB'}`,
          () => setShowLockedDrawer(true),
        )
      )}

      <Drawer open={showPPVDrawer} onOpenChange={setShowPPVDrawer}>
        <PPVDrawerContent
          tokenId={gate.tokenId}
          price={Number(gate.ppvPrice)}
          currency={gate.ppvCurrency || 'DHB'}
          creatorAddress={gate.creatorAddress}
          chainId={gate.ppvChainId}
          onClose={() => setShowPPVDrawer(false)}
          onUnlocked={onUnlocked}
          formatCompact={formatCompact}
        />
      </Drawer>

      <Drawer open={showLockedDrawer} onOpenChange={setShowLockedDrawer}>
        <DrawerContent glass className="px-4 pb-6">
          <DrawerHeader className="pb-3 relative">
            <DrawerTitle className="text-white text-lg flex items-center gap-2">
              <Lock className="w-5 h-5 text-white" />
              {t('drawers.gatedTitle')}
            </DrawerTitle>
            <button
              onClick={() => setShowLockedDrawer(false)}
              className="absolute top-3 right-0 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </DrawerHeader>
          <div className="flex flex-col gap-4">
            {!!gate.lockedPrice && gate.lockedPrice > 0 && (
              <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
                <span className="text-white text-sm">{t('drawers.mustHoldToView')}</span>
                <div className="flex items-center gap-2">
                  <img src={dehubCoinSmall} alt="" className="w-5 h-5" />
                  <span className="text-white text-lg font-bold">
                    {formatCompact(gate.lockedPrice)} {gate.lockedCurrency || 'DHB'}
                  </span>
                </div>
              </div>
            )}
            <p className="text-center text-white/60 text-sm">{t('drawers.gatedDescription')}</p>
            {!!gate.lockedPrice && gate.lockedPrice > 0 && (
              <VerifyUnlockButton
                requiredAmount={gate.lockedPrice}
                currency={gate.lockedCurrency || 'DHB'}
                tokenAddress={gate.lockedTokenAddress}
                chainId={gate.lockedChainId}
                onUnlocked={() => {
                  setShowLockedDrawer(false);
                  onUnlocked();
                }}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={showSubDrawer} onOpenChange={setShowSubDrawer}>
        <DrawerContent glass className="px-4 pb-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              </div>
            }
          >
            <SubscriberGateDrawer
              creatorAddress={gate.creatorAddress || ''}
              creatorName={gate.creatorName || 'this creator'}
              previewPlans={gate.subscriberPlans}
              onSubscribed={() => {
                setShowSubDrawer(false);
                setLocallySubscribed(true);
              }}
            />
          </Suspense>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
