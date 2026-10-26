import { expect, it } from 'vitest';
import { videoQuoteHints } from '../lib/creator/videoQuoteHints';
import { seedance2QuoteRoute } from '../../supabase/functions/_shared/seedance2-input';

it('quotes every required fal control from the same media options used for submission', () => {
  expect(seedance2QuoteRoute('seedance-2.0', videoQuoteHints({}), true).provider).toBe('kie');
  for (const options of [{ endFrameUrl: 'https://media/end.jpg' }, { audioUrls: ['https://media/audio.mp3'] }, { videoUrls: ['https://media/clip.mp4'] }]) {
    expect(seedance2QuoteRoute('seedance-2.0', videoQuoteHints(options), true).provider).toBe('fal');
  }
});
