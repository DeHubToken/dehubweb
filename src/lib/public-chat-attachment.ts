import { validatePublicChatMedia } from './public-chat-media';

/** Only publish a picture after the existing upload route accepts it. */
export async function sendPublicChatImage(
  file: File,
  caption: string,
  replyToId: string | undefined,
  upload: (file: File) => Promise<{ url: string }>,
  send: (content: string, type: 'image', url: string, replyToId?: string) => Promise<unknown>,
) {
  const check = validatePublicChatMedia(file);
  if (!check.ok) throw new Error(check.error);
  const { url } = await upload(file);
  await send(caption, 'image', url, replyToId);
}
