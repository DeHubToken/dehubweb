import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** The soundtrack belongs to the enclosing slide, never to an individual photo. */
export function ShortsPhotoPager({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const wheel = useRef(0);
  const step = (delta: number) => setIndex(value => Math.max(0, Math.min(images.length - 1, value + delta)));
  return <div className="absolute inset-0 z-[3] overflow-hidden" data-shorts-photos
    tabIndex={images.length > 1 ? 0 : undefined} aria-label="Post photos"
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1);
    }}
    onPointerDown={event => { start.current = { x: event.clientX, y: event.clientY }; }}
    onPointerUp={event => {
      const origin = start.current;
      start.current = null;
      if (!origin) return;
      const x = event.clientX - origin.x, y = event.clientY - origin.y;
      if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y) * 1.25) step(x < 0 ? 1 : -1);
    }}
    onPointerCancel={() => { start.current = null; }}
    onWheel={event => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const now = event.timeStamp;
      if (now - wheel.current > 250 && Math.abs(event.deltaX) > 8) step(event.deltaX > 0 ? 1 : -1);
      wheel.current = now;
    }}>
    <div className="flex h-full transition-transform duration-200 motion-reduce:transition-none"
      style={{ transform: `translateX(-${index * 100}%)` }}>
      {images.map((url, photo) => <img key={`${photo}-${url}`} src={url} alt={`Photo ${photo + 1} of ${images.length}`}
        aria-hidden={photo !== index} draggable={false} loading={Math.abs(photo - index) <= 1 ? 'eager' : 'lazy'}
        className="w-full h-full flex-none object-contain select-none" />)}
    </div>
    {images.length > 1 && <>
      <span aria-live="polite" className="absolute top-20 right-4 rounded-full bg-black/60 px-3 py-1 text-sm text-white">{index + 1} / {images.length}</span>
      {[{ delta: -1, Icon: ChevronLeft, label: 'Previous photo' }, { delta: 1, Icon: ChevronRight, label: 'Next photo' }].map(({ delta, Icon, label }) =>
        <button key={delta} type="button" aria-label={label} disabled={delta < 0 ? index === 0 : index === images.length - 1}
          onPointerDown={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); step(delta); }}
          className={`absolute top-1/2 ${delta < 0 ? 'left-2' : 'right-2'} flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white disabled:invisible`}>
          <Icon className="h-5 w-5" />
        </button>)}
    </>}
  </div>;
}
