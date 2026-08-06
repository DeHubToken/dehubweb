/**
 * The @assistant bot's identity.
 *
 * Replies used to be generated client-side and shown only to whoever triggered
 * them. They are now real rows written by the API under a reserved account: a
 * chat message broadcast to the room, or a comment in the thread the bot was
 * tagged in. Either way everyone sees the same thing and it survives a reload,
 * so all the UI has to do is recognise the sender and render it as the
 * assistant rather than as a user.
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

/** True when a draft message or comment will trigger a reply from the bot. */
export function mentionsAssistant(content?: string | null): boolean {
  return !!content && ASSISTANT_MENTION.test(content);
}
