import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { commitsDismiss } from '@/lib/video-hold-gestures';

function motionValue() {
  let value = 0;
  return { get: () => value, set: vi.fn((next: number) => { value = next; }) };
}

const source = readFileSync(resolve(__dirname, '../components/app/cards/ShortsViewer.tsx'), 'utf8');

// Execute the viewer's actual callbacks without mounting its unrelated sheets.
function viewer(overrides: Record<string, unknown> = {}) {
  const context = {
    useCallback: (callback: unknown) => callback,
    videoContainer: { getBoundingClientRect: () => ({ top: 100, height: 800 }) },
    window: { scrollY: 0, innerHeight: 800 }, isMobile: true, overlaysHidden: true, autoHidden: false, showComments: false,
    RESTORE_ZONE_TOP: 0.61, RESTORE_ZONE_BOTTOM: 0.85,
    setDragOffset: vi.fn(), resetDragOffset: vi.fn(), setOverlaysHidden: vi.fn(), setAutoHidden: vi.fn(),
    mini: { drag: vi.fn(() => false), finish: vi.fn(() => false), cancel: vi.fn() },
    goToNext: vi.fn(), goToPrev: vi.fn(), currentIndex: 3, holdOwnsGesture: { current: false },
    leaveY: motionValue(), animate: vi.fn(), leaveViewer: vi.fn(), DISMISS_SPRING: {}, commitsDismiss, ...overrides,
  };
  const callbacks = source.slice(source.indexOf('  const isRestoreDrag ='), source.indexOf('  // Toggle play/pause'));
  const code = ts.transpileModule(callbacks + '\n({ handleDrag, handleDragEnd })', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return { ...context, ...runInNewContext(code, context) };
}

function drag(startY: number, y: number, x = 0) {
  return { point: { x: 150 + x, y: startY + y }, offset: { x, y }, velocity: { x: 0, y: y * 20 } };
}

describe('shorts panel swipe arbitration', () => {
  it.each([{ overlaysHidden: true }])(
    'restores hidden chrome while paging on an upward lower-area flick: %o', (state) => {
      const v = viewer(state);
      v.handleDrag({ type: 'pointermove' }, drag(700, -60));
      v.handleDragEnd({ type: 'pointerup' }, drag(700, -60));
      expect(v.resetDragOffset).toHaveBeenCalled();
      expect(v.setOverlaysHidden).toHaveBeenCalledWith(false);
      expect(v.setAutoHidden).toHaveBeenCalledWith(false);
      expect(v.goToNext).toHaveBeenCalledTimes(1);
      expect(v.goToPrev).not.toHaveBeenCalled();
    },
  );

  it('pages on a fast short flick even below the panel restore threshold', () => {
    const v = viewer();
    v.handleDragEnd({ type: 'pointerup' }, drag(700, -25));
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
    expect(v.goToNext).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ overlaysHidden: false }, drag(700, -100), 'goToNext'],
    [{}, drag(350, -100), 'goToNext'],
    [{}, drag(580, -100), 'goToNext'], // removed top 20% of restore band
    [{}, drag(790, -100), 'goToNext'], // seek strip must page on first swipe
    [{ overlaysHidden: false, autoHidden: true }, drag(700, -100), 'goToNext'],
    [{}, drag(700, 100), 'goToPrev'],
    [{ isMobile: false }, drag(700, -100), 'goToNext'],
  ])('keeps normal carousel gestures available: %o', (state, info, action) => {
    const v = viewer(state as Record<string, unknown>);
    v.handleDragEnd({ type: 'pointerup' }, info);
    expect(v[action as 'goToNext' | 'goToPrev']).toHaveBeenCalledTimes(1);
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
  });

  it('uses viewport coordinates when opened from a deeply scrolled feed', () => {
    const v = viewer({ window: { scrollY: 2400, innerHeight: 800 } });
    v.handleDragEnd({ type: 'pointerup' }, drag(2750, -100));
    expect(v.goToNext).toHaveBeenCalledTimes(1);
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
  });

  it('leaves horizontal photo paging alone', () => {
    const v = viewer();
    v.handleDragEnd({ type: 'pointerup' }, drag(700, -50, 100));
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
    expect(v.goToNext).not.toHaveBeenCalled();
    expect(v.goToPrev).not.toHaveBeenCalled();
  });

  it('lets a picture minimize drag own visual feedback and consume the downward page gesture', () => {
    const mini = { drag: vi.fn(() => true), finish: vi.fn(() => true), cancel: vi.fn() };
    const v = viewer({ mini });
    const info = drag(400, 120);
    v.handleDrag({ type: 'pointermove' }, info);
    expect(mini.drag).toHaveBeenCalledWith(info);
    expect(v.setDragOffset).toHaveBeenCalledWith(0);
    v.handleDragEnd({ type: 'pointerup' }, info);
    expect(mini.finish).toHaveBeenCalledWith(info);
    expect(v.goToNext).not.toHaveBeenCalled();
    expect(v.goToPrev).not.toHaveBeenCalled();
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
  });

  it('drags the first short down to leave, following the finger', () => {
    const v = viewer({ currentIndex: 0 });
    v.handleDrag({ type: 'pointermove' }, drag(300, 320));
    expect(v.leaveY.set).toHaveBeenLastCalledWith(320);
    expect(v.setDragOffset).toHaveBeenLastCalledWith(0);
    v.handleDragEnd({ type: 'pointerup' }, drag(300, 320));
    expect(v.leaveViewer).toHaveBeenCalledWith('y');
    expect(v.goToPrev).not.toHaveBeenCalled();
  });

  it('springs the first short back when let go early', () => {
    const v = viewer({ currentIndex: 0 });
    const info = { ...drag(300, 120), velocity: { x: 0, y: 100 } };
    v.handleDrag({ type: 'pointermove' }, info);
    v.handleDragEnd({ type: 'pointerup' }, info);
    expect(v.leaveViewer).not.toHaveBeenCalled();
    expect(v.animate).toHaveBeenCalledWith(v.leaveY, 0, v.DISMISS_SPRING);
  });

  it('keeps desktop dragging the pager, never leaving', () => {
    const v = viewer({ currentIndex: 0, isMobile: false });
    v.handleDragEnd({ type: 'pointerup' }, drag(300, 320));
    expect(v.leaveViewer).not.toHaveBeenCalled();
    expect(v.goToPrev).toHaveBeenCalledTimes(1);
  });

  it('ignores the pager while a side hold owns the finger', () => {
    const v = viewer({ holdOwnsGesture: { current: true } });
    v.handleDrag({ type: 'pointermove' }, drag(300, 120));
    v.handleDragEnd({ type: 'pointerup' }, drag(300, 120));
    expect(v.goToPrev).not.toHaveBeenCalled();
    expect(v.goToNext).not.toHaveBeenCalled();
  });

  it.each(['pointercancel', 'touchcancel'])('cancels %s without paging or committing a mini', type => {
    const v = viewer();
    v.handleDragEnd({ type }, drag(400, 120));
    expect(v.mini.cancel).toHaveBeenCalledOnce();
    expect(v.mini.finish).not.toHaveBeenCalled();
    expect(v.goToNext).not.toHaveBeenCalled();
    expect(v.goToPrev).not.toHaveBeenCalled();
  });
});

