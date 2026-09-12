import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const IMAGE_CARD = readFileSync(
  resolve(process.cwd(), 'src/components/app/cards/ImageCard.tsx'),
  'utf8',
);

describe('image carousel navigation affordance', () => {
  it('only renders arrow controls when the active slide fills the viewport', () => {
    expect(IMAGE_CARD).toMatch(
      /setCurrentSlideFillsViewport\(slides\[idx\]\.offsetWidth >= viewport\.clientWidth - 1\)/,
    );
    expect(IMAGE_CARD).toMatch(/hasMultiple && currentSlideFillsViewport/);
  });
});
