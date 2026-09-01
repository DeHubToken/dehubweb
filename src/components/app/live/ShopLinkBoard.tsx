/**
 * Shop link board
 * ===============
 * The creator's affiliate and shop links, behind a Shop button on the player.
 * Tapping the button slides a board up from the bottom of the video; each row
 * is a labelled link that opens in a new tab.
 *
 * **It lives inside the player container, not in a portal.** A `Drawer` would
 * be dismissed by fullscreen and would cover the whole screen on a phone for
 * three links; positioning it against the player means it survives fullscreen
 * (the same reason `StreamShopPinnedCard` sits there) and keeps the stream
 * visible above it, which is the point — nobody wants to leave the broadcast
 * to look at a link.
 *
 * **Every link is disclosed as an affiliate link and marked as one.** The
 * `rel` carries `sponsored nofollow noopener noreferrer`: `sponsored` is what
 * search engines expect on a paid link, and the visible line above the rows is
 * the disclosure a creator is required to make. Neither is optional and
 * neither is the creator's job to remember, so the surface does both.
 *
 * Renders nothing at all when the post has no board, so it is safe to drop
 * into any player.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingBag, ExternalLink, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShopLink } from '@/lib/api/dehub';

interface ShopLinkBoardProps {
  links?: ShopLink[] | null;
  /**
   * `overlay` floats the button over a player and slides the board up from the
   * bottom of it — the live and video surfaces, where the board must not take
   * the viewer away from what is playing.
   *
   * `inline` is for a post with no player of its own (an image, a text post):
   * the button sits in the flow and the board expands beneath it.
   */
  variant?: 'overlay' | 'inline';
  /**
   * Where the button sits. The overlay default clears the control bar on the
   * right; pass a class to move it when a surface already has something there.
   */
  className?: string;
}

/** `https://www.amazon.co.uk/dp/x?tag=…` reads as `amazon.co.uk` under the label. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function ShopLinkBoard({ links, variant = 'overlay', className }: ShopLinkBoardProps) {
  const [open, setOpen] = useState(false);
  const overlay = variant === 'overlay';

  // A board left open while the viewer scrolls to the next post would reopen
  // on somebody else's links, since the card is recycled.
  useEffect(() => {
    setOpen(false);
  }, [links]);

  if (!links?.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-1.5 px-3 h-9 rounded-full',
          'bg-black/50 backdrop-blur-2xl border border-white/15 text-white text-sm font-medium',
          'hover:bg-black/70 transition-colors',
          overlay ? 'absolute z-20 left-3 bottom-3' : 'mt-2',
          className,
        )}
      >
        <ShoppingBag className="w-4 h-4" />
        Shop
        <span className="text-white/50 text-xs">{links.length}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={overlay ? { y: '100%', opacity: 0 } : { height: 0, opacity: 0 }}
            animate={overlay ? { y: 0, opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={overlay ? { y: '100%', opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className={cn(
              'overflow-hidden bg-black/60 backdrop-blur-2xl border-white/10',
              overlay
                ? 'absolute z-30 inset-x-0 bottom-0 max-h-[70%] overflow-y-auto overscroll-contain border-t rounded-t-2xl'
                : 'mt-2 border rounded-2xl',
            )}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2 text-white text-sm font-medium">
                <ShoppingBag className="w-4 h-4" />
                Shop
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 -mr-1.5 text-white/60 hover:text-white transition-colors"
                aria-label="Close shop links"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="px-4 pb-2 text-[11px] leading-snug text-white/45">
              Affiliate links — the creator may earn a commission on anything you buy. Prices are
              the same for you.
            </p>

            <div className="px-3 pb-4 space-y-1.5">
              {links.map((link, index) => (
                <a
                  key={`${link.url}-${index}`}
                  href={link.url}
                  target="_blank"
                  rel="sponsored nofollow noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{link.label}</p>
                    <p className="text-[11px] text-white/40 truncate">{hostOf(link.url)}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-white/40 shrink-0" />
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
