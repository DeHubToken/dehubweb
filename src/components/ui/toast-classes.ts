/**
 * The one toast look, shared by every toast in the app.
 *
 * These started life inside NewVersionToast, which was the only toast anyone
 * had actually styled: a stacked glass card with a bold heading, left-aligned
 * text and pill buttons. Everything else fell through to sonner's defaults —
 * centred text with a type icon bolted onto the leading edge, so an error read
 * as a floating exclamation mark beside a centred sentence. Applying them in
 * components/ui/sonner makes the good one the default and that mismatch
 * impossible.
 *
 * Sonner wraps almost all of its own styling in `:where()`, so a utility class
 * overrides it for free. The two exceptions are the close button and the
 * action/cancel buttons, which set real-specificity rules — see CLOSE_CLASSES
 * and SLOT_BUTTON_CLASSES for exactly which properties take `!` and why.
 */

/**
 * Stack the toast rather than letting the text run down the left with the
 * button pushed to the right by `--toast-button-margin-start: auto`.
 *
 * `text-start`, not the centring this used to carry: centred text inside a
 * shrink-wrapped column reads as off-centre against the toast's own edges, and
 * a two-line description centred under a heading has no edge to track at all.
 *
 * No gap: the close button is absolutely positioned and the icon is hidden, so
 * the content div is normally the toast's only in-flow child — the action slot
 * carries its own top margin for the case where it is not.
 */
export const TOAST_CLASSES = 'flex-col items-stretch text-start';

/**
 * The heading has to read as a heading against a 13px/400 description, so it is
 * sized and weighted well clear of it. Sonner's own `[data-title]` rule is
 * `:where()`-wrapped, so no `!` is needed to beat its 500 weight.
 */
export const TITLE_CLASSES = 'text-base font-bold leading-tight';

/**
 * Sonner's title/description gap is 2px, tuned for a 13px title. Under a 16px
 * bold one the description reads as crowding it.
 */
export const CONTENT_CLASSES = 'gap-1.5';

/** Matches the title's alignment; sonner's own colour rule is `:where()`-wrapped. */
export const DESCRIPTION_CLASSES = 'text-white/70';

/**
 * Sonner draws a type icon — the exclamation disc on `toast.error` and
 * `toast.warning`, a tick on `toast.success` — in a leading slot, sized and
 * coloured for its own default toast rather than for glass. It is dropped: the
 * copy already says which kind of thing happened, and with the toast stacked
 * the icon was left hanging beside a paragraph it had no baseline to sit on.
 *
 * `toast.loading` keeps it, because there the slot holds the spinner and it is
 * the only thing on screen saying the work is still running. Sonner puts
 * `data-type` on the toast itself, which is the `group` here, so the loading
 * case is selected from the parent.
 */
export const ICON_CLASSES = 'hidden group-[[data-type=loading]]:flex';

/**
 * Both buttons borrow the feed nav's active pill (see feeds/GlassIndicator):
 * the same top-left gradient, hairline border, and the pair of inset
 * highlights — bright along the top edge, faint along the bottom — that give it
 * the raised edge. Heights match too (the nav pill is pinned to 35px).
 *
 * This is the list for a button written inside a toast's own description, where
 * sonner has no rules to fight. For sonner's `action`/`cancel` slots, use
 * SLOT_BUTTON_CLASSES.
 */
export const BUTTON_CLASSES = [
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
 * The same pill for sonner's `action` and `cancel` slots.
 *
 * `[data-button]` is the one part of sonner's toast body styled at real
 * specificity: it sets height, padding, border-radius, background, colour,
 * border, font-size and font-weight itself, so each of those has to be forced.
 * The purely additive properties — the gradient stops, the shadow, the flex
 * centring, the blur, the press transform — are not on that list and go in
 * plain.
 *
 * `!ms-0` releases `--toast-button-margin-start: auto`, which in a stacked
 * toast would otherwise shove a shrink-wrapped button to the trailing edge, and
 * `basis-full` keeps each on its own row when both slots are rendered.
 */
export const SLOT_BUTTON_CLASSES = [
  'inline-flex !ms-0 mt-2 !h-9 w-full basis-full items-center justify-center !px-4',
  '!rounded-xl !border !border-white/30',
  '!bg-gradient-to-br from-white/20 via-white/10 to-white/5',
  'backdrop-blur-xl',
  'shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]',
  '!text-sm !font-medium !text-white no-underline',
  'hover:from-white/25 hover:via-white/15 hover:to-white/10',
  'transition-transform duration-150 active:translate-y-px',
].join(' ');

/**
 * Sonner hangs the close button off the toast's top-LEFT corner — `left: 0`
 * plus `translate(-35%, -35%)`, so most of it sits outside the toast entirely —
 * and paints it `var(--normal-bg)` on `var(--normal-text)`, a grey disc with an
 * X the same grey as the disc. Both are undone here: it moves inside, into the
 * top-right corner, and loses the disc so only the X is left.
 *
 * Geometry needs no `!`. Sonner's `left`/`top`/`transform`/`height`/`width`/
 * `border` all come from a `:where()`-wrapped rule with zero specificity, so
 * plain utilities beat them: `start-auto` releases the inline-start offset that
 * `end-2` would otherwise lose to — an absolutely positioned box with a
 * definite width and both insets set is over-constrained, and the end inset is
 * the one that gets dropped — and `transform-none` drops the translate that
 * pushed it out past the corner.
 *
 * Logical insets, not `left`/`right`: sonner mirrors this button for RTL
 * through its own `--toast-close-button-start`/`-end` pair, and hard-coding
 * `right` would have stranded it on the trailing edge in the eighteen RTL
 * languages the app ships (Arabic and its dialects, Hebrew, Persian, Urdu,
 * Pashto, Sindhi, Saraiki, Uyghur, Deccan, Sadri — see i18n's RTL_LANGUAGES).
 * `end-2` puts it top-right in English and top-left in Arabic, which is the
 * corner a reader of either one looks in.
 *
 * The corner is measured off the content, not the border. The button is 28px
 * with sonner's 12px X centred in it, so an 8px offset lands the X's own corner
 * exactly on the toast's 16px padding — flush with the edge the title and
 * buttons line up against. The box stays 28px rather than sonner's 20px purely
 * for the tap target; with no disc, nothing about it is visible.
 *
 * Only `background` and `color` need `!`: they are the theme-rule properties
 * this still sets — the widest being `[data-sonner-toaster][data-theme='dark']
 * [data-sonner-toast] [data-close-button]`. `border-color` is on that list too
 * but is not fought — `border-0` takes the width to zero, which leaves nothing
 * for a colour to paint. Checked in both themes, since the toaster reads
 * `system` and can resolve either way.
 *
 * `transition-colors` replaces a transition list covering background and
 * border-colour, neither of which changes any more, with one for the colour
 * that does. The focus ring is sonner's own 2px, recoloured — its black-at-20%
 * is invisible on the glass, and with the disc gone it is the only affordance
 * left.
 */
export const CLOSE_CLASSES = [
  'start-auto end-2 top-2 h-7 w-7 transform-none border-0',
  '!bg-transparent !text-white/60',
  'transition-colors hover:!bg-transparent hover:!text-white',
  'focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.6)]',
].join(' ');
