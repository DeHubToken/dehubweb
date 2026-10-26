import { useTranslation as _useCopy } from 'react-i18next';
/**
 * GeneratedStageCover — the poster a stage gets when the host set no cover
 * ========================================================================
 * Drawn from the stage's own details (see lib/stage-cover), so the same stage
 * shows the same poster everywhere, on web and in the app: "Chrome Mic", a
 * DeHub banner with the stage's title in chrome and the 3D mic beside it.
 *
 * The art is a picture, like an uploaded cover, so it stays dark in every
 * theme: [data-keep-dark] keeps the light themes from re-inking its text, and
 * every colour is an inline style rather than a theme-mapped class.
 *
 * Sizes are in container units, so a 176px thumbnail and a full-width stage
 * page show the same composition at different scales. Under 300px the corner
 * tag, the host line and the dehub.io box drop out (index.css), which would
 * otherwise be too small to read.
 *
 * The // tags are brand decoration, written like the App Store posters, and
 * are hidden from screen readers; the label carries the stage's title.
 *
 * [data-gsc-chrome] marks the chrome title, whose see-through text index.css
 * shields from the light themes' "keep dark means white text" rule.
 */

import { useMemo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { buildStageCover, stageCoverTitleScale, type StageCoverSource } from '@/lib/stage-cover';

const BASE = '#050506';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const KIT = '/brand-kit';

const corner = (pos: CSSProperties): CSSProperties => ({
  position: 'absolute',
  width: '1cqw',
  height: '1cqw',
  borderColor: 'rgba(255,255,255,0.55)',
  borderStyle: 'solid',
  borderWidth: 0,
  ...pos,
});

/** A thin four-point twinkle, like the ones on the banners. */
function Sparkle({ x, y, size }: { x: number; y: number; size: number }) {
  const line = 'rgba(255,255,255,0.9)';
  return (
    <span aria-hidden className="absolute" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${size}cqw`, height: `${size}cqw`, transform: 'translate(-50%, -50%)' }}>
      <span className="absolute left-0 top-1/2 w-full -translate-y-1/2" style={{ height: '0.12cqw', background: `linear-gradient(90deg, transparent, ${line}, transparent)` }} />
      <span className="absolute top-0 left-1/2 h-full -translate-x-1/2" style={{ width: '0.12cqw', background: `linear-gradient(180deg, transparent, ${line}, transparent)` }} />
    </span>
  );
}

export function GeneratedStageCover({
  stage,
  className,
}: {
  stage: StageCoverSource;
  className?: string;
}) {
  const { t: _copy } = _useCopy();
  const m = useMemo(
    () => buildStageCover(stage, _copy),
    // Only the fields the poster reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage.id, stage.title, stage.host_username, stage.host_wallet_address, stage.scheduled_at, stage.started_at, stage.created_at, stage.ended_at, stage.status, _copy],
  );
  const titleSize = stageCoverTitleScale(m.title) * 100;

  return (
    <div
      data-keep-dark
      data-stage-generated-cover
      data-stage-cover-status={m.status}
      role="img"
      aria-label={m.title ? _copy('copy.99ca327a47b5', { defaultValue: 'Cover graphic for {{value1}}', value1: m.title }) : undefined}
      className={cn('relative w-full aspect-video overflow-hidden select-none', className)}
      style={{ containerType: 'inline-size', backgroundColor: BASE, color: '#fff', fontFamily: 'Exo, system-ui, sans-serif' }}
    >
      <img aria-hidden alt="" src={`${KIT}/bg/${m.background}.jpg`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,5,6,0.8) 0%, rgba(5,5,6,0.45) 60%, rgba(5,5,6,0.3) 100%)' }} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.28) 0.1cqw, transparent 0.15cqw)', backgroundSize: '3.4cqw 3.4cqw' }}
      />
      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: `url(${KIT}/brand/grain-web.webp)`, backgroundSize: '30cqw', opacity: 0.18, mixBlendMode: 'overlay' }} />
      <div aria-hidden className="absolute" style={{ inset: '1.4cqw', borderRadius: '2cqw', border: '0.12cqw solid rgba(255,255,255,0.16)' }} />

      <img
        aria-hidden
        alt=""
        src={`${KIT}/icons/mic-480.webp`}
        srcSet={`${KIT}/icons/mic-240.webp 240w, ${KIT}/icons/mic-480.webp 480w`}
        sizes="33cqw"
        loading="lazy"
        decoding="async"
        className="absolute"
        style={{
          right: '4cqw',
          top: '50%',
          width: '33cqw',
          transform: `translateY(-46%) rotate(${m.tilt}deg)${m.flip ? ' scaleX(-1)' : ''}`,
          filter: 'drop-shadow(0 2cqw 3cqw rgba(0,0,0,0.7))',
        }}
      />
      {m.sparkles.map((sp, i) => <Sparkle key={i} {...sp} />)}

      <span
        aria-hidden
        className="absolute flex"
        style={{ left: '4.4cqw', top: '4.2cqw', padding: '0.9cqw 1.4cqw', borderRadius: '0.9cqw', background: '#f4f4f5' }}
      >
        <img alt="" src={`${KIT}/brand/wordmark-black-web.webp`} style={{ height: '2.2cqw', width: 'auto', display: 'block' }} />
      </span>
      <span data-gsc-tags aria-hidden className="absolute" style={{ right: '4.4cqw', top: '4.2cqw', padding: '0.6cqw 1.3cqw', fontFamily: MONO, fontSize: '1.5cqw', color: 'rgba(255,255,255,0.82)' }}>
        <span style={corner({ left: 0, top: 0, borderLeftWidth: '0.13cqw', borderTopWidth: '0.13cqw' })} />
        <span style={corner({ right: 0, bottom: 0, borderRightWidth: '0.13cqw', borderBottomWidth: '0.13cqw' })} />
        {`// type = "${_copy('stageCover.stage')}"`}
      </span>

      <div className="absolute flex flex-col" style={{ left: '4.4cqw', width: '56cqw', top: '50%', transform: 'translateY(-50%)', gap: '1.6cqw' }}>
        <span aria-hidden className="flex items-center font-medium uppercase" style={{ fontSize: '2.1cqw', color: 'rgba(255,255,255,0.92)' }}>
          {m.status === 'live' && (
            <span className="rounded-full shrink-0" style={{ width: '1.1cqw', height: '1.1cqw', marginRight: '0.9cqw', background: '#ef4444', boxShadow: '0 0 1.2cqw #ef4444' }} />
          )}
          {m.statusTag}
        </span>
        {m.title && (
          <p
            data-gsc-chrome
            className="font-bold uppercase line-clamp-3 break-words"
            style={{
              fontSize: `${titleSize}cqw`,
              lineHeight: 0.98,
              letterSpacing: '-0.01em',
              background: 'linear-gradient(180deg, #ffffff 0%, #ececef 40%, #8e8e97 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 0.4cqw 1.2cqw rgba(0,0,0,0.6))',
            }}
          >
            {m.title}
          </p>
        )}
        {(m.host || m.detail) && (
          <span data-gsc-when aria-hidden className="truncate" style={{ fontFamily: MONO, fontSize: '1.5cqw', color: 'rgba(255,255,255,0.6)' }}>
            {m.host && <>host = <span style={{ color: '#fff' }}>{m.host}</span></>}
            {m.host && m.detail && ' · '}
            {m.detail}
          </span>
        )}
      </div>

      <span
        data-gsc-site
        aria-hidden
        className="absolute"
        style={{ left: '4.4cqw', bottom: '4.2cqw', padding: '0.6cqw 1.4cqw', border: '0.12cqw solid rgba(255,255,255,0.3)', borderRadius: '0.5cqw', background: 'rgba(0,0,0,0.35)', fontFamily: MONO, fontSize: '1.5cqw', color: 'rgba(255,255,255,0.85)' }}
      >
        {'// dehub.io/stages'}
      </span>
    </div>
  );
}

export default GeneratedStageCover;
