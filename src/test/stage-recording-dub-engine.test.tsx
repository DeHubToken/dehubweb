import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const { state, pause, resume, ready } = vi.hoisted(() => {
  const state = { spaceId: 'source-order', paused: false, loading: true };
  return { state, pause: vi.fn(() => { state.paused = true; }), resume: vi.fn(), ready: { value: false } };
});
vi.mock('@/lib/stage-playback', () => ({
  useStagePlayback: () => state, getStagePlaybackState: () => state,
  getStageRecordingElement: () => null, pauseStageRecording: pause, resumeStageRecording: resume,
}));
vi.mock('@/hooks/use-transcript', () => ({
  useTranscript: () => ({ transcript: { id: 'transcript', source_lang: 'en', status: 'ready' } }),
  useTranscriptTranslation: () => ({ translation: { status: 'ready', segments: [] }, isLoading: false, isError: false }),
}));
vi.mock('@/components/app/spaces/StageReplayDub', () => ({
  StageReplayDub: ({ onReady }: { onReady: (value: boolean) => void }) => {
    useEffect(() => { onReady(ready.value); }, [onReady, ready.value]);
    return null;
  },
}));
import { StageRecordingDubEngine } from '@/components/app/stages/StageRecordingDubEngine';
import { setStageRecordingLanguage } from '@/lib/stage-recording-language';

it('holds a ready dub until recording conversion has supplied the source', () => {
  setStageRecordingLanguage(state.spaceId, 'es');
  const view = render(<StageRecordingDubEngine />);
  expect(pause).toHaveBeenCalledOnce();
  ready.value = true;
  view.rerender(<StageRecordingDubEngine />);
  expect(resume).not.toHaveBeenCalled();
  state.loading = false;
  view.rerender(<StageRecordingDubEngine />);
  expect(resume).toHaveBeenCalledOnce();
});
