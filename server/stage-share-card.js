/**
 * Stage share card: the 1200x630 picture a /stages/<n> link unfurls with when
 * the host set no cover. It is the same ticket stub the app and site draw
 * (src/lib/stage-cover.ts), as an SVG the worker renders to PNG with resvg.
 *
 * resvg has Exo 500/700 and the brand mono ("Consolas") loaded; the worker
 * runs in UTC, so the stub's time says UTC.
 */
import { buildStageCover, stageCoverTitleScale } from '../src/lib/stage-cover.ts';
import { wrapPostText } from './post-share-card.js';

export const STAGE_CARD_VERSION = 'v1';
const ORIGIN = 'https://dehub.io';

export function stageShareImageUrl(id) {
  return `${ORIGIN}/_og/stage/${STAGE_CARD_VERSION}/${encodeURIComponent(id)}.png`;
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

const W = 1200;
const H = 630;
const U = W / 100; // 1cqw in the web component
const MARK = '<g fill="none" stroke="#09090b" stroke-width="60" stroke-linecap="round"><path d="M112 176v116c0 70 39 128 103 150"/><path d="M400 176v116c0 70-39 128-103 150"/><path d="M256 86v213"/></g>';

/** The fields the card reads, from an audio_spaces row. */
export function stageCardSource(stage) {
  return {
    id: stage.id,
    title: stage.title,
    host_username: stage.host_username,
    host_wallet_address: stage.host_wallet_address,
    scheduled_at: stage.scheduled_at,
    started_at: stage.started_at,
    created_at: stage.created_at,
    ended_at: stage.ended_at,
    status: stage.status,
  };
}

export function renderStageCardSvg(stage) {
  const m = buildStageCover(stageCardSource(stage), 'en-US');
  const n = (v) => Number(v.toFixed(1));
  const tl = 4.2 * U, tr = W - 4.2 * U, tt = 9.4 * U, tb = H - 8.6 * U;
  const stubW = 22 * U, seam = tr - stubW, rad = 1.8 * U;
  const stubX = seam + stubW / 2;
  const bodyX = tl + 3.2 * U;

  const size = n(W * stageCoverTitleScale(m.title));
  const lines = m.title ? wrapPostText(m.title.toUpperCase(), size, (seam - tl - 6.4 * U) * 0.9, 3) : [];
  const lineH = n(size * 1.04);
  const titleTop = (tt + tb) / 2 - ((lines.length - 1) * lineH) / 2 + size * 0.36;

  const barW = 1000 / m.bars.length;
  const barcode = m.bars.map((h, i) => {
    const bh = h * 100;
    return `M${n(i * barW + barW * 0.22)} ${n(50 - bh / 2)}h${n(barW * 0.56)}v${n(bh)}h-${n(barW * 0.56)}z`;
  }).join('');
  const dot = m.status === 'live' ? '#ef4444' : m.status === 'replay' ? '#a1a1aa' : '#ffffff';
  const streaks = m.streaks.map((s, i) => {
    const cx = n(s.x * W), cy = n(s.y * H);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${n((s.w * W) / 2)}" ry="${n((s.h * W) / 2)}" fill="url(#st${i})" filter="url(#blur)" transform="rotate(${s.rotate} ${cx} ${cy})"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${m.streaks.map((s, i) => `<radialGradient id="st${i}"><stop stop-color="#fff" stop-opacity="${n(s.opacity * 100) / 100}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`).join('')}
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(1.6 * U)}"/></filter>
    <pattern id="dots" x="${n(1.7 * U)}" y="${n(1.7 * U)}" width="${n(3.4 * U)}" height="${n(3.4 * U)}" patternUnits="userSpaceOnUse"><circle r="1.2" fill="#fff" fill-opacity=".22"/></pattern>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset=".45" stop-color="#e4e4e7"/><stop offset="1" stop-color="#9d9da6"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#050506"/>
  ${streaks}
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <rect x="${n(1.4 * U)}" y="${n(1.4 * U)}" width="${n(W - 2.8 * U)}" height="${n(H - 2.8 * U)}" rx="${n(2 * U)}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.5"/>

  <rect x="${n(tl)}" y="${n(3.6 * U)}" width="${n(14.6 * U)}" height="${n(3.6 * U)}" rx="${n(0.9 * U)}" fill="#f4f4f5"/>
  <svg x="${n(tl + 1.5 * U)}" y="${n(4.45 * U)}" width="${n(1.9 * U)}" height="${n(1.9 * U)}" viewBox="0 0 512 512">${MARK}</svg>
  <text x="${n(tl + 4.1 * U)}" y="${n(6.0 * U)}" font-family="Exo" font-weight="700" font-size="${n(1.7 * U)}" letter-spacing="${n(0.37 * U)}" fill="#09090b">DEHUB</text>
  <text x="${n(tr - 1.2 * U)}" y="${n(5.9 * U)}" text-anchor="end" font-family="Consolas" font-size="${n(1.35 * U)}" fill="#fff" fill-opacity=".78">// type = "stage"</text>
  <path d="M${n(tr - 14.2 * U)} ${n(4.1 * U)}v-${n(0.9 * U)}h${n(0.9 * U)}M${n(tr)} ${n(6.3 * U)}v${n(0.9 * U)}h-${n(0.9 * U)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>

  <rect x="${n(tl)}" y="${n(tt)}" width="${n(tr - tl)}" height="${n(tb - tt)}" rx="${n(rad)}" fill="#fff" fill-opacity=".05" stroke="#fff" stroke-opacity=".22" stroke-width="1.5"/>
  <path d="M${n(seam)} ${n(tt)}H${n(tr - rad)}A${n(rad)} ${n(rad)} 0 0 1 ${n(tr)} ${n(tt + rad)}V${n(tb - rad)}A${n(rad)} ${n(rad)} 0 0 1 ${n(tr - rad)} ${n(tb)}H${n(seam)}Z" fill="#f4f4f5"/>
  <line x1="${n(seam)}" y1="${n(tt)}" x2="${n(seam)}" y2="${n(tb)}" stroke="#fff" stroke-opacity=".35" stroke-width="${n(0.3 * U)}" stroke-dasharray="${n(U)} ${n(U)}"/>
  <circle cx="${n(seam)}" cy="${n(tt)}" r="${n(1.6 * U)}" fill="#050506"/>
  <circle cx="${n(seam)}" cy="${n(tb)}" r="${n(1.6 * U)}" fill="#050506"/>

  <circle cx="${n(bodyX + 0.45 * U)}" cy="${n(tt + 3.8 * U)}" r="${n(0.45 * U)}" fill="${dot}"/>
  <text x="${n(bodyX + 1.7 * U)}" y="${n(tt + 4.3 * U)}" font-family="Consolas" font-size="${n(1.45 * U)}" fill="#fff" fill-opacity=".8">${escape(m.statusTag)}</text>
  <text font-family="Exo" font-weight="700" font-size="${size}" fill="url(#metal)">${lines.map((line, i) => `<tspan x="${n(bodyX)}" y="${n(titleTop + i * lineH)}">${escape(line)}</tspan>`).join('')}</text>
  ${m.host ? `<text x="${n(bodyX)}" y="${n(tb - 3.2 * U)}" font-family="Exo" font-weight="700" font-size="${n(2 * U)}" fill="#fff"><tspan fill-opacity=".7">//</tspan>${escape(wrapPostText(m.host, 2 * U, seam - tl - 8 * U, 1)[0] || '')}</text>` : ''}

  ${m.day ? `<text x="${n(stubX)}" y="${n(tt + 9.6 * U)}" text-anchor="middle" font-family="Consolas" font-size="${n(1.6 * U)}" letter-spacing="${n(0.29 * U)}" fill="#09090b">${escape(m.month)}</text>
  <text x="${n(stubX)}" y="${n(tt + 19.6 * U)}" text-anchor="middle" font-family="Exo" font-weight="700" font-size="${n(10.5 * U)}" fill="#09090b">${escape(m.day)}</text>
  <text x="${n(stubX)}" y="${n(tt + 22.6 * U)}" text-anchor="middle" font-family="Consolas" font-size="${n(1.4 * U)}" fill="#09090b">${escape(`${m.weekday} · ${m.time} UTC`)}</text>` : `<svg x="${n(stubX - 4 * U)}" y="${n(tt + 8 * U)}" width="${n(8 * U)}" height="${n(8 * U)}" viewBox="0 0 512 512">${MARK}</svg>`}
  <svg x="${n(seam + 2 * U)}" y="${n(tt + 24.4 * U)}" width="${n(stubW - 4 * U)}" height="${n(4 * U)}" viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="${barcode}" fill="#09090b"/></svg>
  <text x="${n(stubX)}" y="${n(tt + 30.2 * U)}" text-anchor="middle" font-family="Consolas" font-size="${n(U)}" letter-spacing="${n(0.28 * U)}" fill="#09090b" fill-opacity=".55">${escape(m.stubLine)}</text>

  <rect x="${n(W / 2 - 6.2 * U)}" y="${n(H - 6.2 * U)}" width="${n(12.4 * U)}" height="${n(2.9 * U)}" rx="${n(0.5 * U)}" fill="#000" fill-opacity=".4" stroke="#fff" stroke-opacity=".3" stroke-width="1.5"/>
  <text x="${n(W / 2)}" y="${n(H - 4.3 * U)}" text-anchor="middle" font-family="Consolas" font-size="${n(1.3 * U)}" fill="#fff" fill-opacity=".85">// dehub.io</text>
</svg>`;
}
