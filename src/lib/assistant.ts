/**
 * The @assistant bot's identity in chat.
 *
 * Replies used to be generated client-side and shown only to whoever triggered
 * them. They are now real chat messages posted by the API under a reserved
 * account, so they arrive over the same socket as everyone else's and every
 * client in the room sees the same thing. All the UI has to do is recognise the
 * sender and render it as the assistant rather than as a user.
 *
 * Keep in sync with `assistantConfig.walletAddress` in the API.
 */
export const ASSISTANT_ADDRESS = '0x00000000000000000000000000000000dec0de01';

export const ASSISTANT_USERNAME = 'assistant';

/** Mention forms the bot answers to. Mirrors the API's trigger exactly. */
export const ASSISTANT_MENTION = /(?:^|[^a-z0-9_])@(assistant|dehub)(?![a-z0-9_])/i;

export function isAssistantAddress(address?: string | null): boolean {
  return !!address && address.toLowerCase() === ASSISTANT_ADDRESS.toLowerCase();
}

/** True when a draft message will trigger a reply from the bot. */
export function mentionsAssistant(content?: string | null): boolean {
  return !!content && ASSISTANT_MENTION.test(content);
}
