/** Warm media composition only when the reader approaches Create. */
export function warmPostComposer(): void {
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  void import('@/features/post/PostModal').catch(() => {});
}
