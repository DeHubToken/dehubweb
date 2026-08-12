/*
 * Arcade touch controls
 * =====================
 * A virtual stick, a look-drag surface and a row of action buttons, for the two
 * arcade games that were built for a mouse and a keyboard and have no control
 * scheme of their own for a finger.
 *
 * WHY THIS IS HERE AND NOT IN EITHER GAME
 * ---------------------------------------
 * `public/war-game/` and `public/jungle-game/` are vendored copies of upstream
 * projects, and the rule for both is that a re-vendor should be as close to a
 * straight copy as possible — the jungle build is literally upstream's `src/`
 * untouched, and the war build is a minified bundle nobody can hand-edit. Two
 * near-identical copies of this file inside those directories would be deleted
 * by the next re-vendor and would have to be written again, twice.
 *
 * So it lives outside them. Each game's `index.html` loads it and supplies a
 * ~40-line adapter saying what its own engine wants; everything below is shared.
 * That also means a bug in the feel of the stick is fixed once.
 *
 * It is a CLASSIC script, deliberately. A `<script type="module">` in the
 * arcade's sandboxed frame is fetched in CORS mode with `Origin: null` and is
 * dropped without a word unless `_headers` grants it — a failure that has cost
 * this repo two debugging sessions (see the long note in `public/_headers`).
 * A classic script is not fetched in CORS mode and cannot fail that way.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It never activates on a device with a real pointer. Everything below is
 * behind one `matchMedia` check, so a desktop player's experience of these
 * games is byte-for-byte what it was: no listeners, no DOM, no cost.
 */
