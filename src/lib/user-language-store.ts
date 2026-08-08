/**
 * The reader's language, resolved once and shared.
 * ================================================
 *
 * This lives outside `use-user-language` so that `UserPreferencesContext` can
 * push a change into it without the two modules importing each other.
 *
 * It exists at all because the language used to be per-hook state that started
 * at 'en' and corrected itself in an effect. Auto-translation fires on the
 * first render, so every request went out asking for English and the corrected
 * one behind it was dropped — which is why nothing translated for anyone who
 * does not read English. localStorage is synchronous; there is no reason to
 * learn the language a render late.
 *
 * Resolving here also means the detect-and-store step runs once for the app
 * rather than once per component that asks — on a feed, that is every card and
 * every text node inside it.
 */

export const LANGUAGE_STORAGE_KEY = 'user-preferred-language';

let resolved: string | null = null;
const listeners = new Set<(lang: string) => void>();

/** The current language. Cheap and safe to call during render. */
export function resolveLanguage(): string {
  if (resolved !== null) return resolved;

  const detected = navigator.language?.split('-')[0] || 'en';
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored) {
      resolved = stored;
    } else {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, detected);
      resolved = detected;
    }
  } catch {
    // Storage disabled (private mode, embedded webview). Detection still works,
    // the choice just will not be remembered.
    resolved = detected;
  }
  return resolved;
}

/**
 * Adopt a language decided elsewhere and tell everyone reading it.
 *
 * The account-preferences bridge applies the signed-in reader's stored language
 * once preferences hydrate, and that can differ from what this device had.
 * Without this, a feed already on screen would keep translating into the
 * language it started with.
 */
export function applyResolvedLanguage(lang: string): void {
  if (!lang || lang === resolved) return;
  resolved = lang;
  for (const listener of listeners) listener(lang);
}

export function subscribeToLanguage(listener: (lang: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
