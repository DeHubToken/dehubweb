import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import i18n from '@/i18n';
import { supabase } from '@/integrations/supabase/client';
import { autoTranslateEnabled } from '@/lib/auto-translate-setting';
import { startVersionWatch, type BuildVersion } from '@/lib/version-check';
import { BUTTON_CLASSES } from '@/components/ui/toast-classes';

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
