import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { startVersionWatch } from '@/lib/version-check';

/**
 * Sonner wraps almost all of its own styling in `:where()`, so a utility class
 * overrides it for free. The exception is the close button — its rule carries
 * real specificity and a plain class loses to it, so every property it sets is
 * overridden with `!` below.
 *
 * The toast's own buttons dodge that fight entirely by living inside the
 * description rather than in sonner's `action`/`cancel` slots; see BUTTON_CLASSES.
 */

/**
 * Stack the toast rather than letting the text run down the left with the button
 * pushed to the right by `--toast-button-margin-start: auto`. The shared toaster
 * centres its text, and centred text inside a shrink-wrapped column reads as
 * off-centre against the toast's own edges — the row layout was the reason the
 * alignment looked wrong, not the centring.
 *
 * No gap: the close button is absolutely positioned, so the content div is the
 * toast's only in-flow child and there is nothing for one to sit between.
 */
const TOAST_CLASSES = 'flex-col items-stretch';

/**
 * The heading has to read as a heading against a 13px/400 description, so it is
 * sized and weighted well clear of it. Sonner's own `[data-title]` rule is
 * `:where()`-wrapped, so no `!` is needed to beat its 500 weight.
 */
const TITLE_CLASSES = 'text-base font-bold leading-tight';

/**
 * Sonner's title/description gap is 2px, tuned for a 13px title. Under a 16px
 * bold one the description reads as crowding it.
 */
const CONTENT_CLASSES = 'gap-1.5';

/**
 * Both buttons borrow the feed nav's active pill (see feeds/GlassIndicator): the
 * same top-left gradient, hairline border, and the pair of inset highlights —
 * bright along the top edge, faint along the bottom — that give it the raised
 * edge. Heights match too (the nav pill is pinned to 35px).
 *
 * One list, shared by Refresh and What changed, is what makes them identical.
 * That is also why neither is sonner's `action`: `[data-button]` sets height,
 * padding, radius, background and colour at real specificity — it forced every
 * one of those to `!important` — and sonner always renders `cancel` BEFORE
 * `action`, so the two slots cannot produce Refresh-then-What-changed anyway.
 */
const BUTTON_CLASSES = [
  'inline-flex h-9 w-full items-center justify-center px-4',
  'rounded-xl border border-white/30',
  'bg-gradient-to-br from-white/20 via-white/10 to-white/5',
  'backdrop-blur-xl',
  'shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]',
  // `no-underline` and the explicit colour are for the anchor: it is a link, so
  // it would otherwise pick up underline and the description's white/70.
  'text-sm font-medium text-white no-underline',
  'hover:from-white/25 hover:via-white/15 hover:to-white/10',
  // Gradient stops are custom properties inside a linear-gradient and do not
  // interpolate, so only the press has anything to animate.
  'transition-transform duration-150 active:translate-y-px',
].join(' ');

/**
 * Sonner paints the close button `var(--normal-bg)` on `var(--normal-text)`,
 * which against the glass toast is a grey disc with an X the same grey as the
 * disc. Give it the toast's own palette so the icon is actually visible.
 */
const CLOSE_CLASSES = [
  '!bg-white/10 !border-white/20 !text-white',
  'hover:!bg-white/20 hover:!border-white/30',
].join(' ');

/**
 * Renders nothing; watches for a newer deploy and raises a persistent toast
 * offering a refresh, with a one-line summary of what shipped and a link to the
 * PR that shipped it. See lib/version-check for the polling rules.
 *
 * Mounted once at the App root, next to <Sonner />.
 */
export function NewVersionToast() {
  const isMobile = useIsMobile();
  // The watch is armed once and fires minutes later, so the callback cannot
  // close over `isMobile` — by then the render that produced it is long gone.
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  useEffect(
    () =>
      startVersionWatch((version) => {
        // toast.message, not the bare toast(): only the named methods are
        // patched by lib/toast-i18n-interceptor, so this is the callable that
        // gets translated once a `toasts.new_version_available` key exists.
        toast.message('New version available', {
          // Never auto-dismiss. The whole point is that it is still there when
          // the user next looks at the tab.
          duration: Infinity,
          closeButton: true,
          // Desktop parks it out of the way in the bottom-right instead of over
          // the top of the page. Mobile keeps the shared toaster's placement,
          // where a corner is most of the width anyway. Sonner builds its list
          // of positions from the toasts themselves, so this one opting out does
          // not move any other toast.
          position: isMobileRef.current ? undefined : 'bottom-right',
          classNames: {
            toast: TOAST_CLASSES,
            title: TITLE_CLASSES,
            content: CONTENT_CLASSES,
            closeButton: CLOSE_CLASSES,
          },
          description: (
            <span className="flex flex-col gap-3">
              <span>{version.note || 'Refresh to pick up the latest changes.'}</span>
              <span className="flex flex-col gap-2">
                <button
                  type="button"
                  className={BUTTON_CLASSES}
                  // A plain reload is enough to land on the new build: sw.js
                  // serves navigations NetworkFirst, so the HTML comes back
                  // fresh with live chunk URLs, and the chunks themselves are
                  // content-hashed, so nothing cached under an old name can be
                  // replayed for them.
                  onClick={() => window.location.reload()}
                >
                  Refresh
                </button>
                {version.url ? (
                  <a
                    href={version.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={BUTTON_CLASSES}
                  >
                    What changed
                  </a>
                ) : null}
              </span>
            </span>
          ),
        });
      }),
    []
  );

  return null;
}
