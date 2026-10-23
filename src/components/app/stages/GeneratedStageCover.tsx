import { useTranslation as _useCopy } from 'react-i18next';
/**
 * GeneratedStageCover — the poster a stage gets when the host set no cover
 * ========================================================================
 * Drawn in SVG from the stage's own details (see lib/stage-cover), so the
 * same stage shows the same poster everywhere, on web and in the app.
 *
 * The art is a picture, like an uploaded cover, so it stays dark in every
 * theme: [data-keep-dark] keeps the light themes from re-inking its text, and
 * every colour is an inline style rather than a theme-mapped class.
 *
 * Text sizes are in container units, so a 176px thumbnail and a full-width
 * stage page show the same composition at different scales. Thumbnails under
 * 300px drop the brand line and the time (index.css), which would otherwise
 * be too small to read and crowd the title.
 */

import { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  STAGE_COVER_H,
  STAGE_COVER_W,
  buildStageCover,
  stageCoverArc,
  stageCoverTitleScale,
  type StageCoverSource,
} from '@/lib/stage-cover';

export function GeneratedStageCover({
  stage,
  className,
}: {
  stage: StageCoverSource;
  className?: string;
}) {
  const { t: _copy } = _useCopy();
  const uid = useId().replace(/:/g, '');
  const m = useMemo(
    () => buildStageCover(stage),
    // Only the fields the poster reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage.id, stage.title, stage.host_username, stage.host_wallet_address, stage.scheduled_at, stage.started_at, stage.created_at],
  );
  const { palette: p } = m;
  const barW = STAGE_COVER_W / m.bars.length;
  const accent = m.rings[m.accentRing];
  const titleSize = stageCoverTitleScale(m.title) * 100;

  return (
    <div
      data-keep-dark
      data-stage-generated-cover
      role="img"
      aria-label={m.title ? _copy('copy.99ca327a47b5', { defaultValue: 'Cover graphic for {{value1}}', value1: m.title }) : undefined}
      className={cn('relative w-full aspect-video overflow-hidden select-none', className)}
      style={{ containerType: 'inline-size', backgroundColor: '#08080c' }}
    >
      <svg
        viewBox={`0 0 ${STAGE_COVER_W} ${STAGE_COVER_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        <defs>
          <radialGradient id={`ga${uid}`} cx={m.cx} cy={m.cy} r={760} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={p.a} stopOpacity={0.75} />
            <stop offset="0.55" stopColor={p.a} stopOpacity={0.18} />
            <stop offset="1" stopColor={p.a} stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`gb${uid}`} cx={STAGE_COVER_W - m.cx} cy={STAGE_COVER_H * 1.05} r={820} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={p.b} stopOpacity={0.6} />
            <stop offset="1" stopColor={p.b} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`gs${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity={0.62} />
            <stop offset="0.6" stopColor="#000" stopOpacity={0.12} />
            <stop offset="1" stopColor="#000" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`gw${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={p.b} />
            <stop offset="1" stopColor={p.a} />
          </linearGradient>
          <pattern id={`gd${uid}`} width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.6" fill="#fff" fillOpacity={0.07} />
          </pattern>
        </defs>

        <rect width={STAGE_COVER_W} height={STAGE_COVER_H} fill="#08080c" />
        <rect width={STAGE_COVER_W} height={STAGE_COVER_H} fill={`url(#gb${uid})`} />
        <rect width={STAGE_COVER_W} height={STAGE_COVER_H} fill={`url(#ga${uid})`} />
        <rect width={STAGE_COVER_W} height={STAGE_COVER_H} fill={`url(#gd${uid})`} />

        {m.rings.map((ring, i) => (
          <circle key={i} cx={m.cx} cy={m.cy} r={ring.r} fill="none" stroke="#fff" strokeOpacity={ring.opacity} strokeWidth={2} />
        ))}
        {accent && (
          <path
            d={stageCoverArc(m.cx, m.cy, accent.r, m.accentStart, 70)}
            fill="none"
            stroke={p.ink}
            strokeWidth={6}
            strokeLinecap="round"
          />
        )}

        <circle cx={m.cx} cy={m.cy} r={118} fill="#000" fillOpacity={0.45} stroke="#fff" strokeOpacity={0.35} strokeWidth={2} />
        {m.day ? (
          <>
            <text x={m.cx} y={m.cy + 22} textAnchor="middle" fill="#fff" fontSize={104} fontWeight={800} fontFamily="Inter, system-ui, sans-serif" letterSpacing={-4}>
              {m.day}
            </text>
            <text x={m.cx} y={m.cy + 66} textAnchor="middle" fill={p.ink} fontSize={30} fontWeight={700} fontFamily="Inter, system-ui, sans-serif" letterSpacing={6}>
              {m.month}
            </text>
          </>
        ) : (
          <circle cx={m.cx} cy={m.cy} r={22} fill={p.ink} />
        )}

        <rect width={STAGE_COVER_W} height={STAGE_COVER_H} fill={`url(#gs${uid})`} />

        <g fill={`url(#gw${uid})`} fillOpacity={0.7}>
          {m.bars.map((h, i) => {
            const bh = 18 + h * 92;
            return (
              <rect key={i} x={i * barW + barW * 0.22} y={STAGE_COVER_H - bh} width={barW * 0.56} height={bh} rx={barW * 0.28} />
            );
          })}
        </g>
      </svg>

      <div
        className="absolute inset-y-0 left-0 flex flex-col"
        style={{ width: '56%', padding: '5.5cqw 0 10cqw 5.5cqw' }}
      >
        <div
          data-gsc-brand
          className="flex items-center font-bold uppercase"
          style={{ gap: '0.9cqw', fontSize: '1.8cqw', letterSpacing: '0.22em', color: p.ink }}
        >
          <span className="rounded-full shrink-0" style={{ width: '1.2cqw', height: '1.2cqw', backgroundColor: p.ink }} />
          <span>DeHub {_copy('copy.3a17aa4e4abb', { defaultValue: 'Stages' })}</span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col justify-center">
          {m.title && (
            <p
              className="font-extrabold line-clamp-3 break-words"
              style={{ fontSize: `${titleSize}cqw`, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#fff' }}
            >
              {m.title}
            </p>
          )}
          {m.when && (
            <p data-gsc-when className="font-medium truncate" style={{ marginTop: '1.6cqw', fontSize: 'max(8px, 2.4cqw)', color: 'rgba(255,255,255,0.8)' }}>
              {m.when}
            </p>
          )}
        </div>
        {m.host && (
          <p className="font-semibold truncate" style={{ fontSize: 'max(7px, 2.3cqw)', color: 'rgba(255,255,255,0.9)' }}>
            {m.host}
          </p>
        )}
      </div>
    </div>
  );
}

export default GeneratedStageCover;
