type EditorErrorValues = Record<string, string | number>;

const fill = (text: string, values: EditorErrorValues) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => (values[name] === undefined ? match : String(values[name])));

/**
 * A failure written for the person using the editor. `message` stays English
 * for logs, tests and the code that matches on it; screens read it through
 * editorErrorText, which looks it up by `key` in the reader's language.
 *
 * No imports: render, export and worker code bundled on its own throws these too.
 */
export class EditorError extends Error {
  constructor(readonly key: string, readonly english: string, readonly values: EditorErrorValues = {}) {
    super(fill(english, values));
  }
}
