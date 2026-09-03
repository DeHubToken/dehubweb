import { describe, expect, it } from 'vitest';
import {
  detectAiToolRequest,
  isDeHubBrandedImageRequest,
  isSupportQuestion,
  requiresImageGeneration,
  requiresVideoGeneration,
} from '@/lib/ai-intent';

/**
 * The bug these cover cost a real user real DHB on 2026-09-03.
 *
 * They asked the assistant four times why their unstaked tokens had not
 * arrived. Every message contained "withdrawal", "withdrawal" contains "draw",
 * the phrase list was tested with `includes()` — so all four opened the image
 * paywall instead of answering, and the fourth was paid: 24 DHB to the AI
 * treasury for a picture nobody wanted. The support question was never
 * answered at all.
 */
describe('assistant intent classification', () => {
  const supportQuestions = [
    'Why my staked token not received',
    'Already withdrawal',
    'I already withdrawal my token from staking but still not received',
    'My staked token withdrawal already but recieved yet',
    'i want my withdrawal',
    'show me my balance',
    'what does this transaction fee mean',
    'my wallet is locked, give me a hand',
    'the app is not working, i cannot log in',
    'can you show me why my payment failed',
  ];

  it.each(supportQuestions)('never charges for a support question: %s', (message) => {
    expect(isSupportQuestion(message)).toBe(true);
    expect(requiresImageGeneration(message, false)).toBe(false);
    expect(requiresImageGeneration(message, false, { conversational: true })).toBe(false);
    expect(requiresVideoGeneration(message)).toBe(false);
    expect(detectAiToolRequest(message, false)).toBeNull();
    expect(isDeHubBrandedImageRequest(`${message} on dehub`)).toBe(false);
  });

  it('matches phrases as whole words, not as fragments of other words', () => {
    // 'draw' inside "withdrawal", 'ad' inside "already", 'put' inside "input",
    // 'motion' inside "promotion", 'design' inside "designated".
    expect(requiresImageGeneration('how do I withdraw', false)).toBe(false);
    expect(requiresImageGeneration('the input box sits under the header', false)).toBe(false);
    expect(requiresVideoGeneration('when is the promotion running')).toBe(false);
    expect(requiresImageGeneration('who is the designated signer', false)).toBe(false);
  });

  it('still routes a genuine image request', () => {
    expect(requiresImageGeneration('draw me a chrome eagle', false)).toBe(true);
    expect(requiresImageGeneration('generate an image of a husky', false)).toBe(true);
    expect(requiresImageGeneration('make a poster for the launch', false)).toBe(true);
    expect(requiresImageGeneration('photo of a snowy mountain', false)).toBe(true);
    // An attachment plus any instruction is an edit.
    expect(requiresImageGeneration('brighter please', true)).toBe(true);
  });

  it('still routes a genuine video request, and never as an image', () => {
    expect(requiresVideoGeneration('make a video of the DeHub logo spinning')).toBe(true);
    expect(requiresImageGeneration('make a video of the DeHub logo spinning', false)).toBe(false);
    // Video wins over an attachment too, or "animate this" on an attached
    // photo is billed as an image edit.
    expect(requiresImageGeneration('animate this', true)).toBe(false);
  });

  it('keeps the conversational tail off the surface that pays without asking', () => {
    // The chat bubble signs the transfer inline, so 'show me' must not cost
    // 24 DHB there. The assistant page opens a paywall first, so it may.
    expect(requiresImageGeneration('show me a husky', false)).toBe(false);
    expect(requiresImageGeneration('show me a husky', false, { conversational: true })).toBe(true);
  });

  it('routes an explicit request even when it mentions an account word', () => {
    expect(requiresImageGeneration('draw me a picture of a wallet', false)).toBe(true);
    expect(detectAiToolRequest('transcribe this support call', false)).toBe('speech-to-text');
  });

  it('brands an image only when DeHub is named alongside an artefact', () => {
    expect(isDeHubBrandedImageRequest('make a DeHub banner for the launch')).toBe(true);
    expect(isDeHubBrandedImageRequest('my DHB withdrawal is already pending')).toBe(false);
  });
});
