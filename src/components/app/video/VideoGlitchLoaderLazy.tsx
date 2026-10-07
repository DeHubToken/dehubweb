import { lazy, Suspense, type ComponentProps } from 'react';

const Loader = lazy(() => import('./VideoGlitchLoader').then(m => ({ default: m.VideoGlitchLoader })));

// Keep the poster visible while the optional loading effect arrives.
export function VideoGlitchLoader(props: ComponentProps<typeof Loader>) {
  return (
    <Suspense fallback={props.poster ? <img src={props.poster} alt="" aria-hidden className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${props.rounded ?? 'rounded-lg'} ${props.className ?? ''}`} /> : null}>
      <Loader {...props} />
    </Suspense>
  );
}
