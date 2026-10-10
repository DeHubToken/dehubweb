import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedAudioVisualizer } from './ProtectedAudioVisualizer';
const state = vi.hoisted(() => ({ data: undefined as { url: string } | undefined, isError: false }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ ...state, refetch: vi.fn() }) }));
vi.mock('@/lib/api/dehub', () => ({ apiCall: vi.fn() }));
vi.mock('./AudioVisualizer', () => ({ AudioVisualizer: (props: any) =>
  <div data-testid="player" data-source={props.audioUrl} data-popout-source={props.popoutTrack?.audioUrl} /> }));

const props = { tokenId: '123', viewerKey: 'buyer', audioUrl: 'https://example.test/original.mp3',
  isPlaying: false, onPlayPause: vi.fn() };
describe('protected audio source', () => {
  beforeEach(() => { state.data = undefined; state.isError = false; });
  it('never mounts the original while permission is pending or denied', () => {
    const { queryByTestId, rerender } = render(<ProtectedAudioVisualizer {...props} requiresAccess />);
    expect(queryByTestId('player')).toBeNull();
    state.isError = true;
    rerender(<ProtectedAudioVisualizer {...props} requiresAccess />);
    expect(queryByTestId('player')).toBeNull();
  });
  it('uses the granted source for playback and popout handoff', () => {
    state.data = { url: 'https://example.test/scoped-playback' };
    const { getByTestId } = render(<ProtectedAudioVisualizer {...props} requiresAccess
      popoutTrack={{ tokenId: '123', audioUrl: props.audioUrl, title: 'Synthetic audio', artist: 'Test' }} />);
    expect(getByTestId('player').getAttribute('data-source')).toBe(state.data.url);
    expect(getByTestId('player').getAttribute('data-popout-source')).toBe(state.data.url);
  });
  it('keeps public audio on its original source without an access grant', () => {
    const { getByTestId } = render(<ProtectedAudioVisualizer {...props} requiresAccess={false} />);
    expect(getByTestId('player').getAttribute('data-source')).toBe(props.audioUrl);
  });
});
