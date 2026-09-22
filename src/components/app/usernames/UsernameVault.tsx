/**
 * Username Vault
 * ==============
 * Every handle this account owns, and what can be done with each one.
 *
 * Owning more than one name is new. It used to be that an account *was* its
 * username — buying one meant giving up the one you had — and the whole point
 * of this screen is that it no longer works that way: a purchase keeps the
 * handle you were wearing, and everything you own can be worn, sold or let go.
 *
 * Three things the UI has to be honest about, because none of them is guessable
 * from a list of names:
 *
 * - **Which one you are actually wearing.** Exactly one handle answers at
 *   `dehub.io/:username`; the rest are owned and parked. That distinction is
 *   the first thing on every row rather than a detail at the end of it.
 * - **That the free one is not really yours.** A name you have never paid for
 *   is released the moment you switch away from it, and someone else can take
 *   it. Said on the row, before the button, not in a toast afterwards.
 * - **That releasing has no undo.** It is behind a confirm, and the confirm
 *   says what happens rather than asking whether you are sure.
 *
 * Rendered in two places — the marketplace's own tab and Settings → Assets —
 * from one component, because two screens that drift apart about what you own
 * is exactly the bug this feature cannot afford.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check, Loader2, Tag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DhbCoin } from '@/components/app/DhbAmount';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  useActivateUsernameHolding,
  useReleaseUsernameHolding,
  useUsernameHoldings,
} from '@/hooks/use-username-market';
import type { UsernameHolding } from '@/lib/api/dehub/username-market';

interface Props {
  /**
   * Where "sell this" should go. The marketplace tab handles it in place; the
   * Settings drawer has no sell form, so it links out instead.
   */
  onSell?: (username: string) => void;
}

export function UsernameVault({ onSell }: Props) {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const { data: held, isLoading } = useUsernameHoldings();
  const [releasing, setReleasing] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-zinc-400">{t('usernames.signInToSeeVault')}</p>
        <Button onClick={() => openLoginModal()}>{t('usernames.signIn')}</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  const names = held || [];
  const owned = names.filter(h => h.acquiredVia !== 'original').length;

  return (
    <div className="space-y-3">
      {/* The rule, once, at the top. Nobody reading a list of two names guesses
          that one of them cost money and the other evaporates. */}
      <p className="text-[11px] text-zinc-500">
        {owned > 0 ? t('usernames.vaultExplainer') : t('usernames.vaultExplainerEmpty')}
      </p>

      {names.map(holding => (
        <VaultRow
          key={holding.username}
          holding={holding}
          onSell={onSell}
          onRelease={() => setReleasing(holding.username)}
        />
      ))}

      <ReleaseDialog username={releasing} onClose={() => setReleasing(null)} />
    </div>
  );
}

function VaultRow({
  holding,
  onSell,
  onRelease,
}: {
  holding: UsernameHolding;
  onSell?: (username: string) => void;
  onRelease: () => void;
}) {
  const { t } = useTranslation();
  const activate = useActivateUsernameHolding();

  const listed = !!holding.listing;
  // The free signup handle. Switching away from it gives it up, so the row says
  // so before offering any button that would.
  const isFree = holding.acquiredVia === 'original';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-bold text-white break-all leading-tight">
            <span className="text-zinc-500">@</span>
            {holding.username}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {holding.active && (
              <span className="inline-flex items-center gap-1 text-white">
                <Check className="w-3 h-3" />
                {t('usernames.vaultInUse')}
                <span className="text-zinc-600 mx-1">·</span>
              </span>
            )}
            {t(
              holding.acquiredVia === 'purchase'
                ? 'usernames.vaultBought'
                : holding.acquiredVia === 'retained'
                  ? 'usernames.vaultKept'
                  : 'usernames.vaultFree',
            )}
          </p>
        </div>

        {listed && (
          <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-white flex items-center gap-1">
            <Tag className="w-3 h-3" />$
            {holding.listing!.priceUsd.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            <span className="text-zinc-400">
              <DhbCoin /> {holding.listing!.priceDhb.toLocaleString()}
            </span>
          </span>
        )}
      </div>

      {isFree && !listed && (
        <p className="text-[11px] text-amber-200/80">{t('usernames.vaultFreeWarning')}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!holding.active && (
          <Button
            size="sm"
            variant="outline"
            disabled={activate.isPending || listed}
            onClick={() => activate.mutate(holding.username)}
            title={listed ? t('usernames.vaultListedCannotWear') : undefined}
          >
            {activate.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {t('usernames.vaultUseThis')}
          </Button>
        )}

        {onSell ? (
          <Button size="sm" variant="outline" onClick={() => onSell(holding.username)}>
            {t(listed ? 'usernames.vaultEditListing' : 'usernames.vaultSell')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/usernames?tab=sell&username=${encodeURIComponent(holding.username)}`}>
              {t(listed ? 'usernames.vaultEditListing' : 'usernames.vaultSell')}
            </Link>
          </Button>
        )}

        {/* Releasing the handle you are wearing would leave the account with no
            name, which is not a state that exists — so the button is not there
            rather than there and failing. */}
        {!holding.active && !isFree && (
          <Button
            size="sm"
            variant="ghost"
            className="text-zinc-400 hover:text-red-300"
            onClick={onRelease}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {t('usernames.vaultRelease')}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReleaseDialog({ username, onClose }: { username: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const release = useReleaseUsernameHolding();

  return (
    <AlertDialog open={!!username} onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('usernames.vaultReleaseTitle', { handle: username || '' })}</AlertDialogTitle>
          <AlertDialogDescription>{t('usernames.vaultReleaseBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('usernames.clear')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={release.isPending}
            onClick={() => {
              if (!username) return;
              release.mutate(username, { onSuccess: onClose });
            }}
          >
            {release.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('usernames.vaultRelease')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
