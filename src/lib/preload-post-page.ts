let pending: Promise<typeof import('@/pages/app/SinglePostPage')> | undefined;

export function loadPostPage() {
  return pending ??= import('@/pages/app/SinglePostPage').catch(error => {
    pending = undefined;
    throw error;
  });
}

export function warmPostPage(): void {
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  void loadPostPage().catch(() => {});
}
