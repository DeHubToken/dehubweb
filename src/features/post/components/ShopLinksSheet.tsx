/**
 * Shop links editor
 * =================
 * The drawer behind the composer's Shop toggle, on both the upload sheet and
 * Go Live. A creator types up to N `{label, url}` rows and they become the
 * link board viewers open from the player.
 *
 * Affiliate links are the point of this surface, so it says so — a creator who
 * cannot tell whether their Amazon tag is welcome will not paste it, and one
 * who pastes it without knowing the rules gets refused at mint with nothing to
 * act on. The server owns the real validation; everything here is there to
 * stop a round-trip that was always going to fail.
 *
 * Edits are held locally and committed on Save, like every other drawer in
 * PostAccessToggles: half-typed URLs must not reach the draft the composer
 * autosaves, or a creator returns to a post carrying a link they abandoned.
 */

import { useEffect, useState } from 'react';
import { Link2, Plus, Trash2, Check, Info } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ShopLink } from '@/lib/api/dehub';

interface ShopLinksSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: ShopLink[];
  onSave: (links: ShopLink[]) => void;
  /** How many rows this creator's badge tier buys. */
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

export function ShopLinksSheet({
  open,
  onOpenChange,
  links,
  onSave,
  allowance,
  tier,
}: ShopLinksSheetProps) {
  const [rows, setRows] = useState<ShopLink[]>(links);

  // Re-seed each time it opens, never while it is open: the composer's own
  // state updates as the draft saves, and re-seeding mid-edit would wipe a row
  // somebody is halfway through typing.
  useEffect(() => {
    if (open) setRows(links.length ? links : [{ label: '', url: '' }]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (index: number, patch: Partial<ShopLink>) =>
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const remove = (index: number) => setRows(current => current.filter((_, i) => i !== index));

  const add = () => setRows(current => [...current, { label: '', url: '' }]);

  // A row with no URL is a row somebody started and abandoned — dropped rather
  // than saved empty. A row with a URL and no label still counts: the server
  // labels it with its host.
  const cleaned = rows
    .map(row => ({ label: row.label.trim(), url: row.url.trim() }))
    .filter(row => row.url.length > 0);

  const firstBadUrl = cleaned.find(row => !looksLikeUrl(row.url));
  const canSave = !firstBadUrl && cleaned.length <= allowance;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[90dvh] flex flex-col overflow-hidden">
        <DrawerHeader className="text-left shrink-0">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Link2 className="w-5 h-5" />
            Shop links
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-3 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-800/30 border border-white/10">
            <Info className="w-4 h-4 text-white/50 shrink-0 mt-0.5" />
            <span className="text-xs text-white/50">
              Affiliate links are welcome — Amazon Associates, referral links, your own store.
              Viewers open these from the Shop button on your post.{' '}
              {tier
                ? `Your ${tier} badge gives you ${allowance}.`
                : `You get ${allowance}. Every badge tier adds one more.`}
            </span>
          </div>

          {rows.map((row, index) => {
            const invalid = row.url.trim().length > 0 && !looksLikeUrl(row.url);
            return (
              <div key={index} className="space-y-2 p-3 rounded-xl border border-white/10 bg-white/[0.02]">
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

          {rows.length < allowance ? (
            <button
              type="button"
              onClick={add}
              className="w-full h-12 rounded-xl border border-dashed border-white/20 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add a link
            </button>
          ) : (
            <p className="text-xs text-white/40 text-center">
              {allowance} of {allowance} used. Stake more DHB for a higher badge and another slot.
            </p>
          )}
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
              onSave(cleaned);
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
