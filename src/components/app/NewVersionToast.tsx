import { useEffect } from 'react';
import { toast } from 'sonner';
import { startVersionWatch } from '@/lib/version-check';

/**
 * Sonner wraps almost all of its own styling in `:where()`, so a utility class
 * overrides it for free. The two exceptions are the action button and the close
 * button — `[data-sonner-toast][data-styled='true'] [data-button]` and its
 * close-button twin carry real specificity, and a plain class loses to them.
 * Every property those two rules set is therefore overridden with `!` below;
 * anything they leave alone is written unprefixed.
 */

/**
 * Stack the toast rather than letting the text run down the left with the button
 * pushed to the right by `--toast-button-margin-start: auto`. The shared toaster
 * centres its text, and centred text inside a shrink-wrapped column reads as
 * off-centre against the toast's own edges — the row layout was the reason the
 * alignment looked wrong, not the centring.
 */
const TOAST_CLASSES = 'flex-col items-stretch gap-3';

/**
 * Refresh borrows the feed nav's active pill (see feeds/GlassIndicator): the
 * same top-left gradient, hairline border, and the pair of inset highlights —
 * bright along the top edge, faint along the bottom — that give it the raised
 * edge. Heights match too (the nav pill is pinned to 35px).
 */
const ACTION_CLASSES = [
  'w-full !ml-0 !mr-0 !h-9 !px-4 !justify-center',
  '!rounded-xl !border !border-white/30',
  // `background` is shorthand, so sonner's rule clears background-image as well
  // as setting a colour: the gradient needs !important to survive it, and the
  // colour underneath has to be cleared separately or it shows through the
  // semi-transparent stops.
  '!bg-transparent !bg-gradient-to-br !from-white/20 !via-white/10 !to-white/5',
  'backdrop-blur-xl',
  'shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]',
  '!text-sm !font-medium !text-white',
  'hover:!from-white/25 hover:!via-white/15 hover:!to-white/10',
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
          classNames: {
            toast: TOAST_CLASSES,
            actionButton: ACTION_CLASSES,
            closeButton: CLOSE_CLASSES,
          },
          description: (
            <span className="block space-y-1.5">
              <span className="block">
                {version.note || 'Refresh to pick up the latest changes.'}
              </span>
              {version.url ? (
                <a
                  href={version.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-white/60 underline underline-offset-2 transition-colors hover:text-white"
                >
                  What changed
                </a>
              ) : null}
            </span>
          ),
          action: {
            label: 'Refresh',
            // A plain reload is enough to land on the new build: sw.js serves
            // navigations NetworkFirst, so the HTML comes back fresh with live
            // chunk URLs, and the chunks themselves are content-hashed, so
            // nothing cached under an old name can be replayed for them.
            onClick: () => window.location.reload(),
          },
        });
      }),
    []
  );

  return null;
}
