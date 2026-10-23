import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTranscript } from '@/hooks/use-transcript';
import { lyricAt, lyricLines } from '@/lib/lyrics-lines';

/**
 * Lyrics over an audio post's animation, timed to the track.
 *
 * The words come from the transcript every audio post already gets
 * (auto-transcribe sweeps them in; `transcribe` kind 'audio'). A track the
 * sweep has not reached yet is started here, once, when someone asks for it.
 *
 * Each line sits on its own solid block, like broadcast captions, so it reads
 * over any style and colour the visualizer is drawing.
 */
export function AudioLyrics({ tokenId, currentTime }: { tokenId: string; currentTime: number }) {
  const { t } = useTranslation();
  const { transcript, status, inFlight, canRetry, start } = useTranscript('audio', tokenId);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || inFlight || !canRetry) return;
    if (status !== 'absent' && status !== 'failed') return;
    asked.current = true;
    start.mutate();
  }, [status, inFlight, canRetry, start]);

  const lines = useMemo(() => lyricLines(transcript?.segments), [transcript?.segments]);
  const { current, next } = lyricAt(lines, currentTime);

  const waiting = status === 'absent' || inFlight || (status === 'failed' && canRetry);
  const message = lines.length ? null : waiting ? t('audioPost.lyricsLoading') : t('audioPost.lyricsNone');

  return (
    <div data-audio-lyrics aria-live="polite" className="pointer-events-none absolute inset-x-3 top-12 bottom-14 z-10 flex flex-col items-center justify-center gap-1.5 text-center">
      {message ? (
        <p data-audio-lyric-line className="max-w-full"><span>{message}</span></p>
      ) : (
        <>
          <p data-audio-lyric-line key={current ? `${current.start}` : 'gap'} className="max-w-full text-[15px] sm:text-lg font-semibold">
            <span>{current ? current.text : '♪'}</span>
          </p>
          {next && next !== current && (
            <p data-audio-lyric-line data-audio-lyric-next className="max-w-full text-[13px] sm:text-sm font-medium">
              <span>{next.text}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
