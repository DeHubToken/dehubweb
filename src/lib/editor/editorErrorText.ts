import { translateCopy } from "@/i18n/copy";
import { EditorError } from "./editorError";

/**
 * The text to show for a caught failure: an EditorError in the reader's
 * language, anything else (a browser, network or server message) as the
 * caller's already-translated fallback, so English exception text never
 * reaches the screen.
 */
export function editorErrorText(reason: unknown, fallback: string): string {
  return reason instanceof EditorError ? translateCopy(reason.key, { ...reason.values, defaultValue: reason.english }) : fallback;
}
