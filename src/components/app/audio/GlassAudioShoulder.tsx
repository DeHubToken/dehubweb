import { useId } from 'react';

export function GlassAudioShoulder() {
  const id = useId();
  return (
    <svg data-glass-audio-shoulder aria-hidden="true" viewBox="0 0 600 120" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset=".7" stopColor="currentColor" stopOpacity=".055" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".18" />
        </linearGradient>
      </defs>
      <path d="M4 120C38 104 65 24 156 12Q300-12 444 12C535 24 562 104 596 120Z" fill={`url(#${id})`} />
      <path d="M4 120C38 104 65 24 156 12M444 12C535 24 562 104 596 120" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
