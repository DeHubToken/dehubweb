// Copy sensitive text (seed phrase, private key) to the clipboard and wipe it
// shortly after, so a recovery phrase doesn't linger in the OS clipboard where
// other apps/extensions can read it. Best-effort: if we can read the clipboard
// back and the user has since copied something else, we leave it alone.
const CLEAR_AFTER_MS = 30_000;

export async function copyThenClear(text: string, clearAfterMs = CLEAR_AFTER_MS): Promise<void> {
  await navigator.clipboard.writeText(text);
  window.setTimeout(async () => {
    try {
      // Only clear if the clipboard still holds our secret.
      if (navigator.clipboard.readText) {
        const current = await navigator.clipboard.readText();
        if (current !== text) return;
      }
    } catch {
      // readText blocked (no permission / not focused) — clear anyway.
    }
    navigator.clipboard.writeText("").catch(() => {});
  }, clearAfterMs);
}
