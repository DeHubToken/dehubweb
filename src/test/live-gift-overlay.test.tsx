/**
 * Every rung of the ladder has to paint something.
 *
 * The bug this guards is the one the mobile overlay shipped with: a picker
 * that sells ten distinct celebrations in front of a renderer that drew the
 * same text pill for all of them. A tier whose effect silently falls through
 * to `null` looks exactly like a working one in code review.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { GiftAnimationOverlay } from '@/components/app/live/GiftAnimationOverlay';
import { GIFT_TIERS, tierFromAmount } from '@/lib/live/gift-tiers';

afterEach(cleanup);

const celebration = (amount: number) => ({
  id: `c-${amount}`,
  tier: tierFromAmount(amount),
  amount,
  username: 'someone',
});

describe('gift celebration overlay', () => {
  it('draws nothing inside the stage when no gift is playing', () => {
    // The stage element itself stays mounted — a ResizeObserver needs
    // something to measure before the first gift lands, and the animations are
    // all written as fractions of that measurement.
    const { container } = render(<GiftAnimationOverlay items={[]} />);
    const stage = container.firstChild as HTMLElement;
    expect(stage).not.toBeNull();
    expect(stage.className).toContain('pointer-events-none');
    expect(stage.childElementCount).toBe(0);
  });

  it('plays a distinct effect for every tier, none falling through to nothing', () => {
    // The bug this guards: a tier whose effect silently returns null looks
    // exactly like a working one in review. Heart and Chocolate shipped that
    // way once already.
    const seen = new Set<string>();
    for (const tier of GIFT_TIERS) {
      const { container } = render(<GiftAnimationOverlay items={[celebration(tier.min)]} />);
      const effect = container.querySelector('.absolute.inset-0.overflow-hidden');
      expect(effect, `${tier.key} rendered no celebration`).not.toBeNull();
      const html = effect!.innerHTML;
      expect(seen.has(html), `${tier.key} draws the same thing as another tier`).toBe(false);
      seen.add(html);
      cleanup();
    }
  });

  it('floats the tier emoji up the corner stage for every tier', () => {
    for (const tier of GIFT_TIERS) {
      const { container } = render(<GiftAnimationOverlay items={[celebration(tier.min)]} />);
      const floats = Array.from(container.querySelectorAll('span')).filter(
        (el) => (el as HTMLElement).textContent === tier.emoji,
      );
      // More than one: the corner column, not just the caption's single glyph.
      expect(floats.length, `${tier.key} has no corner float`).toBeGreaterThan(1);
      cleanup();
    }
  });

  it('never lets a celebration take pointer events off the player', () => {
    const { container } = render(<GiftAnimationOverlay items={[celebration(1_000_000)]} />);
    expect((container.firstChild as HTMLElement).className).toContain('pointer-events-none');
  });

  it('says who sent it and how much', () => {
    const { getByText } = render(<GiftAnimationOverlay items={[celebration(50_000)]} />);
    expect(getByText(/someone/)).toBeTruthy();
    expect(getByText(/50,000/)).toBeTruthy();
  });

  it('keeps an expensive celebration on screen when a cheap one lands on top', () => {
    // Two at a time on purpose: cutting a 10-second Golden Screen short to
    // show a 1,000 DHB heart is the wrong way round.
    const { container } = render(
      <GiftAnimationOverlay items={[celebration(750_000), celebration(1_000)]} />,
    );
    const html = container.innerHTML;
    expect(html).toContain('🪙');
    expect(html).toContain('❤️');
  });
});