(function () {
  'use strict';

  /*
   * Coarse pointer AND no hover. Both halves matter: `pointer: coarse` alone is
   * true for a touchscreen laptop, where the player almost certainly still has
   * the trackpad and would rather use it, and `hover: none` alone is true for
   * some TV browsers with a d-pad that this would not help either. A phone and
   * a tablet answer yes to both.
   *
   * `maxTouchPoints` is the fallback for a browser that reports neither, which
   * is rare but is exactly the case where guessing "desktop" would leave the
   * player with a game they cannot move in — and an unnecessary stick on a
   * desktop is a much cheaper mistake than no controls on a phone.
   */
  function isTouchDevice() {
    try {
      if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
      if (window.matchMedia && window.matchMedia('(any-pointer: fine)').matches) return false;
    } catch (e) { /* a browser without matchMedia falls through to the count */ }
    return (navigator.maxTouchPoints || 0) > 0;
  }

  /** How far from its origin the stick has to travel to read as fully deflected. */
  var STICK_RANGE = 46;
  /** Resting size of the stick base, and of each action button. */
  var STICK_SIZE = 116;

  var CSS = [
    '.at-root{position:fixed;inset:0;z-index:5;pointer-events:none;',
    /* The games own the viewport and neither scrolls. Without this a drag to
       look is also a page pan on iOS, and a two-finger move (walk while
       looking) is a pinch-zoom. */
    '  touch-action:none;-webkit-user-select:none;user-select:none;',
    '  -webkit-tap-highlight-color:transparent;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;}',
    /* The two halves of the screen. The move zone is the narrower one: a thumb
       reaching across from the left needs less room than the sweep a look drag
       wants, and buttons live over the look zone anyway. */
    '.at-zone{position:absolute;top:0;bottom:0;pointer-events:auto;touch-action:none;}',
    '.at-zone-move{left:0;width:42%;}',
    '.at-zone-look{right:0;width:58%;}',
    '.at-stick{position:absolute;width:' + STICK_SIZE + 'px;height:' + STICK_SIZE + 'px;',
    '  margin:-' + STICK_SIZE / 2 + 'px 0 0 -' + STICK_SIZE / 2 + 'px;border-radius:50%;',
    '  border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);',
    '  transition:opacity .18s ease;pointer-events:none;}',
    '.at-knob{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;',
    '  border-radius:50%;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.34);}',
    /* row-reverse + wrap-reverse puts the FIRST button in the list at the
       bottom-right, where the thumb already rests, and lets the rest stack up
       and leftwards from there. Declaring the primary action first in the
       adapter is then all a game has to do to get it under the thumb. */
    '.at-buttons{position:absolute;right:16px;bottom:18px;display:flex;',
    /* `wrap-reverse` flips the cross axis, so flex-START is the visual bottom.
       With flex-end the smaller buttons hung level with the top of the big one
       and the cluster's lower edge came out ragged — measured at 375x812. */
    '  flex-direction:row-reverse;flex-wrap:wrap-reverse;justify-content:flex-start;',
    /* Capped to the look zone it sits over, minus its own right inset. Without
       this the cluster reached across the divide on a narrow phone and put a
       button on top of the resting stick — measured at 375x812, where the last
       button of five overlapped it by 8px. The buttons take pointer events, so
       that is a thumb reaching to walk and jumping instead. */
    '  align-items:flex-start;gap:10px;width:min(60vw,340px);max-width:calc(58vw - 32px);',
    '  pointer-events:none;}',
    '.at-btn{pointer-events:auto;touch-action:none;display:grid;place-items:center;',
    '  border-radius:50%;color:rgba(255,255,255,.82);text-transform:uppercase;letter-spacing:.06em;',
    '  border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.34);',
    '  -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);}',
    '.at-btn[data-size="lg"]{width:78px;height:78px;font-size:12px;}',
    '.at-btn[data-size="md"]{width:60px;height:60px;}',
    '.at-btn[data-held="1"]{background:rgba(255,255,255,.26);color:#fff;border-color:rgba(255,255,255,.5);}',
  ].join('');

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  /**
   * Build the layer and start listening.
   *
   * @param {object} cfg
   * @param {Array}  cfg.buttons  `{ id, label, size }` — order is bottom-right outwards.
   * @param {function(number,number)} cfg.onLook   Look drag, in CSS pixels since the last move.
   * @param {function(string,boolean)} cfg.onButton Button id and whether it is now down.
   * @returns {{move:{x:number,y:number}, active:boolean, destroy:function}|null}
   *          `move` is live and mutated in place — read it every frame rather
   *          than holding a copy. Null when the device has a real pointer.
   */
  function mount(cfg) {
    if (!isTouchDevice()) return null;
    cfg = cfg || {};

    var onLook = cfg.onLook || function () {};
    var onButton = cfg.onButton || function () {};

    /* Mutated in place, never reassigned: the adapters read this object once at
       mount and then poll `.x`/`.y` from inside their own frame loop. */
    var move = { x: 0, y: 0 };

    var style = el('style', null, document.head);
    style.textContent = CSS;

    var root = el('div', 'at-root', document.body);
    var moveZone = el('div', 'at-zone at-zone-move', root);
    var lookZone = el('div', 'at-zone at-zone-look', root);

    var stick = el('div', 'at-stick', moveZone);
    var knob = el('div', 'at-knob', stick);
    /* A resting home in the lower-left corner of the zone. The stick re-homes
       to wherever the thumb actually lands (below), so this position is only
       ever a suggestion — but without something drawn there, the control is
       invisible until you happen to touch the right part of the screen. */
    var HOME_INSET = STICK_SIZE * 0.72;
    function placeStick(x, y) {
      stick.style.left = x + 'px';
      stick.style.top = y + 'px';
    }
    function restStick() {
      placeStick(HOME_INSET, moveZone.clientHeight - HOME_INSET);
      knob.style.transform = '';
      stick.style.opacity = '.55';
      move.x = 0;
      move.y = 0;
    }

    var buttonsWrap = el('div', 'at-buttons', root);
    var buttons = cfg.buttons || [];
    var btnNodes = {};
    for (var i = 0; i < buttons.length; i++) {
      var spec = buttons[i];
      var b = el('div', 'at-btn', buttonsWrap);
      b.setAttribute('data-size', spec.size || 'md');
      b.setAttribute('data-id', spec.id);
      b.textContent = spec.label;
      btnNodes[spec.id] = b;
    }

    /* One entry per finger currently down, keyed by pointerId. Multitouch is
       the whole point here — walking while looking while firing is three
       simultaneous pointers, and tracking only the latest would make the stick
       jump to the look finger the moment it moved. */
    var active = Object.create(null);
    /** Mirrors the root's display, so setVisible can no-op on a repeat call. */
    var shown = true;

    function startMove(id, x, y) {
      /* The stick homes to the thumb rather than the thumb reaching for the
         stick. A fixed origin is a constant small aiming task on a screen whose
         size and grip this code cannot know. */
      var r = moveZone.getBoundingClientRect();
      active[id] = { kind: 'move', ox: x - r.left, oy: y - r.top };
      placeStick(x - r.left, y - r.top);
      stick.style.opacity = '1';
      updateMove(id, x, y);
    }

    function updateMove(id, x, y) {
      var t = active[id];
      var r = moveZone.getBoundingClientRect();
      var dx = (x - r.left) - t.ox;
      var dy = (y - r.top) - t.oy;
      var len = Math.hypot(dx, dy);
      /* Past the range the stick pins to the rim instead of continuing to
         report >1. Clamping the VECTOR rather than each axis keeps a diagonal
         at full speed — clamping per axis would make the corners of the square
         reach 1.41x and turn diagonal movement into the fastest direction. */
      if (len > STICK_RANGE) {
        dx = dx / len * STICK_RANGE;
        dy = dy / len * STICK_RANGE;
      }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      move.x = dx / STICK_RANGE;
      move.y = dy / STICK_RANGE;
    }

    function startLook(id, x, y) {
      active[id] = { kind: 'look', lx: x, ly: y };
    }

    function updateLook(id, x, y) {
      var t = active[id];
      onLook(x - t.lx, y - t.ly);
      t.lx = x;
      t.ly = y;
    }

    function setHeld(node, id, down) {
      node.setAttribute('data-held', down ? '1' : '0');
      onButton(id, down);
    }

    function onDown(e) {
      var target = e.target;
      var btnId = target && target.getAttribute && target.getAttribute('data-id');
      if (btnId) {
        active[e.pointerId] = { kind: 'btn', id: btnId };
        setHeld(target, btnId, true);
      } else if (moveZone.contains(target)) {
        startMove(e.pointerId, e.clientX, e.clientY);
      } else {
        startLook(e.pointerId, e.clientX, e.clientY);
      }
      /* Capture on the ROOT, not on the element under the finger: a look drag
         that begins on the right and sweeps across the stick must keep being a
         look drag, and a thumb that slides off a fire button should keep
         firing until it lifts — which is how a physical button behaves. */
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* pre-capture browsers cope without it */ }
      e.preventDefault();
    }

    function onMove(e) {
      var t = active[e.pointerId];
      if (!t) return;
      if (t.kind === 'move') updateMove(e.pointerId, e.clientX, e.clientY);
      else if (t.kind === 'look') updateLook(e.pointerId, e.clientX, e.clientY);
      e.preventDefault();
    }

    function onUp(e) {
      var t = active[e.pointerId];
      if (!t) return;
      delete active[e.pointerId];
      if (t.kind === 'move') restStick();
      else if (t.kind === 'btn' && btnNodes[t.id]) setHeld(btnNodes[t.id], t.id, false);
      try { root.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    }

    /*
     * Everything is bound on the root with capture, so a button's own listeners
     * are not needed and a pointer is tracked even after it leaves the element
     * it started on. `pointercancel` matters more than it looks: the OS steals
     * a pointer for its own gestures (an edge swipe, the notification shade),
     * and without the release the game would be left holding a key down.
     */
    root.addEventListener('pointerdown', onDown, { passive: false });
    root.addEventListener('pointermove', onMove, { passive: false });
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);

    /* A held button whose page loses focus must not stay held. Same failure the
       jungle walker documents for keyboards: browsers do not promise a release. */
    function releaseAll() {
      for (var id in active) {
        var t = active[id];
        if (t.kind === 'btn' && btnNodes[t.id]) setHeld(btnNodes[t.id], t.id, false);
        delete active[id];
      }
      restStick();
    }
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) releaseAll();
    });

    window.addEventListener('resize', restStick);
    restStick();

    return {
      move: move,
      active: true,
      /*
       * Hide the controls without tearing them down. Both games disable input
       * while their pause menu is up, and a stick that is still drawn under a
       * menu invites a thumb that will do nothing. Releasing on the way out is
       * the important half: hiding a held fire button would otherwise leave the
       * engine holding the trigger for as long as the menu is open.
       *
       * Idempotent, because the callers poll rather than subscribe — they read
       * a flag off their engine every frame, and re-hiding an already-hidden
       * layer sixty times a second would be sixty pointless style writes and
       * sixty stick resets.
       */
      setVisible: function (visible) {
        visible = !!visible;
        if (visible === shown) return;
        shown = visible;
        if (!visible) releaseAll();
        root.style.display = visible ? '' : 'none';
      },
      destroy: function () {
        releaseAll();
        root.remove();
        style.remove();
        window.removeEventListener('blur', releaseAll);
        window.removeEventListener('resize', restStick);
      },
    };
  }

  window.ArcadeTouch = { mount: mount, isTouchDevice: isTouchDevice };
})();
