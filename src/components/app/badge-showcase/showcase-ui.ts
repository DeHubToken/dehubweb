/**
 * The look every badge showcase shares: chrome buttons, panel shape and the
 * resting tilt of dock thumbnails. Scoped CSS rather than global classes so
 * it only exists while a showcase is open.
 */

export const SHOWCASE_CSS = `@keyframes badge-showcase-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes badge-showcase-float{0%,100%{translate:0 0}50%{translate:0 -6px}}
.bs-chrome,.bs-chrome-dark{position:relative;overflow:hidden;isolation:isolate;transition:transform .15s ease,filter .2s ease}
.bs-chrome{color:#0b0c0e;text-shadow:0 1px 0 rgba(255,255,255,.6);background:linear-gradient(180deg,#fdfdfe 0%,#e1e4e8 16%,#a8adb5 47%,#eceef1 53%,#c2c6cc 78%,#f6f7f8 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.3),0 8px 20px -8px rgba(0,0,0,.85)}
.bs-chrome-dark{color:#f3f4f6;text-shadow:0 -1px 0 rgba(0,0,0,.55);background:linear-gradient(180deg,#50545b 0%,#2c2f34 45%,#15171a 55%,#2d3035 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),inset 0 -1px 0 rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.14),0 8px 20px -8px rgba(0,0,0,.85)}
.bs-chrome::before,.bs-chrome-dark::before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,.7) 50%,transparent 68%);transform:translateX(-130%);transition:transform .75s cubic-bezier(.16,1,.3,1)}
.bs-chrome-dark::before{background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,.22) 50%,transparent 68%)}
.bs-chrome:hover::before,.bs-chrome-dark:hover::before{transform:translateX(130%)}
.bs-chrome:hover,.bs-chrome-dark:hover{filter:brightness(1.07)}
.bs-chrome:active,.bs-chrome-dark:active{transform:translateY(1px)}
.bs-chrome:disabled,.bs-chrome-dark:disabled{cursor:default;filter:saturate(.4) brightness(.8)}
.bs-chrome:disabled::before,.bs-chrome-dark:disabled::before{display:none}
.bs-chrome:focus-visible,.bs-chrome-dark:focus-visible{outline:2px solid rgba(255,255,255,.7);outline-offset:2px}`;

/** Every panel in a details column shares one shape, so the edges line up. */
export const BENTO = 'rounded-2xl border p-3 transition-colors duration-300';
export const BENTO_IDLE = 'border-white/10 bg-white/[0.04]';
export const BENTO_LIT = 'border-white/20 bg-white/[0.07]';

/** Resting tilt of each dock thumbnail, in degrees; sets longer than this repeat it. */
export const TILTS = [-4, 6, -7, 5, -5, 7, -6, 4, -8, 6, -4, 7, -6];
export const tiltAt = (i: number) => TILTS[i % TILTS.length];
