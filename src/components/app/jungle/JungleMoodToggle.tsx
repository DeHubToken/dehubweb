import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useJungleMood } from '@/lib/jungle-mood';

/**
 * The Jungle theme's own day / evening switch.
 *
 * Deliberately not a stock <Switch>: the track IS a little sky — morning blue
 * with a warm horizon by day, indigo with stars by evening — and the thumb is
 * the sun, which slides across and turns into a crescent moon. It previews
 * exactly what flipping it will do to the scene behind the page.
 */
export function JungleMoodToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [mood, setMood] = useJungleMood();
  const evening = mood === 'evening';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={evening}
      aria-label={t('jungleMood.title')}
      title={evening ? t('jungleMood.evening') : t('jungleMood.day')}
      onClick={() => setMood(evening ? 'day' : 'evening')}
      className={cn(
        'relative h-9 w-[4.5rem] shrink-0 overflow-hidden rounded-full',
        'ring-1 ring-inset ring-white/15 shadow-[inset_0_1px_3px_rgba(0,0,0,0.45)]',
        'transition-[box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
        className,
      )}
    >
      {/* Day sky */}
      <span
        aria-hidden="true"
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: evening ? 0 : 1,
          background: 'linear-gradient(180deg, #5fa9d6 0%, #9fd0e2 58%, #f3dc9c 100%)',
        }}
      />
      {/* Evening sky, with a few stars and a last rim of sunset on the horizon */}
      <span
        aria-hidden="true"
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: evening ? 1 : 0,
          background:
            'radial-gradient(1px 1px at 22% 30%, #fff 60%, transparent 100%),' +
            'radial-gradient(1px 1px at 38% 62%, #dfe6ff 60%, transparent 100%),' +
            'radial-gradient(1.5px 1.5px at 14% 70%, #fff 60%, transparent 100%),' +
            'radial-gradient(1px 1px at 52% 24%, #cfd8ff 60%, transparent 100%),' +
            'linear-gradient(180deg, #0f1a3d 0%, #34427a 70%, #b87a86 100%)',
        }}
      />
      {/* A treeline along the bottom of the track, so it reads as the jungle */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2.5 transition-colors duration-500"
        style={{
          backgroundColor: evening ? '#141c30' : '#2f5a26',
          clipPath:
            'polygon(0 100%,0 55%,8% 30%,15% 55%,24% 20%,33% 50%,42% 35%,50% 60%,58% 25%,67% 50%,76% 30%,85% 55%,93% 35%,100% 50%,100% 100%)',
        }}
      />
      {/* Thumb: the sun, which becomes a crescent moon */}
      <span
        aria-hidden="true"
        className="absolute top-1 size-7 overflow-hidden rounded-full transition-[left,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]"
        style={{
          left: evening ? 'calc(100% - 2rem)' : '0.25rem',
          backgroundColor: evening ? '#eef1ff' : '#ffd66b',
          boxShadow: evening
            ? 'inset -7px -3px 0 0 #c9d0f0, 0 0 10px 2px rgba(190,205,255,0.45)'
            : '0 0 0 3px rgba(255,214,107,0.35), 0 0 14px 4px rgba(255,200,90,0.55)',
        }}
      >
        {/* The bite that makes the disc a crescent — sky-coloured, so it
            reads as the unlit part of the moon. */}
        <span
          className="absolute size-6 rounded-full transition-[opacity,transform] duration-500"
          style={{
            top: '-0.3rem',
            left: '-0.55rem',
            backgroundColor: '#1d2a55',
            opacity: evening ? 1 : 0,
            transform: evening ? 'scale(1)' : 'scale(0.4)',
          }}
        />
      </span>
      <span className="sr-only">{evening ? t('jungleMood.evening') : t('jungleMood.day')}</span>
    </button>
  );
}
