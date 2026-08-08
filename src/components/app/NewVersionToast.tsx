import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import i18n from '@/i18n';
import { supabase } from '@/integrations/supabase/client';
import { autoTranslateEnabled } from '@/lib/auto-translate-setting';
import { startVersionWatch, type BuildVersion } from '@/lib/version-check';

/**
 * Sonner wraps almost all of its own styling in `:where()`, so a utility class
 * overrides it for free. The exception is the close button, and only partly: its
 * geometry comes from a `:where()` rule like everything else, but its theme rules
 * re-set `background`, `border-color` and `color` at real specificity — the
 * widest being `[data-sonner-toaster][data-theme='dark'] [data-sonner-toast]
 * [data-close-button]`. Only properties from those rules take `!` below. See
 * CLOSE_CLASSES.
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
 * Sonner hangs the close button off the toast's top-LEFT corner — `left: 0` plus
 * `translate(-35%, -35%)`, so most of it sits outside the toast entirely — and
 * paints it `var(--normal-bg)` on `var(--normal-text)`, a grey disc with an X the
 * same grey as the disc. Both are undone here: it moves inside, into the
 * top-right corner, and loses the disc so only the X is left.
 *
 * Geometry needs no `!`. Sonner's `left`/`top`/`transform`/`height`/`width`/
 * `border` all come from a `:where()`-wrapped rule with zero specificity, so
 * plain utilities beat them: `start-auto` releases the inline-start offset that
 * `end-2` would otherwise lose to — an absolutely positioned box with a definite
 * width and both insets set is over-constrained, and the end inset is the one
 * that gets dropped — and `transform-none` drops the translate that pushed it
 * out past the corner.
 *
 * Logical insets, not `left`/`right`: sonner mirrors this button for RTL through
 * its own `--toast-close-button-start`/`-end` pair, and hard-coding `right` would
 * have stranded it on the trailing edge in the eighteen RTL languages the app
 * ships (Arabic and its dialects, Hebrew, Persian, Urdu, Pashto, Sindhi,
 * Saraiki, Uyghur, Deccan, Sadri — see i18n's RTL_LANGUAGES). `end-2` puts it
 * top-right in English and top-left in Arabic, which is the corner a reader of
 * either one looks in.
 *
 * The corner is measured off the content, not the border. The button is 28px
 * with sonner's 12px X centred in it, so an 8px offset lands the X's own corner
 * exactly on the toast's 16px padding — flush with the edge the title and
 * buttons line up against. The box stays 28px rather than sonner's 20px purely
 * for the tap target; with no disc, nothing about it is visible.
 *
 * Only `background` and `color` need `!`: they are the theme-rule properties this
 * still sets. `border-color` is on that list too but is not fought — `border-0`
 * takes the width to zero, which leaves nothing for a colour to paint. Checked in
 * both themes, since the toaster reads `system` and can resolve either way.
 *
 * `transition-colors` replaces a transition list covering background and
 * border-colour, neither of which changes any more, with one for the colour that
 * does. The focus ring is sonner's own 2px, recoloured — its black-at-20% is
 * invisible on the glass, and with the disc gone it is the only affordance left.
 */
const CLOSE_CLASSES = [
  'start-auto end-2 top-2 h-7 w-7 transform-none border-0',
  '!bg-transparent !text-white/60',
  'transition-colors hover:!bg-transparent hover:!text-white',
  'focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.6)]',
].join(' ');

/**
 * Ceiling on waiting for the note's translation. Generous — nothing is on screen
 * yet, so the only thing a long wait delays is the toast itself — but not
 * unbounded, because a hung request would otherwise swallow the notification
 * this component exists to deliver.
 */
const NOTE_TRANSLATE_TIMEOUT_MS = 8_000;

