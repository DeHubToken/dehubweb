import { chainVerticalWheel } from '../lib/chain-vertical-wheel';

function setup(overflow = 'auto') {
  const page = document.createElement('div');
  page.style.overflowY = overflow;
  Object.defineProperties(page, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } });
  const shell = document.createElement('div');
  shell.style.overscrollBehaviorY = 'none';
  const strip = document.createElement('div');
  page.append(shell);
  shell.append(strip);
  document.body.append(page);
  return { page, strip, shell };
}

beforeEach(() => {
  // jsdom 20 does not expose overscroll-behavior in its computed styles.
  const compute = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = compute(element);
    Object.defineProperty(style, 'overscrollBehaviorY', {
      value: (element as HTMLElement).style.overscrollBehaviorY || 'auto',
    });
    return style;
  });
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('vertical wheel over a horizontal gallery', () => {
  it('moves the page through a non-scrolling app shell and cancels native duplicate scrolling', () => {
    const { page, strip } = setup();
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    chainVerticalWheel(wheel, strip);
    expect(page.scrollTop).toBe(100);
    expect(wheel.defaultPrevented).toBe(true);
  });

  it('normalizes line and page units and supports scrolling up', () => {
    const { page, strip } = setup();
    chainVerticalWheel(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, cancelable: true }), strip);
    expect(page.scrollTop).toBe(48);
    chainVerticalWheel(new WheelEvent('wheel', { deltaY: 1, deltaMode: 2, cancelable: true }), strip);
    expect(page.scrollTop).toBe(548);
    chainVerticalWheel(new WheelEvent('wheel', { deltaY: -100, cancelable: true }), strip);
    expect(page.scrollTop).toBe(448);
  });

  it.each([
    { deltaX: 100, deltaY: 10, cancelable: true },
    { deltaY: 100, ctrlKey: true, cancelable: true },
    { deltaY: 100, cancelable: false },
    { deltaY: -100, cancelable: true },
  ])('leaves horizontal gestures, zoom, noncancelable input and page boundaries alone: %j', (init) => {
    const { page, strip } = setup();
    const wheel = new WheelEvent('wheel', init);
    chainVerticalWheel(wheel, strip);
    expect(page.scrollTop).toBe(0);
    expect(wheel.defaultPrevented).toBe(false);
  });

  it('does not move a locked page or escape a contained overlay', () => {
    const { page, strip, shell } = setup('hidden');
    chainVerticalWheel(new WheelEvent('wheel', { deltaY: 100, cancelable: true }), strip);
    expect(page.scrollTop).toBe(0);
    page.style.overflowY = 'auto';
    shell.style.overflowY = 'auto';
    chainVerticalWheel(new WheelEvent('wheel', { deltaY: 100, cancelable: true }), strip);
    expect(page.scrollTop).toBe(0);
  });
});