describe('video tap zones', () => {
  function taps(overrides: Record<string, unknown> = {}) {
    const context = {
      useCallback: (callback: unknown) => callback, useRef: (value: unknown) => ({ current: value }),
      overlaysHidden: false, autoHidden: false, isTransitioning: false,
      PAUSE_ZONE_START: 1 / 3, PAUSE_ZONE_END: 2 / 3,
      videoContainer: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }) },
      lastVideoTap: { current: null }, undoPlayPause: vi.fn(),
      setOverlaysHidden: vi.fn(), setAutoHidden: vi.fn(), setIsPaused: vi.fn(),
      setIsDescriptionExpanded: vi.fn(), setShowPlayIndicator: vi.fn(), setTimeout: () => 1, ...overrides,
    };
    const toggle = source.slice(source.indexOf('  const lastToggleTookEffect ='), source.indexOf('  const undoPlayPause ='));
    const tap = source.slice(source.indexOf('  const handleVideoTap ='), source.indexOf('  /**\n   * Clear the chrome once'));
    const code = ts.transpileModule(toggle + tap + '\n({ togglePlayPause, handleVideoTap, undoVideoTap })', {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return { ...context, ...runInNewContext(code, context) };
  }

  it.each([{ overlaysHidden: true }, { overlaysHidden: false }])('a centre tap plays/pauses and leaves the buttons alone: %o', (state) => {
    const v = taps(state);
    v.handleVideoTap({ clientX: 200, clientY: 400 });
    expect(v.setIsPaused).toHaveBeenCalledTimes(1);
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
  });

  it('a tap outside the centre hides every button without pausing', () => {
    const v = taps();
    v.handleVideoTap({ clientX: 40, clientY: 150 });
    expect(v.setOverlaysHidden).toHaveBeenCalledWith(true);
    expect(v.setIsPaused).not.toHaveBeenCalled();
  });

  it.each([{ overlaysHidden: true }, { autoHidden: true }])('the next outside tap brings them back: %o', (state) => {
    const v = taps(state);
    v.handleVideoTap({ clientX: 380, clientY: 700 });
    expect(v.setOverlaysHidden).toHaveBeenCalledWith(false);
    expect(v.setAutoHidden).toHaveBeenCalledWith(false);
  });

  it('a double tap puts the buttons back the way they were', () => {
    const v = taps();
    v.handleVideoTap({ clientX: 40, clientY: 150 });
    v.undoVideoTap();
    expect(v.setOverlaysHidden).toHaveBeenLastCalledWith(false);
  });
});
