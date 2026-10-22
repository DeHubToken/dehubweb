import { useId } from 'react';

export function GlassAudioShoulder() {
  const id = useId();
  return (
    <svg data-glass-audio-shoulder aria-hidden="true" viewBox="0 0 600 120" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset=".7" stopColor="currentColor" stopOpacity=".055" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".08" />
        </linearGradient>
      </defs>
      <path d="M0 120L125 0H475L600 120Z" fill={`url(#${id})`} />
    </svg>
  );
}
