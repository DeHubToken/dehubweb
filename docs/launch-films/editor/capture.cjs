// Frame capture. Usage:
//   node capture.cjs --w 1920 --h 1080 --stills 4,8.2,13 --out stills/      (beats -> jpg stills)
//   node capture.cjs --w 1920 --h 1080 --from 0 --to 600 --out frames/       (frame range, with motion-blur subframes)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const fs = require('fs'), path = require('path');
const A = {}; for (let i = 2; i < process.argv.length; i += 2) A[process.argv[i].slice(2)] = process.argv[i + 1];
const W = +(A.w || 1920), H = +(A.h || 1080), FPS = 60, OUT = A.out || 'frames';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--allow-file-access-from-files', '--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none'] });
  const pg = await br.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  pg.on('console', m => { const s = m.text(); if (!s.startsWith('[vite]')) console.log('PAGE', s); });
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await pg.goto('file://' + path.join(__dirname, `film.html?w=${W}&h=${H}`));
  await pg.evaluate(() => window.ready);
  const cdp = await pg.context().newCDPSession(pg);
  const shot = async (file, t) => {
    await pg.evaluate(t => window.render(t), t);
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  if (A.events) fs.writeFileSync(A.events, JSON.stringify(await pg.evaluate(() => ({ ev: window.EVENTS, film: window.FILM }))));
  if (A.stills) {
    const B = 60 / 140;
    let si = 0; for (const b of A.stills.split(',').map(Number)) await shot(path.join(OUT, (A.idx ? String(si++).padStart(2, '0') + '_' : '') + `b${b.toFixed(2)}.jpg`), b * B);
  } else {
    const total = await pg.evaluate(() => window.FILM.TOTAL);
    const nF = Math.ceil(total * FPS);
    const from = +(A.from || 0), to = Math.min(nF, +(A.to || nF));
    const t0 = Date.now();
    for (let f = from; f < to; f++) {
      const t = f / FPS;
      const fx = await pg.evaluate(t => window.fxAt(t), t);
      const n = fx.mb;
      if (n <= 1) await shot(path.join(OUT, `f${String(f).padStart(5, '0')}_0.jpg`), t);
      else for (let j = 0; j < n; j++) await shot(path.join(OUT, `f${String(f).padStart(5, '0')}_${j}.jpg`), t + ((j + .5) / n - .5) * fx.sh / FPS);
      fs.writeFileSync(path.join(OUT, `f${String(f).padStart(5, '0')}.json`), JSON.stringify(fx));
      if ((f - from) % 60 === 0) console.log(`frame ${f}/${to} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    console.log('done', from, to, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  await br.close();
})();
