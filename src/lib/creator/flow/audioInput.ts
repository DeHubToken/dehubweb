import { assetToFile } from '@/lib/creator/assetDownload';

const extensions: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac', 'audio/x-flac': 'flac' };
/** Keep the original format and bound both streamed bytes and wall time. */
export async function downloadFlowAudio(url: string): Promise<File> {
  const file = await assetToFile(url, 'flow-audio', 'application/octet-stream', { maxBytes: 50 * 1024 * 1024, signal: AbortSignal.timeout(30_000) });
  const mime = file.type.split(';')[0].toLowerCase();
  const extension = extensions[mime];
  if (!extension || !file.size) throw new Error('Saved audio is empty or has an unsupported format.');
  return new File([file], `flow-audio.${extension}`, { type: mime });
}
