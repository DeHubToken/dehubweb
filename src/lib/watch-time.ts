/**
 * Watch time for post stats
 * =========================
 * Measures how long each play of a video or audio post really lasted and how
 * far into it the viewer got, and reports it for the creator's stats
 * (/api/post-stats/watch-time). Works signed in and signed out.
 *
 * Players hand their element over with `trackWatchTime(el, tokenId)`. Shared
 * elements (the feed card and the post page play the same <video>) keep one
 * session per post; an element that moves on to another post starts a new one.
 *
 * Only real playback counts: time is added from `timeupdate` steps under two
 * seconds, so a seek is not "watching". Reports go out every 15 seconds while
 * playing, on pause and end, and when the page is hidden.
 */

import { sendPostStatsBeacon } from '@/lib/api/dehub/post-stats';

const REPORT_EVERY_MS = 15_000;

interface Session {
  tokenId: string;
  sessionId: string;
  played: number;
  maxPos: number;
  lastTime: number | null;
  sentPlayed: number;
  sentMaxPos: number;
  lastSentAt: number;
}

const sessions = new WeakMap<HTMLMediaElement, Session>();
const live = new Set<HTMLMediaElement>();

function newSessionId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  } catch {
    return Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
  }
}

function freshSession(tokenId: string): Session {
  return { tokenId, sessionId: newSessionId(), played: 0, maxPos: 0, lastTime: null, sentPlayed: 0, sentMaxPos: 0, lastSentAt: Date.now() };
}

function report(el: HTMLMediaElement, s: Session): void {
  const played = Math.floor(s.played);
  const position = Math.floor(s.maxPos);
  if (played < 1 || (played === s.sentPlayed && position === s.sentMaxPos)) return;
  s.sentPlayed = played;
  s.sentMaxPos = position;
  s.lastSentAt = Date.now();
  const duration = Number.isFinite(el.duration) ? Math.floor(el.duration) : 0;
  sendPostStatsBeacon('watch-time', { tokenId: Number(s.tokenId), sessionId: s.sessionId, seconds: played, position, duration });
}

function onTime(this: HTMLMediaElement) {
  const s = sessions.get(this);
  if (!s || this.paused) return;
  const t = this.currentTime;
  if (s.lastTime !== null) {
    const step = t - s.lastTime;
    if (step > 0 && step < 2) s.played += step;
  }
  s.lastTime = t;
  if (t > s.maxPos) s.maxPos = t;
  if (Date.now() - s.lastSentAt >= REPORT_EVERY_MS) report(this, s);
}

function onPlay(this: HTMLMediaElement) {
  const s = sessions.get(this);
  if (s) s.lastTime = this.currentTime;
  live.add(this);
}

function onStop(this: HTMLMediaElement) {
  const s = sessions.get(this);
  if (!s) return;
  s.lastTime = null;
  report(this, s);
}

let pageHooked = false;
function hookPage() {
  if (pageHooked || typeof document === 'undefined') return;
  pageHooked = true;
  const flushAll = () => {
    for (const el of live) {
      const s = sessions.get(el);
      if (s) report(el, s);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
  window.addEventListener('pagehide', flushAll);
}

/** Start (or keep) measuring plays of `tokenId` on this element. */
export function trackWatchTime(el: HTMLMediaElement | null | undefined, tokenId: string | number | null | undefined): void {
  if (!el || tokenId == null) return;
  const id = String(tokenId);
  if (!/^\d+$/.test(id)) return;
  const existing = sessions.get(el);
  if (existing) {
    if (existing.tokenId === id) return;
    report(el, existing);
    sessions.set(el, freshSession(id));
    return;
  }
  sessions.set(el, freshSession(id));
  el.addEventListener('timeupdate', onTime);
  el.addEventListener('play', onPlay);
  el.addEventListener('pause', onStop);
  el.addEventListener('ended', onStop);
  hookPage();
}
