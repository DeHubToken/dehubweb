/** Save the original media through a blob so cross-origin links download. */
export async function downloadMedia(source: string, filename: string): Promise<void> {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari needs time to consume the URL after the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function imageDownloadName(source: string, postId: string, index: number): string {
  const extension = source.split(/[?#]/)[0].match(/\.(jpe?g|png|gif|webp|avif)$/i)?.[1]
    ?? source.match(/^data:image\/(jpeg|png|gif|webp|avif)/i)?.[1]
    ?? 'jpg';
  return `dehub-${postId}-${index + 1}.${extension}`;
}
