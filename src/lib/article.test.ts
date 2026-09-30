import { describe, expect, it } from 'vitest';
import { articleHeadings, articleReadingMinutes, articleSummaryFromBody, articleWordCount } from './article';

const BODY = ['Intro paragraph with **bold** words.', '# First part', 'Body text.', '## First part', '> A quote'].join('\n\n');

describe('article helpers', () => {
  it('counts words without markdown syntax', () => {
    expect(articleWordCount('Hello **big** [world](https://x.y)')).toBe(3);
  });

  it('never reports less than one minute', () => {
    expect(articleReadingMinutes('short')).toBe(1);
    expect(articleReadingMinutes(Array(690).fill('word').join(' '))).toBe(3);
  });

  it('gives duplicate headings unique ids and their source line', () => {
    expect(articleHeadings(BODY)).toEqual([
      { level: 1, text: 'First part', id: 'first-part', line: 3 },
      { level: 2, text: 'First part', id: 'first-part-2', line: 7 },
    ]);
  });

  it('takes the first real paragraph as the summary', () => {
    expect(articleSummaryFromBody(`# Title\n\n${BODY}`)).toBe('Intro paragraph with bold words.');
    expect(articleSummaryFromBody('word '.repeat(300)).length).toBeLessThanOrEqual(500);
  });
});
