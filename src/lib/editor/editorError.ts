import { translateCopy } from "@/i18n/copy";

type EditorErrorValues = Record<string, string | number>;

const fill = (text: string, values: EditorErrorValues) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => (values[name] === undefined ? match : String(values[name])));

/**
 * A failure written for the person using the editor. `message` stays English
 * for logs, tests and the code that matches on it; screens read it through
 * editorErrorText, which looks it up by `key` in the reader's language.
 */
export class EditorError extends Error {
  constructor(readonly key: string, readonly english: string, readonly values: EditorErrorValues = {}) {
    super(fill(english, values));
  }
}

/**
 * The text to show for a caught failure: an EditorError in the reader's
 * language, anything else (a browser, network or server message) as the
 * caller's already-translated fallback, so English exception text never
 * reaches the screen.
 */
export function editorErrorText(reason: unknown, fallback: string): string {
  return reason instanceof EditorError ? translateCopy(reason.key, { ...reason.values, defaultValue: reason.english }) : fallback;
}
