import { useTranslation as _useCopy } from 'react-i18next';
/**
 * GeneratedStageCover — the poster a stage gets when the host set no cover
 * ========================================================================
 * Drawn from the stage's own details (see lib/stage-cover), so the same stage
 * shows the same poster everywhere, on web and in the app: a ticket with a
 * tear-off date stub, in DeHub's monochrome poster style.
 *
 * The art is a picture, like an uploaded cover, so it stays dark in every
 * theme: [data-keep-dark] keeps the light themes from re-inking its text, and
 * every colour is an inline style rather than a theme-mapped class.
 *
 * Sizes are in container units, so a 176px thumbnail and a full-width stage
 * page show the same composition at different scales. Under 300px the corner
 * tags, the status line and the barcode drop out (index.css), which would
 * otherwise be too small to read.
 *
 * The // tags are brand decoration, written like the App Store posters, and
 * are hidden from screen readers; the label carries the stage's title.
 *
 * [data-gsc-ink] marks the white paper parts (logo pill, date stub): their
 * text is dark ink, which index.css shields from the light themes' "keep
 * dark means white text" rule.
 */

import { useMemo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { buildStageCover, stageCoverTitleScale, type StageCoverSource } from '@/lib/stage-cover';

const BASE = '#050506';
const PAPER = '#f4f4f5';
const INK = '#09090b';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** The DeHub mark (assets/brand/bimi-logo.svg in the app). */
function DehubMark({ size }: { size: string }) {
  return (
    <svg viewBox="0 0 512 512" style={{ width: size, height: size }} aria-hidden>
      <g fill="none" stroke={INK} strokeWidth={60} strokeLinecap="round">
        <path d="M112 176v116c0 70 39 128 103 150" />
        <path d="M400 176v116c0 70-39 128-103 150" />
        <path d="M256 86v213" />
      </g>
    </svg>
  );
}

const corner = (pos: CSSProperties): CSSProperties => ({
  position: 'absolute',
  width: '0.9cqw',
  height: '0.9cqw',
  borderColor: 'rgba(255,255,255,0.5)',
  borderStyle: 'solid',
  borderWidth: 0,
  ...pos,
});

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
  const barW = 1000 / m.bars.length;
  const barcode = m.bars
    .map((h, i) => {
      const bh = h * 100;
      return `M${(i * barW + barW * 0.22).toFixed(1)} ${(50 - bh / 2).toFixed(1)}h${(barW * 0.56).toFixed(1)}v${bh.toFixed(1)}h-${(barW * 0.56).toFixed(1)}z`;
    })
    .join('');
  const dot = m.status === 'live' ? '#ef4444' : m.status === 'replay' ? '#a1a1aa' : '#ffffff';

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
      {m.streaks.map((s, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: `${s.x * 100}%`,
            top: `${s.y * 100}%`,
            width: `${s.w * 100}cqw`,
            height: `${s.h * 100}cqw`,
            transform: `translate(-50%, -50%) rotate(${s.rotate}deg)`,
            background: `radial-gradient(closest-side, rgba(255,255,255,${s.opacity.toFixed(2)}), rgba(255,255,255,0))`,
            filter: 'blur(2.2cqw)',
          }}
        />
      ))}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.22) 0.09cqw, transparent 0.14cqw)',
          backgroundSize: '3.4cqw 3.4cqw',
          backgroundPosition: '1.7cqw 1.7cqw',
        }}
      />
      <div aria-hidden className="absolute" style={{ inset: '1.4cqw', borderRadius: '2cqw', border: '0.12cqw solid rgba(255,255,255,0.16)' }} />

      <div data-gsc-tags aria-hidden className="absolute flex items-center justify-between" style={{ left: '4.2cqw', right: '4.2cqw', top: '3.6cqw' }}>
        <span
          data-gsc-ink
          className="flex items-center font-black"
          style={{ gap: '0.7cqw', padding: '0.7cqw 1.5cqw', borderRadius: '0.9cqw', background: PAPER, color: INK, fontSize: '1.7cqw', letterSpacing: '0.22em' }}
        >
          <DehubMark size="1.9cqw" />
          DEHUB
        </span>
        <span className="relative font-bold" style={{ padding: '0.5cqw 1.2cqw', fontFamily: MONO, fontSize: '1.35cqw', color: 'rgba(255,255,255,0.78)' }}>
          <span style={corner({ left: 0, top: 0, borderLeftWidth: '0.12cqw', borderTopWidth: '0.12cqw' })} />
          <span style={corner({ right: 0, bottom: 0, borderRightWidth: '0.12cqw', borderBottomWidth: '0.12cqw' })} />
          {`// type = "${_copy('stageCover.stage')}"`}
        </span>
      </div>

      <div data-gsc-ticket className="absolute flex" style={{ left: '4.2cqw', right: '4.2cqw', top: '9.4cqw', bottom: '8.6cqw' }}>
        <div
          className="relative flex-1 min-w-0 flex flex-col justify-between"
          style={{
            borderRadius: '1.8cqw 0 0 1.8cqw',
            background: 'rgba(255,255,255,0.05)',
            border: '0.12cqw solid rgba(255,255,255,0.22)',
            borderRight: 'none',
            padding: '2.8cqw 3.2cqw',
            gap: '1.5cqw',
          }}
        >
          <span data-gsc-status aria-hidden className="flex items-center font-bold" style={{ gap: '0.8cqw', fontFamily: MONO, fontSize: '1.45cqw', color: 'rgba(255,255,255,0.8)' }}>
            <span className="rounded-full shrink-0" style={{ width: '0.9cqw', height: '0.9cqw', background: dot }} />
            {m.statusTag}
          </span>
          {m.title && (
            <p
              className="font-bold uppercase line-clamp-3 break-words"
              style={{
                fontSize: `${titleSize}cqw`,
                lineHeight: 1.02,
                letterSpacing: '-0.01em',
                background: 'linear-gradient(180deg, #ffffff 0%, #e4e4e7 45%, #9d9da6 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {m.title}
            </p>
          )}
          {m.host && (
            <span className="font-semibold truncate" style={{ fontSize: 'max(7px, 2cqw)', color: 'rgba(255,255,255,0.7)' }}>
              {'//'}
              <span className="font-bold" style={{ color: '#fff' }}>{m.host}</span>
            </span>
          )}
        </div>
        <div aria-hidden className="relative" style={{ width: 0, borderLeft: '0.3cqw dashed rgba(255,255,255,0.35)', zIndex: 1 }}>
          <div className="absolute rounded-full" style={{ left: '-1.6cqw', top: '-1.6cqw', width: '3.2cqw', height: '3.2cqw', background: BASE }} />
          <div className="absolute rounded-full" style={{ left: '-1.6cqw', bottom: '-1.6cqw', width: '3.2cqw', height: '3.2cqw', background: BASE }} />
        </div>
        <div
          data-gsc-ink
          className="shrink-0 flex flex-col items-center justify-center"
          style={{ width: '22cqw', borderRadius: '0 1.8cqw 1.8cqw 0', background: PAPER, color: INK, padding: '2.4cqw 2cqw', gap: '0.6cqw' }}
        >
          {m.day ? (
            <>
              <span className="font-bold" style={{ fontFamily: MONO, fontSize: '1.6cqw', letterSpacing: '0.18em' }}>{m.month}</span>
              <span className="font-black" style={{ fontSize: '10.5cqw', lineHeight: 0.88, letterSpacing: '-0.04em' }}>{m.day}</span>
              <span data-gsc-when className="font-bold whitespace-nowrap" style={{ fontFamily: MONO, fontSize: '1.4cqw' }}>
                {m.weekday} · {m.time}
              </span>
            </>
          ) : (
            <DehubMark size="8cqw" />
          )}
          <svg data-gsc-barcode viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ width: '100%', height: '4cqw', marginTop: '1cqw' }} aria-hidden>
            <path d={barcode} fill={INK} />
          </svg>
          <span data-gsc-stubline aria-hidden className="font-bold" style={{ fontFamily: MONO, fontSize: '1cqw', letterSpacing: '0.28em', opacity: 0.55 }}>
            {m.stubLine}
          </span>
        </div>
      </div>

      <div data-gsc-site aria-hidden className="absolute inset-x-0 flex justify-center" style={{ bottom: '3.3cqw' }}>
        <span
          className="font-bold"
          style={{ padding: '0.5cqw 1.2cqw', border: '0.12cqw solid rgba(255,255,255,0.3)', borderRadius: '0.5cqw', background: 'rgba(0,0,0,0.4)', fontFamily: MONO, fontSize: '1.3cqw', color: 'rgba(255,255,255,0.85)' }}
        >
          {'// dehub.io'}
        </span>
      </div>
    </div>
  );
}

export default GeneratedStageCover;
