import { expect, it } from 'vitest';
import { getStageRecordingLanguage, setStageRecordingLanguage, setStageRecordingDubStatus, STAGE_RECORDING_LANGUAGES } from '@/lib/stage-recording-language';
import { hasCachedDubLanguage } from '@/lib/cached-dub-languages';

it('shares a selected recording language independently of transcript lifetime', () => {
  setStageRecordingLanguage('town-hall', 'es');
  setStageRecordingDubStatus('town-hall', 'es', 'ready');
  expect(getStageRecordingLanguage('town-hall')).toEqual({ language: 'es', status: 'ready' });
  expect(getStageRecordingLanguage('another-stage').language).toBe('original');
});
it('does not let a late language result overwrite the current selection', () => {
  setStageRecordingLanguage('switch', 'es');
  setStageRecordingLanguage('switch', 'fr');
  setStageRecordingDubStatus('switch', 'es', 'ready');
  expect(getStageRecordingLanguage('switch')).toEqual({ language: 'fr', status: 'preparing' });
  setStageRecordingLanguage('switch', 'original');
  expect(getStageRecordingLanguage('switch').status).toBe('original');
});
it('offers a shared spoken-audio route for every language in the recording selector', () => {
  expect(STAGE_RECORDING_LANGUAGES.every(([code]) => hasCachedDubLanguage(code))).toBe(true);
});
