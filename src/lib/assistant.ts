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
/**
 * The live @assistant account.
 *
 * This was `0x…dec0de01`, a placeholder invented on the assumption that the bot
 * needed an account nobody owned. @assistant is a real account, so everything
 * keyed off the placeholder silently matched nothing: no AI badge on the bot's
 * comments, and the pending-reply poller never recognised the answer it was
 * waiting for, so it spun for its full timeout on every question.
 */
export const ASSISTANT_ADDRESS = '0xea0fe14398b96f3ae97f222a6cf0f933c1ccf61c';

export const ASSISTANT_USERNAME = 'assistant';

/**
 * Mention forms the bot answers to. Mirrors the API's trigger exactly.
 *
 * `@dehub` was a second trigger and is not one any more — it is a real user's
 * handle, so tagging that person made the bot answer instead of them.
 */
export const ASSISTANT_MENTION = /(?:^|[^a-z0-9_])@assistant(?![a-z0-9_])/i;

export function isAssistantAddress(address?: string | null): boolean {
  return !!address && address.toLowerCase() === ASSISTANT_ADDRESS.toLowerCase();
}

/** True when a draft message or comment will trigger a reply from the bot. */
export function mentionsAssistant(content?: string | null): boolean {
  return !!content && ASSISTANT_MENTION.test(content);
}
