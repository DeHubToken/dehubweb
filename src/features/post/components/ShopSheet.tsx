/**
 * Shop editor
 * ===========
 * The drawer behind the composer's Shop toggle, on both the upload sheet and
 * Go Live. Two ways to fill the board:
 *
 *  - **From your shop** — listings the creator already sells on DeHub. These
 *    check out in-app and the money lands in their wallet, so they are offered
 *    first and listed first.
 *  - **Links** — affiliate and external links, which leave the app.
 *
 * The badge allowance sizes the board as a whole rather than each half. A
 * creator choosing three of their own listings over three Amazon links has
 * made the choice we would want them to make; charging them a separate budget
 * for it would be an odd thing to do.
 *
 * Affiliate links are welcome here and the copy says so — a creator who cannot
 * tell whether their Amazon tag is allowed will not paste it, and one who
 * pastes it without knowing the rules gets refused at mint with nothing to act
 * on. The server owns the real validation; everything here exists to avoid a
 * round-trip that was always going to fail.
 *
 * Edits are held locally and committed on Save, like every other drawer in
 * PostAccessToggles: half-typed URLs must not reach the draft the composer
 * autosaves, or a creator returns to a post carrying a link they abandoned.
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Check, Info, ImageIcon, Store, Loader2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMyListings } from '@/hooks/use-stores';
import type { ShopLink } from '@/lib/api/dehub';

export interface ShopBoardDraft {
  links: ShopLink[];
  /** Ids of the creator's own store listings to put on the board. */
  listingIds: string[];
}

interface ShopSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ShopBoardDraft;
  onSave: (value: ShopBoardDraft) => void;
  /** How many rows this creator's badge tier buys, across both kinds. */
  allowance: number;
  /** The tier that bought it, for saying where the number came from. */
  tier?: string | null;
}

const inputClass =
  'w-full h-12 px-4 text-base bg-zinc-800/50 border border-white/20 rounded-xl text-white placeholder:text-zinc-500 outline-none focus:border-white/50';

/**
 * Is this something the server will accept?
 *
 * Deliberately loose. A scheme-less paste (`amazon.co.uk/dp/…`) is what people
 * actually copy and the server promotes it, so accepting it here keeps the two
 * sides agreeing. The strict rules — blocked hosts, lookalike domains — are
 * only knowable server-side and are reported when they fire.
 */
export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(javascript|data|file|blob):/i.test(trimmed)) return false;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.includes('.');
  } catch {
    return false;
  }
}

