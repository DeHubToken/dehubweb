export function displayPostTitle(title: string | null | undefined, description: string | null | undefined): string {
  const trimmedTitle = title?.trim() || '';
  if (!trimmedTitle) return '';
  return description?.trim().startsWith(trimmedTitle) ? '' : trimmedTitle;
}
