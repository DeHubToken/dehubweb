/**
 * Cards translate a post's title and body as one `title\n\n body` string to
 * halve the request count, then split the answer back apart. The split is the
 * part that went wrong: a translator that dropped the blank line made the whole
 * post come back as the title, and the title renders unclamped while the body
 * is capped and has a "Show more". Pressing translate on a long post therefore
 * expanded it to full length instead of translating it.
 */
import { describe, it, expect } from 'vitest';
import { splitTranslatedTitleAndBody } from '@/components/app/TranslatableText';

describe('splitTranslatedTitleAndBody', () => {
  it('splits on the separator it was joined with', () => {
    expect(
      splitTranslatedTitleAndBody('Gran anuncio\n\nEstamos lanzando algo nuevo.', 'Big news', 'We are launching something new.'),
    ).toEqual(['Gran anuncio', 'Estamos lanzando algo nuevo.']);
  });

  it('keeps blank lines inside the body', () => {
    const [title, body] = splitTranslatedTitleAndBody(
      'Titulo\n\nPrimer parrafo.\n\nSegundo parrafo.',
      'Title',
      'First paragraph.\n\nSecond paragraph.',
    );
    expect(title).toBe('Titulo');
    expect(body).toBe('Primer parrafo.\n\nSegundo parrafo.');
  });

  it('puts everything in the body when the separator did not survive', () => {
    // The regression: parts[0] used to become the title, so the entire post
    // ended up in the element that has no length cap.
    const whole = 'Gran anuncio. Estamos lanzando un programa de staking para todos los holders.';
    expect(splitTranslatedTitleAndBody(whole, 'Big news', 'We are launching a staking programme.')).toEqual([
      undefined,
      whole,
    ]);
  });

  it('puts everything in the body when one half came back empty', () => {
    const whole = 'Solo el titulo';
    expect(splitTranslatedTitleAndBody(`${whole}\n\n`, 'Title only', 'Body')).toEqual([undefined, `${whole}\n\n`]);
    expect(splitTranslatedTitleAndBody(`\n\n${whole}`, 'Title only', 'Body')).toEqual([undefined, `\n\n${whole}`]);
  });

  it('assigns the whole translation to whichever half was sent', () => {
    expect(splitTranslatedTitleAndBody('Solo titulo', 'Title only', undefined)).toEqual(['Solo titulo', undefined]);
    expect(splitTranslatedTitleAndBody('Solo cuerpo', undefined, 'Body only')).toEqual([undefined, 'Solo cuerpo']);
  });

  it('does not treat a single newline as the separator', () => {
    // Only the two-newline join is a title boundary. A body that merely wraps
    // must not have its first line promoted to a title.
    const wrapped = 'Primera linea\nSegunda linea';
    expect(splitTranslatedTitleAndBody(wrapped, 'Title', 'Body')).toEqual([undefined, wrapped]);
  });
});
