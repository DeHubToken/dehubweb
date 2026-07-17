import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchSantaLeaderboard,
  submitSantaScore,
  shortWallet,
  type SantaScore,
} from '@/lib/api/santa-leaderboard';

/**
 * Winter snow overlay.
 *
 * Behaviour:
 * - Flakes fall and accumulate only on the bottom of the viewport (ground).
 * - Navigating to a new route blows the ground drift away in style.
 * - Easter egg: any arrow key starts Santa Snake — a proper grid snake
 *   (fixed-cadence steps + input queue) rendered with smooth interpolation,
 *   so it plays like the classic and glides like a sleigh.
 */

type SnakeCell = { c: number; r: number };
type SnakeDir = { x: number; y: number };
type SantaGame = {
  // grid
  cols: number;
  rows: number;
  ox: number;
  oy: number;
  // snake logic (cells, head first)
  body: SnakeCell[];
  prevBody: SnakeCell[];
  dir: SnakeDir;
  queue: SnakeDir[];
  stepMs: number;
  acc: number;
  gift: SnakeCell;
  score: number;
  best: number;
  newBest: boolean;
  // presentation
  t: number;
  heading: number; // smoothed angle the harness string points at
  facing: 1 | -1; // last horizontal facing (sprite flips)
  lean: number; // smoothed nose-up/down tilt
  px: number; // last rendered head pixel (snow interaction)
  py: number;
  countdown: number; // ms before the snake takes off (5·4·3·2·1); 0 once it's flying
  goFlash: number; // frames the "GO!" burst lingers right after the countdown
  flash: number;
  hop: number;
  celebrate: number;
  deadAt: number | null;
  jump: { x: number; y: number; vx: number; vy: number; rot: number } | null;
  wreck: { x: number; y: number; vx: number; vy: number; rot: number } | null;
  tears: Array<{ x: number; y: number; vx: number; vy: number; o: number }>;
  pops: Array<{ x: number; y: number; vy: number; o: number; text: string; size: number }>;
  sparkles: Array<{ x: number; y: number; vx: number; vy: number; o: number; r: number }>;
  debris: Array<{ kind: 'sack' | 'gift'; x: number; y: number; vx: number; vy: number; rot: number; vr: number; o: number; size: number }>;
};

