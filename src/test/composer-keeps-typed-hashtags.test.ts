import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const POST_FORM = readFileSync(resolve(__dirname, '../features/post/hooks/usePostForm.ts'), 'utf8');
const SOCIAL = readFileSync(resolve(__dirname, '../lib/api/dehub/social.ts'), 'utf8');

/**
 * A hashtag the author typed and a category they picked from the selector are
 * two different things, and only one of them is meant to be visible.
 *
 * Both composers used to strip `#tags` out of the title and description on
 * their way to the API and file them as categories — which flattened the
 * difference: the tag became invisible metadata exactly like a picked
 * category, and the words somebody had deliberately written vanished from
 * their own post. Nothing renders a post's categories, so the tags were gone
 * for good.
 *
 * These are source-shape guards rather than behavioural tests because both
 * paths run inside a mint that needs a wallet, a chain and an upload. What
 * they protect is small and easy to reintroduce by reflex: a `.replace()` that
 * deletes the tag from the text.
 */
describe('the composer keeps hashtags the author typed', () => {
  it('sends the post text as written', () => {
    expect(POST_FORM).toContain('const submittedDescription = postDescription;');
    expect(POST_FORM).toContain('const submittedTitle = postTitle;');
    expect(POST_FORM).toContain('name: submittedTitle,');
    expect(POST_FORM).toContain('description: submittedDescription,');
    expect(POST_FORM).not.toMatch(/replace\(hashtagRegex/);
  });

  it('sends a quote as written', () => {
    expect(SOCIAL).toContain("formData.append('description', params.content);");
    expect(SOCIAL).not.toMatch(/replace\(hashtagRegex/);
  });

  it('still files the tags as categories, so tapping one filters the feed', () => {
    expect(POST_FORM).toContain('const mergedCategories = [...new Set([...baseCategories, ...hashtagCategories])];');
    expect(SOCIAL).toContain('const mergedCategories = [...new Set([baseCategory, ...hashtagCategories])];');
  });
});
