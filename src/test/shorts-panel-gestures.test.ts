import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(__dirname, '../components/app/cards/ShortsViewer.tsx'), 'utf8');

// Execute the viewer's actual callbacks without mounting its unrelated sheets.
function viewer(overrides: Record<string, unknown> = {}) {
  const context = {
    useCallback: (callback: unknown) => callback,
    videoContainer: { getBoundingClientRect: () => ({ top: 100, height: 800 }) },
    window: { scrollY: 0 }, isMobile: true, overlaysHidden: true, autoHidden: false, showComments: false,
    RESTORE_ZONE_TOP: 0.61, RESTORE_ZONE_BOTTOM: 0.85,
    setDragOffset: vi.fn(), resetDragOffset: vi.fn(), setOverlaysHidden: vi.fn(), setAutoHidden: vi.fn(),
    goToNext: vi.fn(), goToPrev: vi.fn(), ...overrides,
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
      v.handleDrag(null, drag(700, -60));
      v.handleDragEnd(null, drag(700, -60));
      expect(v.resetDragOffset).toHaveBeenCalled();
      expect(v.setOverlaysHidden).toHaveBeenCalledWith(false);
      expect(v.setAutoHidden).toHaveBeenCalledWith(false);
      expect(v.goToNext).toHaveBeenCalledTimes(1);
      expect(v.goToPrev).not.toHaveBeenCalled();
    },
  );

  it('pages on a fast short flick even below the panel restore threshold', () => {
    const v = viewer();
    v.handleDragEnd(null, drag(700, -25));
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
    v.handleDragEnd(null, info);
    expect(v[action as 'goToNext' | 'goToPrev']).toHaveBeenCalledTimes(1);
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
  });

  it('uses viewport coordinates when opened from a deeply scrolled feed', () => {
    const v = viewer({ window: { scrollY: 2400 } });
    v.handleDragEnd(null, drag(2750, -100));
    expect(v.goToNext).toHaveBeenCalledTimes(1);
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
  });

  it('leaves horizontal photo paging alone', () => {
    const v = viewer();
    v.handleDragEnd(null, drag(700, -50, 100));
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
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
