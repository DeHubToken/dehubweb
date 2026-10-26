/**
 * Stage share card: the 1200x630 picture a /stages/<n> link unfurls with when
 * the host set no cover. It is the same "Chrome Mic" banner the app and site
 * draw (src/lib/stage-cover.ts), as an SVG the worker renders to PNG with resvg.
 *
 * resvg has Exo 500/700 and the brand mono ("Consolas") loaded; the backdrop,
 * mic and wordmark come in as data URIs (stage-share-image.js fetches them).
 * The worker runs in UTC, so the time says UTC.
 */
import { buildStageCover, stageCoverTitleScale } from '../src/lib/stage-cover.ts';
import { wrapPostText } from './post-share-card.js';

export const STAGE_CARD_VERSION = 'v2';
const ORIGIN = 'https://dehub.io';

export function stageShareImageUrl(id) {
  return `${ORIGIN}/_og/stage/${STAGE_CARD_VERSION}/${encodeURIComponent(id)}.png`;
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

const W = 1200;
const H = 630;
const U = W / 100; // 1cqw in the web component
const MIC_RATIO = 720 / 590;

/** English copy for the card's words (the share card is not localised). */
const COPY = { 'stageCover.live': 'live', 'stageCover.upcoming': 'upcoming', 'stageCover.replay': 'replay', 'stageCover.stage': 'stage', 'stageCover.minutes': '{{minutes}} min' };
const t = (key, values = {}) => (COPY[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? ''));

/** The brand-kit files the card draws, relative to the site root. */
export function stageCardAssetPaths(stage) {
  const m = buildStageCover(stageCardSource(stage), t, 'en-US');
  return {
    background: `/brand-kit/bg/${m.background}.jpg`,
    mic: '/brand-kit/icons/mic.png',
    wordmark: '/brand-kit/brand/wordmark-black.png',
  };
}

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

/**
 * `images` holds data URIs for the paths from stageCardAssetPaths; any that is
 * missing is left out, so the card still renders on the plain black base.
 */
export function renderStageCardSvg(stage, images = {}) {
  const m = buildStageCover(stageCardSource(stage), t, 'en-US');
  const n = (v) => Number(v.toFixed(1));
  const left = 4.4 * U;

  const size = n(W * stageCoverTitleScale(m.title));
  const lines = m.title ? wrapPostText(m.title.toUpperCase(), size, 56 * U * 1.08, 3) : [];
  const lineH = n(size * 1.0);
  const tagSize = n(2.1 * U);
  const kvSize = n(1.5 * U);
  const gap = 1.6 * U;
  const kv = [m.host && `host = ${m.host}`, m.detail && `${m.detail}${m.status === 'upcoming' ? ' UTC' : ''}`].filter(Boolean).join(' · ');
  const blockH = tagSize + gap + lines.length * lineH + (kv ? gap + kvSize : 0);
  let y = H / 2 - blockH / 2;
  const tagY = n(y + tagSize * 0.85);
  y += tagSize + gap;
  const titleY = y + size * 0.8;
  y += lines.length * lineH + gap;
  const kvY = n(y + kvSize * 0.8);

  const micW = 33 * U;
  const micH = micW * MIC_RATIO;
  const micX = W - 4 * U - micW;
  const micY = H / 2 - micH * 0.46;
  const micCx = micX + micW / 2;
  const micCy = micY + micH / 2;
  const micTransform = `rotate(${m.tilt} ${n(micCx)} ${n(micCy)})${m.flip ? ` translate(${n(2 * micCx)} 0) scale(-1 1)` : ''}`;
  const sparkle = (sp) => {
    const cx = sp.x * W, cy = sp.y * H, r = (sp.size * U) / 2;
    return `<path d="M${n(cx - r)} ${n(cy)}H${n(cx + r)}M${n(cx)} ${n(cy - r)}V${n(cy + r)}" stroke="url(#twinkle)" stroke-width="1.5"/>`;
  };
  const tagX = m.status === 'live' ? left + 2 * U : left;
  const wordmarkW = 14.6 * U * 0.62;
  const wordmarkH = wordmarkW * (417 / 1752);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#050506" stop-opacity=".8"/><stop offset=".6" stop-color="#050506" stop-opacity=".45"/><stop offset="1" stop-color="#050506" stop-opacity=".3"/></linearGradient>
    <pattern id="dots" width="${n(3.4 * U)}" height="${n(3.4 * U)}" patternUnits="userSpaceOnUse"><circle cx="${n(1.7 * U)}" cy="${n(1.7 * U)}" r="1.2" fill="#fff" fill-opacity=".28"/></pattern>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset=".4" stop-color="#ececef"/><stop offset="1" stop-color="#8e8e97"/></linearGradient>
    <radialGradient id="twinkle"><stop stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${n(0.5 * U)}"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="#050506"/>
  ${images.background ? `<image href="${images.background}" xlink:href="${images.background}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <rect x="${n(1.4 * U)}" y="${n(1.4 * U)}" width="${n(W - 2.8 * U)}" height="${n(H - 2.8 * U)}" rx="${n(2 * U)}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.5"/>

  ${images.mic ? `<image href="${images.mic}" xlink:href="${images.mic}" x="${n(micX)}" y="${n(micY)}" width="${n(micW)}" height="${n(micH)}" transform="${micTransform}"/>` : ''}
  ${m.sparkles.map(sparkle).join('')}

  <rect x="${n(left)}" y="${n(4.2 * U)}" width="${n(wordmarkW + 2.8 * U)}" height="${n(wordmarkH + 1.8 * U)}" rx="${n(0.9 * U)}" fill="#f4f4f5"/>
  ${images.wordmark ? `<image href="${images.wordmark}" xlink:href="${images.wordmark}" x="${n(left + 1.4 * U)}" y="${n(5.1 * U)}" width="${n(wordmarkW)}" height="${n(wordmarkH)}"/>` : `<text x="${n(left + 1.4 * U)}" y="${n(5.1 * U + wordmarkH * 0.85)}" font-family="Exo" font-weight="700" font-size="${n(wordmarkH)}" letter-spacing="${n(0.2 * U)}" fill="#09090b">DEHUB</text>`}
  <text x="${n(W - 5.7 * U)}" y="${n(6.2 * U)}" text-anchor="end" font-family="Consolas" font-size="${n(1.5 * U)}" fill="#fff" fill-opacity=".82">// type = "${escape(t('stageCover.stage'))}"</text>
  <path d="M${n(W - 22 * U)} ${n(5.2 * U)}v-${n(U)}h${n(U)}M${n(W - 4.4 * U)} ${n(6.6 * U)}v${n(U)}h-${n(U)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>

  ${m.status === 'live' ? `<circle cx="${n(left + 0.55 * U)}" cy="${n(tagY - tagSize * 0.33)}" r="${n(1.2 * U)}" fill="#ef4444" filter="url(#glow)"/><circle cx="${n(left + 0.55 * U)}" cy="${n(tagY - tagSize * 0.33)}" r="${n(0.55 * U)}" fill="#ef4444"/>` : ''}
  <text x="${n(tagX)}" y="${tagY}" font-family="Exo" font-weight="500" font-size="${tagSize}" fill="#fff" fill-opacity=".92">${escape(m.statusTag)}</text>
  <text font-family="Exo" font-weight="700" font-size="${size}" fill="url(#chrome)">${lines.map((line, i) => `<tspan x="${n(left)}" y="${n(titleY + i * lineH)}">${escape(line)}</tspan>`).join('')}</text>
  ${kv ? `<text x="${n(left)}" y="${kvY}" font-family="Consolas" font-size="${kvSize}" fill="#fff" fill-opacity=".6">${escape(wrapPostText(kv, kvSize, 56 * U, 1)[0] || '')}</text>` : ''}

  <rect x="${n(left)}" y="${n(H - 4.2 * U - 3.1 * U)}" width="${n(18.4 * U)}" height="${n(3.1 * U)}" rx="${n(0.5 * U)}" fill="#000" fill-opacity=".35" stroke="#fff" stroke-opacity=".3" stroke-width="1.5"/>
  <text x="${n(left + 1.4 * U)}" y="${n(H - 4.2 * U - 1.05 * U)}" font-family="Consolas" font-size="${n(1.5 * U)}" fill="#fff" fill-opacity=".85">// dehub.io/stages</text>
</svg>`;
}
