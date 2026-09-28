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
    isMobile: true, overlaysHidden: true, autoHidden: false, showComments: false,
    RESTORE_ZONE_TOP: 0.55,
    setDragOffset: vi.fn(), setOverlaysHidden: vi.fn(), setAutoHidden: vi.fn(),
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
  it.each([{ overlaysHidden: true }, { overlaysHidden: false, autoHidden: true }])(
    'restores hidden chrome on an upward lower-area flick without paging: %o', (state) => {
      const v = viewer(state);
      v.handleDrag(null, drag(780, -60));
      v.handleDragEnd(null, drag(780, -60));
      expect(v.setDragOffset).toHaveBeenLastCalledWith(0);
      expect(v.setOverlaysHidden).toHaveBeenCalledWith(false);
      expect(v.setAutoHidden).toHaveBeenCalledWith(false);
      expect(v.goToNext).not.toHaveBeenCalled();
      expect(v.goToPrev).not.toHaveBeenCalled();
    },
  );

  it('does not page on a claimed flick shorter than the panel threshold', () => {
    const v = viewer();
    v.handleDragEnd(null, drag(780, -25));
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
    expect(v.goToNext).not.toHaveBeenCalled();
  });

  it.each([
    [{ overlaysHidden: false }, drag(780, -100), 'goToNext'],
    [{}, drag(350, -100), 'goToNext'],
    [{}, drag(780, 100), 'goToPrev'],
    [{ isMobile: false }, drag(780, -100), 'goToNext'],
  ])('keeps normal carousel gestures available: %o', (state, info, action) => {
    const v = viewer(state as Record<string, unknown>);
    v.handleDragEnd(null, info);
    expect(v[action as 'goToNext' | 'goToPrev']).toHaveBeenCalledTimes(1);
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
  });

  it('leaves horizontal photo paging alone', () => {
    const v = viewer();
    v.handleDragEnd(null, drag(780, -50, 100));
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
    expect(v.goToNext).not.toHaveBeenCalled();
    expect(v.goToPrev).not.toHaveBeenCalled();
  });
});

describe('panel restore and playback taps', () => {
  function taps(overrides: Record<string, unknown> = {}) {
    const context = {
      useCallback: (callback: unknown) => callback, useRef: (value: unknown) => ({ current: value }),
      useEffect: () => {}, isMobile: true, overlaysHidden: true, showComments: false,
      isTransitioning: false, window: { innerHeight: 800 }, RESTORE_ZONE_TOP: 0.55,
      RESTORE_ZONE_BOTTOM: 0.85, restoreTouchStart: { current: null },
      suppressVideoTapRef: { current: false }, suppressVideoTapTimer: { current: null },
      setOverlaysHidden: vi.fn(), setAutoHidden: vi.fn(), setIsPaused: vi.fn(),
      setShowPlayIndicator: vi.fn(), setTimeout: () => 1, clearTimeout: vi.fn(), ...overrides,
    };
    const toggle = source.slice(source.indexOf('  const lastToggleTookEffect ='), source.indexOf('  const undoPlayPause ='));
    const restore = source.slice(source.indexOf('  const handleRestoreTouchStart ='), source.indexOf('  /**\n   * Clear the chrome once'));
    const code = ts.transpileModule(toggle + restore + '\n({ togglePlayPause, handleRestoreTouchStart, handleRestoreTouchEnd })', {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return { ...context, ...runInNewContext(code, context) };
  }

  it('consumes a captured restore tap before the slide playback callback', () => {
    const v = taps();
    v.handleRestoreTouchStart({ clientX: 150, clientY: 600 });
    v.handleRestoreTouchEnd({ clientX: 150, clientY: 600 });
    v.togglePlayPause();
    expect(v.setOverlaysHidden).toHaveBeenCalledWith(false);
    expect(v.setIsPaused).not.toHaveBeenCalled();
    v.togglePlayPause();
    expect(v.setIsPaused).toHaveBeenCalledTimes(1);
  });

  it.each([{ overlaysHidden: true }, { overlaysHidden: false }])('keeps central pause/play taps available: %o', (state) => {
    const v = taps(state);
    v.handleRestoreTouchStart({ clientX: 150, clientY: 300 });
    v.handleRestoreTouchEnd({ clientX: 150, clientY: 300 });
    v.togglePlayPause();
    expect(v.setIsPaused).toHaveBeenCalledTimes(1);
    expect(v.setOverlaysHidden).not.toHaveBeenCalled();
  });
});