/**
 * The deploy note is the merged PR's title, written in English at build time, so
 * alone among the toast's strings it cannot have an i18n key — there is no
 * knowing it before the build that ships it. It goes through the same
 * translate-text function the feed uses (MyMemory, then Gemini, then fal).
 *
 * Awaited before the toast is raised rather than swapped in after: this fires
 * minutes into a session on a one-shot nobody is waiting for, so the round trip
 * costs nothing anyone can perceive, where a late swap would visibly re-type the
 * line under a reader already reading it.
 *
 * At most one call per session — the watch is one-shot and version-check's
 * sessionStorage guard blocks a re-notify — and translate-text keys a shared
 * table by (text, language), so the first reader to see a given deploy in a given
 * language pays for every reader after them. No client cache is worth its weight
 * against one call.
 *
 * Every failure path returns the English note. A prompt to refresh is worth
 * showing untranslated.
 */
async function translateNote(note: string, lang: string): Promise<string> {
  // `sameLanguage` would catch the English case server-side, but not before
  // spending a request to be told what the language tag already said.
  if (!note || lang === 'en' || !autoTranslateEnabled()) return note;

  const request = supabase.functions
    .invoke('translate-text', { body: { text: note, targetLang: lang } })
    .then(({ data, error }) => {
      // The server returns the text untouched when it is already in the target
      // language and says so; treating that as a translation is what put "show
      // original" on unchanged posts across the feed.
      if (error || data?.sameLanguage === true) return note;
      const translated = data?.translatedText;
      return typeof translated === 'string' && translated.trim() ? translated : note;
    })
    .catch(() => note);

  const timeout = new Promise<string>((resolve) => {
    setTimeout(() => resolve(note), NOTE_TRANSLATE_TIMEOUT_MS);
  });

  return Promise.race([request, timeout]);
}

/**
 * Raises the toast, in the reader's language.
 *
 * The title is passed in English on purpose: lib/toast-i18n-interceptor patches
 * `toast.message` and translates the string it is handed via
 * `toasts.new_version_available`, so translating it here would hand the
 * interceptor a translated string to normalise into a key that does not exist.
 * The description is a React element, which that interceptor skips by design, so
 * everything inside it is resolved here instead.
 */
async function showUpdateToast(version: BuildVersion, isMobile: boolean): Promise<void> {
  const note = version.note
    ? await translateNote(version.note, i18n.language)
    : // No note on the manifest, so there is nothing dynamic to translate and
      // the static fallback is already in the reader's language.
      i18n.t('toasts.refresh_to_pick_up_the_latest_changes');

  toast.message('New version available', {
    // Never auto-dismiss. The whole point is that it is still there when the
    // user next looks at the tab.
    duration: Infinity,
    closeButton: true,
    // Desktop parks it out of the way in the bottom-right instead of over the
    // top of the page. Mobile keeps the shared toaster's placement, where a
    // corner is most of the width anyway. Sonner builds its list of positions
    // from the toasts themselves, so this one opting out does not move any
    // other toast.
    position: isMobile ? undefined : 'bottom-right',
    classNames: {
      toast: TOAST_CLASSES,
      title: TITLE_CLASSES,
      content: CONTENT_CLASSES,
      closeButton: CLOSE_CLASSES,
    },
    description: (
      <span className="flex flex-col gap-3">
        <span>{note}</span>
        <span className="flex flex-col gap-2">
          <button
            type="button"
            className={BUTTON_CLASSES}
            // A plain reload is enough to land on the new build: sw.js serves
            // navigations NetworkFirst, so the HTML comes back fresh with live
            // chunk URLs, and the chunks themselves are content-hashed, so
            // nothing cached under an old name can be replayed for them.
            onClick={() => window.location.reload()}
          >
            {i18n.t('toasts.refresh')}
          </button>
          {version.url ? (
            <a href={version.url} target="_blank" rel="noopener noreferrer" className={BUTTON_CLASSES}>
              {i18n.t('toasts.what_changed')}
            </a>
          ) : null}
        </span>
      </span>
    ),
  });
}

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
        void showUpdateToast(version, isMobileRef.current);
      }),
    []
  );

  return null;
}
