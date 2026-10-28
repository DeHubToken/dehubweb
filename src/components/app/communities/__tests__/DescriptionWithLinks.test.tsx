import { render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { describe, expect, it } from 'vitest';
import { DescriptionWithLinks, prepareDescriptionText } from '../DescriptionWithLinks';
import { trimTrailingUrlPunctuation } from '@/components/app/TranslatableText';

const DEHUB_WAVE =
  'A bunch of us helping DeHub grow—sharing it, bringing people in, and building something big together.  Click the link below to get started: \n\nhttps://docs.google.com/spreadsheets/d/19w68xX7zGJ7Ck7R-fKjLSxYmVNXT1opGc1B4SVWy2Dk/edit?gid=1213196961#gid=1213196961';

const render = (ui: ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>);

const links = (c: HTMLElement) => Array.from(c.querySelectorAll('a')).map(a => ({ href: a.getAttribute('href'), text: a.textContent }));

describe('DescriptionWithLinks', () => {
  it('shows the Dehub Wave sheet link as an inline 🔗 with the full address', () => {
    const { container } = render(<DescriptionWithLinks text={DEHUB_WAVE} />);
    expect(links(container)).toEqual([
      { href: 'https://docs.google.com/spreadsheets/d/19w68xX7zGJ7Ck7R-fKjLSxYmVNXT1opGc1B4SVWy2Dk/edit?gid=1213196961#gid=1213196961', text: '🔗' },
    ]);
    expect(container.textContent).toContain('Click the link below to get started:');
    expect(container.textContent).not.toContain('docs.google.com');
  });

  it('handles several links, trailing punctuation, www. and brackets', () => {
    const { container } = render(
      <DescriptionWithLinks text="Site: www.dehub.io. Docs (https://docs.example.org/start), wiki en.wikipedia.org/wiki/Foo_(bar)!" />,
    );
    expect(links(container).map(l => l.href)).toEqual([
      'https://www.dehub.io',
      'https://docs.example.org/start',
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    ]);
    expect(container.textContent).toBe('Site: 🔗. Docs (🔗), wiki 🔗!');
  });

  it('turns markdown links into label + 🔗 and keeps emails and handles', () => {
    const { container } = render(
      <DescriptionWithLinks text="[Join the sheet](https://example.com/sheet) or mail hi@dehub.io, ask @mal" />,
    );
    expect(container.textContent).toContain('Join the sheet 🔗');
    expect(links(container).map(l => l.href)).toEqual(['https://example.com/sheet', '/mal']);
  });

  it('folds line breaks for one-line cards', () => {
    expect(prepareDescriptionText('one\n\ntwo  three', true)).toBe('one two three');
  });

  it('leaves links alone when nothing trails them', () => {
    expect(trimTrailingUrlPunctuation('https://x.com/a?b=1')).toBe('https://x.com/a?b=1');
    expect(trimTrailingUrlPunctuation('x.com/a).')).toBe('x.com/a');
  });
});