export function ShopSheet({ open, onOpenChange, value, onSave, allowance, tier }: ShopSheetProps) {
  const [rows, setRows] = useState<ShopLink[]>(value.links);
  const [listingIds, setListingIds] = useState<string[]>(value.listingIds);

  // `any` matches how the rest of the stores surfaces type listing rows: the
  // generated Row types `images` as Json, which fights every consumer.
  const { data: listings = [], isLoading: listingsLoading } = useMyListings();
  const sellable = useMemo(
    () => (listings as any[]).filter(l => l.status === 'active'),
    [listings],
  );

  // Re-seed each time it opens, never while it is open: the composer's own
  // state updates as the draft saves, and re-seeding mid-edit would wipe a row
  // somebody is halfway through typing.
  useEffect(() => {
    if (!open) return;
    setRows(value.links);
    setListingIds(value.listingIds);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (index: number, patch: Partial<ShopLink>) =>
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const remove = (index: number) => setRows(current => current.filter((_, i) => i !== index));

  // A row with no URL is a row somebody started and abandoned — dropped rather
  // than saved empty. A row with a URL and no label still counts: the server
  // labels it with its host.
  const cleanedLinks = rows
    .map(row => ({ label: row.label.trim(), url: row.url.trim() }))
    .filter(row => row.url.length > 0);

  const used = cleanedLinks.length + listingIds.length;
  const remaining = allowance - used;
  const firstBadUrl = cleanedLinks.find(row => !looksLikeUrl(row.url));
  const canSave = !firstBadUrl && used <= allowance;

  const toggleListing = (id: string) =>
    setListingIds(current =>
      current.includes(id)
        ? current.filter(x => x !== id)
        : // Silently refusing a tap reads as a broken checkbox, so the guard is
          // on the row being disabled rather than here.
          [...current, id],
    );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[90dvh] flex flex-col overflow-hidden">
        <DrawerHeader className="text-left shrink-0">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Store className="w-5 h-5" />
            Shop
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-800/30 border border-white/10">
            <Info className="w-4 h-4 text-white/50 shrink-0 mt-0.5" />
            <span className="text-xs text-white/50">
              Put your own listings or affiliate links on this post — viewers open them from the
              Shop button.{' '}
              {tier
                ? `Your ${tier} badge gives you ${allowance} in total.`
                : `You get ${allowance} in total. Every badge tier adds one more.`}
            </span>
          </div>

          {/* Own listings first: they check out in-app and the money is the
              creator's, which is worth more to both sides than a referral. */}
          <div className="space-y-2">
            <p className="text-sm text-white/70">From your shop</p>

            {listingsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
              </div>
            ) : sellable.length === 0 ? (
              <p className="text-xs text-white/40 py-2">
                Nothing on sale in your shop yet. Anything you list there can go on a post.
              </p>
            ) : (
              sellable.map((listing: any) => {
                const picked = listingIds.includes(listing.id);
                const full = !picked && remaining <= 0;
                return (
                  <button
                    key={listing.id}
                    type="button"
                    disabled={full}
                    onClick={() => toggleListing(listing.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 rounded-xl border transition-colors text-left',
                      picked
                        ? 'bg-white/15 border-white/25'
                        : 'bg-white/[0.02] border-white/10 hover:bg-white/5',
                      full && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
                      {listing.images?.[0] ? (
                        <img
                          src={listing.images[0]}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-zinc-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{listing.title}</p>
                      <p className="text-xs text-white/40">${Number(listing.price).toLocaleString()}</p>
                    </div>
                    {picked && <Check className="w-4 h-4 text-white shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm text-white/70">Links</p>
            <p className="text-xs text-white/40 -mt-1">
              Affiliate links are welcome — Amazon Associates, referral links, anywhere you sell.
            </p>

            {rows.map((row, index) => {
              const invalid = row.url.trim().length > 0 && !looksLikeUrl(row.url);
              return (
                <div
                  key={index}
                  className="space-y-2 p-3 rounded-xl border border-white/10 bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40">Link {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="p-1.5 -mr-1.5 text-white/40 hover:text-red-400 transition-colors"
                      aria-label={`Remove link ${index + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={row.label}
                    onChange={e => update(index, { label: e.target.value.slice(0, 40) })}
                    placeholder="What it is — e.g. My mic"
                    className={inputClass}
                  />
                  <input
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={row.url}
                    onChange={e => update(index, { url: e.target.value })}
                    placeholder="https://amzn.to/..."
                    className={cn(inputClass, invalid && 'border-red-500/60 focus:border-red-500')}
                  />
                  {invalid && (
                    <p className="text-xs text-red-400">That does not look like a web address.</p>
                  )}
                </div>
              );
            })}

            {remaining > 0 ? (
              <button
                type="button"
                onClick={() => setRows(current => [...current, { label: '', url: '' }])}
                className="w-full h-12 rounded-xl border border-dashed border-white/20 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add a link
              </button>
            ) : (
              <p className="text-xs text-white/40 text-center py-1">
                {allowance} of {allowance} used. Stake more DHB for a higher badge and another slot.
              </p>
            )}
          </div>
        </div>

        <DrawerFooter className="flex-row gap-2 shrink-0 border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <Button
            variant="glass"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-xl min-h-[48px] touch-manipulation"
          >
            Cancel
          </Button>
          <Button
            variant="glass"
            disabled={!canSave}
            onClick={() => {
              onSave({ links: cleanedLinks, listingIds });
              onOpenChange(false);
            }}
            className="flex-1 rounded-xl min-h-[48px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4 mr-2" />
            Save
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
