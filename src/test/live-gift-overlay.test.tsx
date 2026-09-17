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
  it('renders nothing at all when no gift is playing', () => {
    const { container } = render(<GiftAnimationOverlay items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('floats the tier emoji up the bottom-right corner for every tier', () => {
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