export function WinterSnow() {
  const { theme } = useAppTheme();
  const { pathname } = useLocation();
  const { user, walletAddress, isAuthenticated } = useAuth();
  // Latest auth snapshot, readable from inside the animation-loop closure.
  const authRef = useRef({ user, walletAddress, isAuthenticated });
  authRef.current = { user, walletAddress, isAuthenticated };
  const leaderboardRef = useRef<SantaScore[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heightsRef = useRef<Float32Array | null>(null);
  const mediaRectsRef = useRef<DOMRect[]>([]);
  const flakesRef = useRef<
    Array<{ x: number; y: number; r: number; vy: number; vx: number; o: number }>
  >([]);
  const blowRef = useRef<
    Array<{ x: number; y: number; vx: number; vy: number; r: number; o: number }>
  >([]);
  const rafRef = useRef<number | null>(null);
  const isFirstNav = useRef(true);
  const santaGameRef = useRef<SantaGame | null>(null);
  const santaImgRef = useRef<HTMLImageElement | null>(null);
  const giftImgRef = useRef<HTMLImageElement | null>(null);
  const sackImgRef = useRef<HTMLImageElement | null>(null);
  const santaCryImgRef = useRef<HTMLImageElement | null>(null);

  // Warm the all-time leaderboard when the winter theme mounts, so the crash card
  // has scores ready. Harmless no-op (empty board) until the table migration is live.
  useEffect(() => {
    if (theme !== 'winter') return;
    let cancelled = false;
    fetchSantaLeaderboard(8).then((rows) => {
      if (!cancelled) leaderboardRef.current = rows;
    });
    return () => {
      cancelled = true;
    };
  }, [theme]);

  // On navigation: blow the built-up ground drift away in style. Falling flakes keep falling.
  useEffect(() => {
    if (isFirstNav.current) {
      isFirstNav.current = false;
      return;
    }
    const heights = heightsRef.current;
    if (!heights) return;
    const h = window.innerHeight;
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (let c = 0; c < heights.length; c++) {
      const pile = heights[c];
      if (pile < 0.5) continue;
      const ratio = Math.min(1, pile / 80);
      const count = Math.floor(ratio * 7 + Math.random() * (ratio + 0.3));
      for (let k = 0; k < count; k++) {
        blowRef.current.push({
          x: c * 6 + Math.random() * 6,
          y: h - Math.random() * pile,
          vx: dir * (1.2 + Math.random() * 3 * (0.4 + ratio)),
          vy: -0.4 - Math.random() * (0.8 + ratio * 1.6),
          r: 1 + Math.random() * (1 + ratio * 1.2),
          o: 0.55 + Math.random() * 0.35,
        });
      }
    }
    heights.fill(0);
  }, [pathname]);

  useEffect(() => {
    if (theme !== 'winter') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BUCKET = 6;
    const MAX_PILE = 80;
    const MAX_FLAKES = 180;
    const PUSH_RADIUS = 90;
    const WIPE_RADIUS = 55;

    // --- Santa Snake tuning ---
    const CELL = 48; // logical grid cell (px)
    const SANTA_W = 150;
    const SANTA_H = 84;
    const GIFT_SIZE = 42;
    const STEP_MS_START = 150; // ms per cell at score 0
    const STEP_MS_MIN = 95;
    const START_SACKS = 2; // Santa packs a couple of spares
    const RESTART_DELAY = 36; // frames before an arrow restarts after a crash

    let width = 0;
    let height = 0;
    let cols = 0;

    const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, lastMove: 0 };

    const rebuildGameGrid = (g: SantaGame) => {
      g.cols = Math.max(8, Math.floor(width / CELL));
      g.rows = Math.max(6, Math.floor(height / CELL));
      g.ox = (width - g.cols * CELL) / 2;
      g.oy = (height - g.rows * CELL) / 2;
      for (const s of g.body) {
        s.c = ((s.c % g.cols) + g.cols) % g.cols;
        s.r = ((s.r % g.rows) + g.rows) % g.rows;
      }
      for (const s of g.prevBody) {
        s.c = ((s.c % g.cols) + g.cols) % g.cols;
        s.r = ((s.r % g.rows) + g.rows) % g.rows;
      }
      g.gift.c = ((g.gift.c % g.cols) + g.cols) % g.cols;
      g.gift.r = ((g.gift.r % g.rows) + g.rows) % g.rows;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / BUCKET);
      const prev = heightsRef.current;
      const next = new Float32Array(cols);
      if (prev) {
        for (let i = 0; i < Math.min(prev.length, cols); i++) next[i] = prev[i];
      }
      heightsRef.current = next;
      if (santaGameRef.current) rebuildGameGrid(santaGameRef.current);
    };
    resize();
    window.addEventListener('resize', resize);

    const setPointer = (x: number, y: number) => {
      if (mouse.active) {
        mouse.vx = x - mouse.x;
        mouse.vy = y - mouse.y;
      } else {
        mouse.vx = 0;
        mouse.vy = 0;
      }
      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
      mouse.lastMove = performance.now();
    };
    const onPointerMove = (e: PointerEvent) => setPointer(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) setPointer(t.clientX, t.clientY);
    };
    const onPointerLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.vx = 0;
      mouse.vy = 0;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

    // --- Web Audio jingles (created on the arrow-key gesture, so autoplay policies are happy). ---
    let audioCtx: AudioContext | null = null;
    const ensureAudio = () => {
      if (!audioCtx) {
        try {
          const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioCtx = new AC();
        } catch {
          audioCtx = null;
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
      return audioCtx;
    };
    const beep = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.14) => {
      const ac = audioCtx;
      if (!ac) return;
      const t0 = ac.currentTime + start;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    };
    const playPickup = (n: number) => {
      ensureAudio();
      const base = 620 + Math.min(n, 24) * 18; // pitch climbs as the sack train grows
      beep(base, 0, 0.07, 'triangle', 0.16);
      beep(base * 1.5, 0.055, 0.09, 'triangle', 0.12);
    };
    const playCelebrate = () => {
      ensureAudio();
      [174, 138, 110].forEach((f, i) => beep(f, i * 0.16, 0.15, 'sawtooth', 0.13)); // "Ho ho ho"
      [1047, 1319, 1568].forEach((f, i) => beep(f, 0.12 + i * 0.06, 0.28, 'triangle', 0.07)); // sparkle
    };
    const playCrash = () => {
      ensureAudio();
      [523, 415, 330, 247].forEach((f, i) => beep(f, i * 0.15, 0.2, 'sawtooth', 0.13)); // sad slide down
      beep(70, 0, 0.5, 'sine', 0.24); // low thud
    };

    // Festive trap mix (~3 min, loops). Lazily created on the first run (arrow press =
    // user gesture) and streamed progressively, so only the seconds actually played get
    // fetched. Comes in at full volume the instant the countdown starts — NO fade-in — and
    // restarts from 0 each game so the 5·4·3·2·1 always lines up with the track's intro.
    const MUSIC_VOL = 0.42;
    const music: { el: HTMLAudioElement | null; target: number } = { el: null, target: 0 };
    const startMusic = () => {
      if (!music.el) {
        music.el = new Audio('/santa-mix.mp3');
        music.el.loop = true;
      }
      music.target = MUSIC_VOL;
      music.el.volume = MUSIC_VOL; // straight in, synced to the countdown
      try {
        music.el.currentTime = 0;
      } catch {
        /* not seekable until metadata lands — it just plays from the top anyway */
      }
      void music.el.play().catch(() => {});
    };
    // Only used to gently duck the music out on a crash; it always enters at full volume.
    const tickMusic = () => {
      const el = music.el;
      if (!el || music.target === MUSIC_VOL) return;
      const v = el.volume + (music.target - el.volume) * 0.05;
      el.volume = Math.max(0, Math.min(1, v));
      if (music.target === 0 && el.volume < 0.015 && !el.paused) el.pause();
    };

    // --- Santa Snake: classic grid-snake rules under a smooth, festive skin. ---
    const readBest = () => {
      try {
        return parseInt(localStorage.getItem('dehub-santa-best') || '0', 10) || 0;
      } catch {
        return 0;
      }
    };
    const writeBest = (n: number) => {
      try {
        localStorage.setItem('dehub-santa-best', String(n));
      } catch {
        /* private mode — the sleigh flies on */
      }
    };

    const wrapDelta = (d: number, n: number) => {
      if (d > n / 2) return d - n;
      if (d < -n / 2) return d + n;
      return d;
    };

    // Pixel centre of body slot i, lerped between the previous and current step.
    const segPix = (g: SantaGame, i: number, alpha: number) => {
      const cur = g.body[i];
      const prev = g.prevBody[i] ?? cur;
      const dc = wrapDelta(cur.c - prev.c, g.cols);
      const dr = wrapDelta(cur.r - prev.r, g.rows);
      return {
        x: g.ox + (prev.c + dc * alpha + 0.5) * CELL,
        y: g.oy + (prev.r + dr * alpha + 0.5) * CELL,
      };
    };
    const normPix = (g: SantaGame, p: { x: number; y: number }) => {
      const bw = g.cols * CELL;
      const bh = g.rows * CELL;
      return {
        x: g.ox + ((((p.x - g.ox) % bw) + bw) % bw),
        y: g.oy + ((((p.y - g.oy) % bh) + bh) % bh),
      };
    };
    // Draw at a board position plus mirrored copies near the wrap seams, so the
    // sleigh slides seamlessly off one edge and onto the other.
    const drawWrapped = (
      g: SantaGame,
      x: number,
      y: number,
      margin: number,
      fn: (xx: number, yy: number) => void
    ) => {
      const bw = g.cols * CELL;
      const bh = g.rows * CELL;
      const nx = g.ox + ((((x - g.ox) % bw) + bw) % bw);
      const ny = g.oy + ((((y - g.oy) % bh) + bh) % bh);
      const xs = [nx];
      const ys = [ny];
      if (nx - g.ox < margin) xs.push(nx + bw);
      else if (nx - g.ox > bw - margin) xs.push(nx - bw);
      if (ny - g.oy < margin) ys.push(ny + bh);
      else if (ny - g.oy > bh - margin) ys.push(ny - bh);
      for (const xx of xs) for (const yy of ys) fn(xx, yy);
    };

    const spawnGift = (g: SantaGame): SnakeCell => {
      for (let tries = 0; tries < 300; tries++) {
        const cell = {
          c: Math.floor(Math.random() * g.cols),
          // keep clear of the HUD row up top and the snow drift down below
          r: 1 + Math.floor(Math.random() * Math.max(1, g.rows - 3)),
        };
        const head = g.body[0];
        const dist =
          Math.abs(wrapDelta(cell.c - head.c, g.cols)) + Math.abs(wrapDelta(cell.r - head.r, g.rows));
        if (dist < 4) continue;
        if (g.body.some((s) => s.c === cell.c && s.r === cell.r)) continue;
        return cell;
      }
      return { c: 0, r: 1 };
    };

    const startSantaGame = (dir: SnakeDir) => {
      if (!santaImgRef.current) {
        const img = new Image();
        img.src = '/santa-sleigh.png';
        santaImgRef.current = img;
      }
      if (!giftImgRef.current) {
        const img = new Image();
        img.src = '/santa-gift.png';
        giftImgRef.current = img;
      }
      if (!sackImgRef.current) {
        const img = new Image();
        img.src = '/santa-sack.png';
        sackImgRef.current = img;
      }
      if (!santaCryImgRef.current) {
        const img = new Image();
        img.src = '/santa-cry.png';
        santaCryImgRef.current = img;
      }
      const gcols = Math.max(8, Math.floor(width / CELL));
      const grows = Math.max(6, Math.floor(height / CELL));
      const head = { c: Math.floor(gcols / 2), r: Math.floor(grows / 2) };
      const body: SnakeCell[] = [];
      for (let i = 0; i <= START_SACKS; i++) {
        body.push({
          c: (((head.c - dir.x * i) % gcols) + gcols) % gcols,
          r: (((head.r - dir.y * i) % grows) + grows) % grows,
        });
      }
      const g: SantaGame = {
        cols: gcols,
        rows: grows,
        ox: (width - gcols * CELL) / 2,
        oy: (height - grows * CELL) / 2,
        body,
        prevBody: body.map((s) => ({ ...s })),
        dir,
        queue: [],
        stepMs: STEP_MS_START,
        acc: 0,
        gift: { c: 0, r: 1 },
        score: 0,
        best: readBest(),
        newBest: false,
        t: 0,
        heading: Math.atan2(dir.y, dir.x),
        facing: dir.x < 0 ? -1 : 1,
        lean: 0,
        px: 0,
        py: 0,
        countdown: 5000,
        goFlash: 0,
        flash: 0,
        hop: 0,
        celebrate: 0,
        deadAt: null,
        jump: null,
        wreck: null,
        tears: [],
        pops: [],
        sparkles: [],
        debris: [],
      };
      g.gift = spawnGift(g);
      const hp = segPix(g, 0, 1);
      g.px = hp.x;
      g.py = hp.y;
      santaGameRef.current = g;
      ensureAudio();
      startMusic(); // music + countdown kick off together
      void fetchSantaLeaderboard(8).then((rows) => { leaderboardRef.current = rows; });
      beep(760, 0, 0.1, 'triangle', 0.1); // the first "5" tick
    };

    const sackSize = (g: SantaGame, i: number) => {
      const n = g.body.length;
      const taper = n > 2 ? 1 - 0.22 * ((i - 1) / Math.max(1, n - 2)) : 1;
      return Math.min(CELL * 0.95, 46) * taper;
    };

    // Submit a finished run to the shared all-time board (server keeps the best per
    // wallet) and refresh the local copy. Only logged-in players are recorded.
    const recordScore = (score: number) => {
      const { walletAddress: wallet, user: u, isAuthenticated: authed } = authRef.current;
      if (!authed || !wallet || score <= 0) return;
      const name = ((u?.username || u?.displayName || '') as string).trim() || null;
      void submitSantaScore({ walletAddress: wallet, username: name, score }).then((ok) => {
        if (ok) void fetchSantaLeaderboard(8).then((rows) => { leaderboardRef.current = rows; });
      });
    };

    const killSanta = (g: SantaGame) => {
      g.deadAt = g.t;
      g.celebrate = 0;
      music.target = 0;
      playCrash();
      const hp = normPix(g, segPix(g, 0, 1));
      // Santa bails off in tears one way; the wrecked sleigh cartwheels the other.
      g.jump = { x: hp.x, y: hp.y, vx: -g.dir.x * 2.5 + (Math.random() - 0.5) * 2, vy: -11, rot: 0 };
      g.wreck = { x: hp.x, y: hp.y, vx: g.dir.x * 1.5 + (Math.random() - 0.5) * 2, vy: -5, rot: 0.45 };
      g.pops.push({ x: hp.x, y: hp.y - 50, vy: -0.5, o: 1, text: 'Waaah!', size: 30 });
      // The sack train bursts — sacks and loose gifts fly everywhere.
      for (let i = 1; i < g.body.length; i++) {
        const p = normPix(g, segPix(g, i, 1));
        g.debris.push({
          kind: 'sack',
          x: p.x,
          y: p.y,
          vx: (Math.random() - 0.5) * 7,
          vy: -2 - Math.random() * 4,
          rot: (Math.random() - 0.5) * 0.6,
          vr: (Math.random() - 0.5) * 0.3,
          o: 1,
          size: sackSize(g, i),
        });
        for (let k = 0; k < 2; k++) {
          g.debris.push({
            kind: 'gift',
            x: p.x,
            y: p.y,
            vx: (Math.random() - 0.5) * 9,
            vy: -3 - Math.random() * 5,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.4,
            o: 1,
            size: 16 + Math.random() * 12,
          });
        }
        for (let k = 0; k < 8; k++) {
          blowRef.current.push({
            x: p.x,
            y: p.y,
            vx: (Math.random() - 0.5) * 6,
            vy: -1 - Math.random() * 4,
            r: 1 + Math.random() * 2.5,
            o: 0.9,
          });
        }
      }
      if (g.score > g.best) {
        g.best = g.score;
        g.newBest = true;
        writeBest(g.score);
      }
      recordScore(g.score);
    };

    // One logic step: consume a queued turn, advance one cell, eat or die.
    const stepSnake = (g: SantaGame) => {
      g.prevBody = g.body.map((s) => ({ ...s }));
      const turn = g.queue.shift();
      if (turn) g.dir = turn;
      const head = g.body[0];
      const nh = {
        c: (((head.c + g.dir.x) % g.cols) + g.cols) % g.cols,
        r: (((head.r + g.dir.y) % g.rows) + g.rows) % g.rows,
      };
      const eats = nh.c === g.gift.c && nh.r === g.gift.r;
      // The tail cell vacates this step unless we grow into it — classic rules.
      const solidLen = eats ? g.body.length : g.body.length - 1;
      for (let i = 0; i < solidLen; i++) {
        if (g.body[i].c === nh.c && g.body[i].r === nh.r) {
          killSanta(g);
          return;
        }
      }
      g.body.unshift(nh);
      if (!eats) {
        g.body.pop();
        return;
      }
      // Nom — a present joins the train.
      g.score++;
      g.stepMs = Math.max(STEP_MS_MIN, STEP_MS_START - g.score * 2);
      g.flash = 16;
      g.hop = 14;
      g.gift = spawnGift(g);
      const hp = normPix(g, segPix(g, 0, 1));
      const milestone = g.score % 5 === 0;
      if (milestone) {
        g.celebrate = 95;
        g.pops.push({ x: hp.x, y: hp.y - 46, vy: -0.7, o: 1, text: 'Ho ho ho!', size: 26 });
        playCelebrate();
      } else {
        const cheer = ['Ho ho!', 'Merry!', 'Yes!', '🎁', '😄'][g.score % 5];
        g.pops.push({ x: hp.x, y: hp.y - 40, vy: -0.8, o: 1, text: cheer, size: 20 });
        playPickup(g.score);
      }
      for (let k = 0; k < 12; k++) {
        blowRef.current.push({
          x: hp.x,
          y: hp.y,
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 3,
          r: 1 + Math.random() * 2,
          o: 0.9,
        });
      }
      const sparkCount = milestone ? 26 : 10;
      for (let k = 0; k < sparkCount; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * (milestone ? 5 : 3);
        g.sparkles.push({
          x: hp.x,
          y: hp.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 1,
          o: 1,
          r: 1.2 + Math.random() * 2.2,
        });
      }
    };

    const dirFromKey = (key: string): SnakeDir | null => {
      switch (key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          return { x: 0, y: -1 };
        case 'ArrowDown':
        case 's':
        case 'S':
          return { x: 0, y: 1 };
        case 'ArrowLeft':
        case 'a':
        case 'A':
          return { x: -1, y: 0 };
        case 'ArrowRight':
        case 'd':
        case 'D':
          return { x: 1, y: 0 };
        default:
          return null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const typing = (() => {
        const el = e.target as HTMLElement | null;
        return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      })();
      if (typing) return;
      const game = santaGameRef.current;
      if (game) {
        if (e.key === 'Escape') {
          music.target = 0;
          santaGameRef.current = null;
          return;
        }
        if (game.deadAt !== null) {
          // Crashed: any arrow (fresh press, small grace delay) takes off again.
          if (!e.key.startsWith('Arrow')) return;
          e.preventDefault();
          if (e.repeat || game.t - game.deadAt < RESTART_DELAY) return;
          const d = dirFromKey(e.key);
          if (d) startSantaGame(d);
          return;
        }
        // Steering: arrows or WASD, buffered like a proper snake so quick
        // double-turns land on consecutive cells instead of getting eaten.
        const d = dirFromKey(e.key);
        if (!d) return;
        if (e.key.startsWith('Arrow')) e.preventDefault();
        const last = game.queue.length > 0 ? game.queue[game.queue.length - 1] : game.dir;
        if (d.x === last.x && d.y === last.y) return; // same way
        if (d.x === -last.x && d.y === -last.y) return; // can't reverse into yourself
        if (game.queue.length < 3) game.queue.push(d);
        return;
      }
      if (!e.key.startsWith('Arrow') || e.repeat) return;
      e.preventDefault();
      const d = dirFromKey(e.key);
      if (d) startSantaGame(d);
    };
    window.addEventListener('keydown', onKeyDown);

    const spawn = () => {
      flakesRef.current.push({
        x: Math.random() * width,
        y: -4,
        r: 1 + Math.random() * 2.5,
        vy: 0.4 + Math.random() * 1.2,
        vx: (Math.random() - 0.5) * 0.4,
        o: 0.5 + Math.random() * 0.5,
      });
    };

    let frameCount = 0;
    let lastNow = performance.now();
    const tick = (now: number) => {
      // Pause the particle loop while the tab is hidden (browsers only throttle
      // rAF); the visibilitychange handler below restarts it on return.
      if (document.hidden) {
        rafRef.current = null;
        return;
      }
      const dt = Math.min(100, Math.max(0, now - lastNow));
      lastNow = now;
      ctx.clearRect(0, 0, width, height);
      const heights = heightsRef.current!;

      if (performance.now() - mouse.lastMove > 60) {
        mouse.vx *= 0.6;
        mouse.vy *= 0.6;
      }
      const speed = Math.hypot(mouse.vx, mouse.vy);

      frameCount++;
      if (frameCount % 20 === 0) {
        mediaRectsRef.current = Array.from(
          document.querySelectorAll('video, img')
        )
          .filter((el) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            return rect.width >= 80 && rect.height >= 80;
          })
          .map((el) => (el as HTMLElement).getBoundingClientRect());
      }

      if (flakesRef.current.length < MAX_FLAKES && Math.random() < 0.6) spawn();

      const sleighPush = santaGameRef.current;
      const flakes = flakesRef.current;
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i];

        if (mouse.active) {
          const dx = f.x - mouse.x;
          const dy = f.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < PUSH_RADIUS * PUSH_RADIUS) {
            const d = Math.sqrt(d2) || 1;
            const falloff = 1 - d / PUSH_RADIUS;
            const force = 0.6 + speed * 0.08;
            f.vx += (dx / d) * falloff * force;
            const vertical = (dy / d) * falloff * force * 0.4;
            if (vertical > 0) f.vy += vertical;
          }
        }
        // The sleigh's slipstream shoulders flakes aside as it roars past.
        if (sleighPush && sleighPush.deadAt === null) {
          const dx = f.x - sleighPush.px;
          const dy = f.y - sleighPush.py;
          const d2 = dx * dx + dy * dy;
          if (d2 < 80 * 80) {
            const d = Math.sqrt(d2) || 1;
            const falloff = 1 - d / 80;
            f.vx += (dx / d) * falloff * 1.3;
            f.vy += (dy / d) * falloff * 0.4;
          }
        }
        f.vx *= 0.94;
        if (f.vy > 1.6) f.vy *= 0.96;
        const minFall = 0.3 + f.r * 0.15;
        if (f.vy < minFall) f.vy = minFall;

        f.y += f.vy;
        f.x += f.vx + Math.sin((f.y + i) * 0.01) * 0.3;
        if (f.x < -10) f.x = width + 10;
        if (f.x > width + 10) f.x = -10;

        const col = Math.max(0, Math.min(cols - 1, Math.floor(f.x / BUCKET)));
        const ground = height - heights[col];
        if (f.y + f.r >= ground) {
          const add = (1.2 + f.r * 0.6) * 1.75;
          heights[col] = Math.min(MAX_PILE, heights[col] + add);
          if (col > 0) heights[col - 1] = Math.min(MAX_PILE, heights[col - 1] + add * 0.5);
          if (col < cols - 1)
            heights[col + 1] = Math.min(MAX_PILE, heights[col + 1] + add * 0.5);
          flakes.splice(i, 1);
          continue;
        }
        const overMedia = mediaRectsRef.current.some(
          (r) => f.x >= r.left && f.x <= r.right && f.y >= r.top && f.y <= r.bottom
        );
        if (overMedia) {
          // Soft melt: fade opacity + shrink until gone
          f.o *= 0.9;
          f.r *= 0.985;
          if (f.o < 0.04 || f.r < 0.3) {
            flakes.splice(i, 1);
            continue;
          }
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${f.o})`;
        ctx.fill();
      }

      // Wipe ground pile when pointer rubs through it.
      if (mouse.active && speed > 0.5) {
        const radiusCols = Math.ceil(WIPE_RADIUS / BUCKET);
        const centerCol = Math.floor(mouse.x / BUCKET);
        const wipeStrength = Math.min(8, 0.6 + speed * 0.25);
        for (let i = -radiusCols; i <= radiusCols; i++) {
          const c = centerCol + i;
          if (c < 0 || c >= cols) continue;
          const colX = c * BUCKET + BUCKET / 2;
          const surfaceY = height - heights[c];
          if (mouse.y < surfaceY - 12) continue;
          const dx = colX - mouse.x;
          const falloff = Math.max(0, 1 - Math.abs(dx) / WIPE_RADIUS);
          heights[c] = Math.max(0, heights[c] - wipeStrength * falloff);
        }
      }

      // Smooth ground pile.
      if (cols > 2) {
        let prev = heights[0];
        for (let i = 1; i < cols - 1; i++) {
          const cur = heights[i];
          const next = heights[i + 1];
          heights[i] = cur * 0.7 + (prev + next) * 0.15;
          prev = cur;
        }
      }

      // Blown particles.
      const blow = blowRef.current;
      for (let i = blow.length - 1; i >= 0; i--) {
        const b = blow[i];
        b.vy += 0.08;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.o *= 0.985;
        if (b.y + b.r >= height - heights[Math.max(0, Math.min(cols - 1, Math.floor(b.x / BUCKET)))]) {
          const col = Math.max(0, Math.min(cols - 1, Math.floor(b.x / BUCKET)));
          const add = (0.8 + b.r * 0.4) * 1.2;
          heights[col] = Math.min(MAX_PILE, heights[col] + add);
          blow.splice(i, 1);
          continue;
        }
        if (b.o < 0.04 || b.x < -20 || b.x > width + 20 || b.y > height + 20) {
          blow.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${b.o})`;
        ctx.fill();
      }

      tickMusic();

      // ── Santa Snake ─────────────────────────────────────────────────
      const game = santaGameRef.current;
      const santaImg = santaImgRef.current;
      const giftImg = giftImgRef.current;
      const sackImg = sackImgRef.current;
      if (game) {
        game.t++;
        if (game.goFlash > 0) game.goFlash--;
        if (game.countdown > 0 && game.deadAt === null) {
          // Sitting on the start line while 5·4·3·2·1 ticks down in time with the music.
          const before = game.countdown;
          game.countdown = Math.max(0, game.countdown - dt);
          const beforeN = Math.ceil(before / 1000);
          const afterN = Math.ceil(game.countdown / 1000);
          if (afterN < beforeN) {
            if (game.countdown <= 0) {
              game.goFlash = 46; // liftoff!
              beep(1245, 0, 0.22, 'triangle', 0.14);
              beep(1660, 0.04, 0.26, 'triangle', 0.1);
            } else {
              beep(760, 0, 0.1, 'triangle', 0.1); // 4·3·2·1
            }
          }
          game.acc = 0;
        } else if (game.deadAt === null) {
          game.acc += dt;
          while (game.acc >= game.stepMs && game.deadAt === null) {
            game.acc -= game.stepMs;
            stepSnake(game);
          }
        }
        const alpha = game.deadAt === null ? Math.min(1, game.acc / game.stepMs) : 1;

        // Ease the harness heading and the nose-up/down lean toward the logical direction.
        const targetHeading = Math.atan2(game.dir.y, game.dir.x);
        let dh = targetHeading - game.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        game.heading += dh * 0.2;
        game.lean += (game.dir.y * 0.35 - game.lean) * 0.12;
        if (game.dir.x !== 0) game.facing = game.dir.x as 1 | -1;

        const dead = game.deadAt !== null;
        const shake = dead && game.t - game.deadAt! < 14 ? 1 - (game.t - game.deadAt!) / 14 : 0;
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);

        if (!dead) {
          const hpRaw = segPix(game, 0, alpha);
          const hp = normPix(game, hpRaw);
          game.px = hp.x;
          game.py = hp.y;
          const ux = Math.cos(game.heading);
          const uy = Math.sin(game.heading);

          // Powder kicked up in the sleigh's wake (only once it's actually moving).
          if (game.countdown <= 0 && game.t % 2 === 0) {
            blowRef.current.push({
              x: hp.x - ux * 52 + (Math.random() - 0.5) * 16,
              y: hp.y + 10 + (Math.random() - 0.5) * 12,
              vx: -ux * (1.5 + Math.random() * 1.5),
              vy: -0.3 - Math.random() * 0.9,
              r: 0.8 + Math.random() * 1.4,
              o: 0.35 + Math.random() * 0.25,
            });
          }

          // The present, glowing so it reads over any page content.
          {
            const gp = { x: game.ox + (game.gift.c + 0.5) * CELL, y: game.oy + (game.gift.r + 0.5) * CELL };
            const pulse = 1 + Math.sin(game.t * 0.1) * 0.08;
            const gs = GIFT_SIZE * pulse;
            drawWrapped(game, gp.x, gp.y, CELL * 1.5, (xx, yy) => {
              const glow = ctx.createRadialGradient(xx, yy, 0, xx, yy, gs * 1.15);
              glow.addColorStop(0, 'rgba(255,220,130,0.4)');
              glow.addColorStop(1, 'rgba(255,220,130,0)');
              ctx.fillStyle = glow;
              ctx.beginPath();
              ctx.arc(xx, yy, gs * 1.15, 0, Math.PI * 2);
              ctx.fill();
              if (giftImg && giftImg.complete && giftImg.naturalWidth > 0) {
                ctx.drawImage(giftImg, xx - gs / 2, yy - gs / 2, gs, gs);
              } else {
                ctx.font = `${Math.round(gs)}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🎁', xx, yy);
              }
            });
            if (game.t % 40 === 0) {
              for (let k = 0; k < 3; k++) {
                const a = Math.random() * Math.PI * 2;
                game.sparkles.push({
                  x: gp.x + Math.cos(a) * gs * 0.6,
                  y: gp.y + Math.sin(a) * gs * 0.6,
                  vx: Math.cos(a) * 0.7,
                  vy: Math.sin(a) * 0.7 - 0.4,
                  o: 0.8,
                  r: 1 + Math.random() * 1.4,
                });
              }
            }
          }

          // Segment pixel positions (head + sack train), then the tow rope beneath them.
          const segs: Array<{ x: number; y: number }> = [];
          for (let i = 0; i < game.body.length; i++) segs.push(normPix(game, segPix(game, i, alpha)));
          ctx.save();
          ctx.strokeStyle = 'rgba(62,40,20,0.55)';
          ctx.lineWidth = 2;
          for (let i = 0; i < segs.length - 1; i++) {
            const a = segs[i];
            const b = segs[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (dx * dx + dy * dy > CELL * 2 * (CELL * 2)) continue; // don't rope across the wrap seam
            ctx.beginPath();
            ctx.moveTo(a.x, a.y + 6);
            ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 7, b.x, b.y + 6);
            ctx.stroke();
          }
          ctx.restore();

          // The sack train — every present rides in its own pixel-art sack.
          for (let i = segs.length - 1; i >= 1; i--) {
            const p = segs[i];
            const s = sackSize(game, i);
            const sway = Math.sin(game.t * 0.12 + i * 0.8) * 0.07;
            const bobS = Math.sin(game.t * 0.14 + i * 1.1) * 1.5;
            drawWrapped(game, p.x, p.y + bobS, 70, (xx, yy) => {
              ctx.save();
              ctx.beginPath();
              ctx.ellipse(xx + 2, yy + s * 0.42, s * 0.42, s * 0.16, 0, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(0,0,0,0.14)';
              ctx.fill();
              ctx.translate(xx, yy);
              ctx.rotate(sway);
              if (sackImg && sackImg.complete && sackImg.naturalWidth > 0) {
                ctx.drawImage(sackImg, -s / 2, -s / 2, s, s);
              } else {
                ctx.beginPath();
                ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
                ctx.fillStyle = '#8a5a2c';
                ctx.fill();
              }
              ctx.restore();
            });
          }

          // Timers for the sleigh's little performances.
          if (game.flash > 0) game.flash--;
          if (game.hop > 0) game.hop--;
          if (game.celebrate > 0) game.celebrate--;
          const celebrating = game.celebrate > 0;
          const wobble = Math.sin(game.t * 0.15) * 0.06 + (celebrating ? Math.sin(game.t * 0.5) * 0.1 : 0);
          const bob = Math.sin(game.t * 0.12) * 4 - Math.sin((1 - game.hop / 14) * Math.PI) * game.hop * 0.9;
          const pop = 1 + (game.flash / 16) * 0.22 + Math.sin(game.t * 0.3) * 0.02 + (celebrating ? 0.12 : 0);

          drawWrapped(game, hp.x, hp.y, 300, (xx, yy) => {
            // No extra team: Rudolph is hitched to the sleigh in the sprite itself — the one
            // bright-nosed reindeer right in front of Santa. His nose glow is drawn below.

            // Santa, sleigh and Rudolph — wobbling merrily, hopping + flashing on pickups.
            if (celebrating) {
              const gl = ctx.createRadialGradient(xx, yy, 0, xx, yy, 90);
              gl.addColorStop(0, 'rgba(255,225,140,0.35)');
              gl.addColorStop(1, 'rgba(255,225,140,0)');
              ctx.fillStyle = gl;
              ctx.beginPath();
              ctx.arc(xx, yy, 90, 0, Math.PI * 2);
              ctx.fill();
            }
            if (santaImg && santaImg.complete && santaImg.naturalWidth > 0) {
              ctx.save();
              ctx.translate(xx, yy + bob);
              if (game.facing === -1) ctx.scale(-1, 1);
              ctx.rotate(game.lean + wobble);
              ctx.scale(pop, pop);
              ctx.drawImage(santaImg, -SANTA_W / 2, -SANTA_H / 2, SANTA_W, SANTA_H);
              // Rudolph's nose (in the sprite) gets a big, bright pulsing glow — he's the star now.
              const noseX = SANTA_W * 0.4;
              const noseY = -SANTA_H * 0.03;
              const nosePulse = Math.sin(game.t * 0.25);
              const glowR = 17 + nosePulse * 4;
              const ng = ctx.createRadialGradient(noseX, noseY, 0, noseX, noseY, glowR);
              ng.addColorStop(0, 'rgba(255,130,120,0.95)');
              ng.addColorStop(0.4, 'rgba(255,55,48,0.6)');
              ng.addColorStop(1, 'rgba(255,45,45,0)');
              ctx.fillStyle = ng;
              ctx.beginPath();
              ctx.arc(noseX, noseY, glowR, 0, Math.PI * 2);
              ctx.fill();
              // White-hot core so the nose reads as a bright point, not just a haze.
              ctx.beginPath();
              ctx.arc(noseX, noseY, 2.8 + nosePulse * 0.7, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255,230,225,0.95)';
              ctx.fill();
              ctx.restore();
            }
          });
        } else {
          // Death scene: the wrecked sleigh cartwheels away while crying Santa tumbles the other way.
          if (game.t - game.deadAt! < 12) {
            ctx.fillStyle = `rgba(200,30,30,${0.35 * (1 - (game.t - game.deadAt!) / 12)})`;
            ctx.fillRect(0, 0, width, height);
          }
          for (let i = game.debris.length - 1; i >= 0; i--) {
            const d = game.debris[i];
            d.vy += 0.28;
            d.x += d.vx;
            d.y += d.vy;
            d.rot += d.vr;
            d.o *= 0.988;
            if (d.o < 0.05 || d.y > height + 160) {
              game.debris.splice(i, 1);
              continue;
            }
            const img = d.kind === 'sack' ? sackImg : giftImg;
            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.rotate(d.rot);
            ctx.globalAlpha = d.o;
            if (img && img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, -d.size / 2, -d.size / 2, d.size, d.size);
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, d.size * 0.4, 0, Math.PI * 2);
              ctx.fillStyle = d.kind === 'sack' ? '#8a5a2c' : '#e0453f';
              ctx.fill();
            }
            ctx.restore();
          }
          const wreck = game.wreck;
          if (santaImg && santaImg.complete && santaImg.naturalWidth > 0 && wreck) {
            wreck.vy += 0.3;
            wreck.x += wreck.vx;
            wreck.y += wreck.vy;
            wreck.rot += 0.12;
            ctx.save();
            ctx.translate(wreck.x, wreck.y);
            ctx.rotate(wreck.rot);
            ctx.globalAlpha = 0.9;
            ctx.drawImage(santaImg, -SANTA_W / 2, -SANTA_H / 2, SANTA_W, SANTA_H);
            ctx.restore();
          }
          const jump = game.jump;
          const cryImg = santaCryImgRef.current;
          if (jump) {
            jump.vy += 0.35;
            jump.x += jump.vx;
            jump.y += jump.vy;
            jump.rot += 0.14;
            if (game.t % 3 === 0) {
              game.tears.push({
                x: jump.x,
                y: jump.y - 20,
                vx: (Math.random() - 0.5) * 3.5,
                vy: -1 - Math.random() * 2.5,
                o: 1,
              });
            }
            const size = 84;
            ctx.save();
            ctx.translate(jump.x, jump.y);
            ctx.rotate(jump.rot);
            if (cryImg && cryImg.complete && cryImg.naturalWidth > 0) {
              ctx.drawImage(cryImg, -size / 2, -size / 2, size, size);
            } else {
              ctx.font = `${size}px serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('😭', 0, 0);
            }
            ctx.restore();
          }
          for (let i = game.tears.length - 1; i >= 0; i--) {
            const tear = game.tears[i];
            tear.vy += 0.15;
            tear.x += tear.vx;
            tear.y += tear.vy;
            tear.o *= 0.96;
            if (tear.o < 0.05) {
              game.tears.splice(i, 1);
              continue;
            }
            ctx.beginPath();
            ctx.arc(tear.x, tear.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(120,190,255,${tear.o})`;
            ctx.fill();
          }
        }

        // Golden pickup sparkles (drawn over sleigh, in life and death).
        for (let i = game.sparkles.length - 1; i >= 0; i--) {
          const sp = game.sparkles[i];
          sp.vy += 0.08;
          sp.vx *= 0.98;
          sp.x += sp.vx;
          sp.y += sp.vy;
          sp.o *= 0.95;
          if (sp.o < 0.05) {
            game.sparkles.splice(i, 1);
            continue;
          }
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,215,120,${sp.o})`;
          ctx.fill();
        }

        // Floating cheer / wail bubbles.
        for (let i = game.pops.length - 1; i >= 0; i--) {
          const pop = game.pops[i];
          pop.y += pop.vy;
          pop.o -= 0.012;
          if (pop.o <= 0) {
            game.pops.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.font = `800 ${pop.size}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3;
          ctx.strokeStyle = `rgba(90,30,30,${pop.o * 0.6})`;
          ctx.fillStyle = `rgba(255,240,180,${pop.o})`;
          ctx.strokeText(pop.text, pop.x, pop.y);
          ctx.fillText(pop.text, pop.x, pop.y);
          ctx.restore();
        }

        ctx.restore(); // end screen shake

        // Pre-flight: name the team up top and punch a big 5·4·3·2·1 in the middle —
        // both kicking off in lockstep with the music.
        if (game.countdown > 0 && !dead) {
          const elapsed = 5000 - game.countdown;
          const fade = Math.min(1, elapsed / 350) * Math.min(1, game.countdown / 700);
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 8;
          ctx.font = '700 22px system-ui, sans-serif';
          ctx.fillStyle = `rgba(255,255,255,${fade})`;
          ctx.fillText('Hitch up the sleigh…', width / 2, height * 0.15);
          ctx.font = '800 24px system-ui, sans-serif';
          ctx.fillStyle = `rgba(255,90,90,${fade})`;
          ctx.fillText('🔴 Rudolph, light the way!', width / 2, height * 0.15 + 34);
          ctx.restore();

          // The digit itself — punches in large, settles, and eases out within each second.
          const n = Math.ceil(game.countdown / 1000);
          const within = 1 - (game.countdown % 1000 || 1000) / 1000; // 0→1 across the second
          const cx = width / 2;
          const cy = height * 0.46;
          const scale = 1.55 - 0.55 * Math.min(1, within * 2.4);
          const a = 1 - Math.pow(within, 2.6) * 0.9;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = `rgba(255,215,120,${(1 - within) * 0.5 * a})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(cx, cy, 66 + within * 46, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = 22;
          ctx.font = `900 ${Math.round(128 * scale)}px system-ui, sans-serif`;
          ctx.lineWidth = 7;
          ctx.strokeStyle = `rgba(120,25,25,${0.85 * a})`;
          ctx.fillStyle = `rgba(255,255,255,${0.98 * a})`;
          ctx.strokeText(String(n), cx, cy);
          ctx.fillText(String(n), cx, cy);
          ctx.restore();
        }
        // "GO!" burst as the sleigh takes off.
        if (game.goFlash > 0 && !dead) {
          const k = game.goFlash / 46; // 1→0
          const scale = 1 + (1 - k) * 0.6;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = 22;
          ctx.font = `900 ${Math.round(96 * scale)}px system-ui, sans-serif`;
          ctx.lineWidth = 7;
          ctx.strokeStyle = 'rgba(20,90,40,0.9)';
          ctx.fillStyle = 'rgba(120,240,150,0.98)';
          ctx.strokeText('GO!', width / 2, height * 0.46);
          ctx.fillText('GO!', width / 2, height * 0.46);
          ctx.restore();
        }

        // HUD.
        ctx.save();
        ctx.textAlign = 'center';
        if (dead) {
          const board = leaderboardRef.current;
          const rowsToShow = Math.min(8, board.length);
          const cx = width / 2;
          const cardW = 468;
          const rowH = 27;
          const headH = 150; // crash + delivered + best
          const boardH = rowsToShow > 0 ? 30 + rowsToShow * rowH : 30;
          const footH = 44;
          const cardH = headH + boardH + footH;
          const top = Math.max(16, height * 0.5 - cardH / 2);

          ctx.fillStyle = 'rgba(8,18,36,0.82)';
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cx - cardW / 2, top, cardW, cardH, 20);
          ctx.fill();
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '800 32px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255,120,120,0.98)';
          ctx.fillText('💥 Santa crashed!', cx, top + 38);
          ctx.font = '700 21px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fillText(`🎁 × ${game.score} delivered`, cx, top + 78);
          ctx.font = '700 15px system-ui, sans-serif';
          if (game.newBest) {
            ctx.fillStyle = `rgba(255,214,90,${0.75 + Math.sin(game.t * 0.2) * 0.25})`;
            ctx.fillText('🎉 NEW PERSONAL BEST!', cx, top + 112);
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText(`your best ${game.best}`, cx, top + 112);
          }

          // All-time leaderboard.
          const boardTop = top + headH;
          if (rowsToShow > 0) {
            ctx.textAlign = 'center';
            ctx.font = '700 11px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(160,200,255,0.7)';
            ctx.fillText('ALL-TIME LEADERBOARD', cx, boardTop + 6);
            const me = authRef.current.walletAddress?.toLowerCase() || null;
            const leftX = cx - cardW / 2 + 28;
            const rightX = cx + cardW / 2 - 28;
            for (let i = 0; i < rowsToShow; i++) {
              const row = board[i];
              const isMe = !!me && row.wallet_address?.toLowerCase() === me;
              const ry = boardTop + 24 + i * rowH + rowH / 2;
              if (isMe) {
                ctx.fillStyle = 'rgba(255,214,90,0.15)';
                ctx.beginPath();
                ctx.roundRect(cx - cardW / 2 + 14, ry - rowH / 2 + 2, cardW - 28, rowH - 4, 8);
                ctx.fill();
              }
              const rank = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;
              const rawName = (row.username && row.username.trim()) || shortWallet(row.wallet_address);
              const name = rawName.length > 22 ? `${rawName.slice(0, 21)}…` : rawName;
              ctx.textAlign = 'left';
              ctx.font = `${isMe ? '800' : '600'} 15px system-ui, sans-serif`;
              ctx.fillStyle = isMe ? 'rgba(255,228,150,0.98)' : 'rgba(255,255,255,0.9)';
              ctx.fillText(rank, leftX, ry);
              ctx.fillText(name, leftX + 30, ry);
              ctx.textAlign = 'right';
              ctx.fillStyle = isMe ? 'rgba(255,228,150,0.98)' : 'rgba(150,220,255,0.95)';
              ctx.fillText(`🎁 ${row.score}`, rightX, ry);
            }
          } else {
            ctx.textAlign = 'center';
            ctx.font = '600 13px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(
              authRef.current.isAuthenticated
                ? 'No scores yet — you could be #1!'
                : 'Connect your wallet to join the leaderboard',
              cx,
              boardTop + 14
            );
          }

          ctx.textAlign = 'center';
          if (game.t - game.deadAt! > RESTART_DELAY) {
            ctx.font = '500 13px system-ui, sans-serif';
            ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(game.t * 0.08) * 0.2})`;
            ctx.fillText('press any arrow to fly again · Esc to quit', cx, top + cardH - 22);
          }
        } else {
          const label = game.best > 0 ? `🎁 ${game.score}   ·   best ${game.best}` : `🎁 ${game.score}`;
          ctx.font = '700 17px system-ui, sans-serif';
          const tw = ctx.measureText(label).width;
          const pillW = tw + 36;
          const pillH = 34;
          ctx.fillStyle = 'rgba(8,18,36,0.55)';
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(width / 2 - pillW / 2, 12, pillW, pillH, 999);
          ctx.fill();
          ctx.stroke();
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fillText(label, width / 2, 12 + pillH / 2 + 1);
          if (game.t < 420) {
            const hintFade = Math.min(1, (420 - game.t) / 60);
            ctx.font = '500 12px system-ui, sans-serif';
            ctx.fillStyle = `rgba(255,255,255,${0.55 * hintFade})`;
            ctx.fillText('arrows / WASD steer · Esc quits', width / 2, 12 + pillH + 14);
          }
        }
        ctx.restore();

        // After a long lie in the snow, pack up quietly (music has already faded).
        if (game.deadAt !== null && game.t - game.deadAt > 720) santaGameRef.current = null;
      }

      // Draw ground drift.
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, height - heights[0]);
      for (let i = 0; i < cols - 1; i++) {
        const x1 = i * BUCKET + BUCKET / 2;
        const x2 = (i + 1) * BUCKET + BUCKET / 2;
        const y1 = height - heights[i];
        const y2 = height - heights[i + 1];
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        ctx.quadraticCurveTo(x1, y1, cx, cy);
      }
      ctx.lineTo(width, height - heights[cols - 1]);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (!document.hidden && rafRef.current === null) {
        lastNow = performance.now();
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      santaGameRef.current = null;
      if (music.el) {
        music.el.pause();
        music.el.src = '';
        music.el = null;
      }
      if (audioCtx) {
        void audioCtx.close();
        audioCtx = null;
      }
    };
  }, [theme]);

  if (theme !== 'winter') return null;
  if (pathname === '/prompt') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9998 }}
    />
  );
}
