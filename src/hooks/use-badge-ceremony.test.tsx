import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { BADGE_ORDER } from '@/lib/staking-badges';
import { useBadgeCeremony } from './use-badge-ceremony';

const [low, high] = [BADGE_ORDER[2], BADGE_ORDER[3]];

describe('badge ceremony', () => {
  beforeEach(() => window.localStorage.clear());

  it('marks the tier seen before the showcase opens', () => {
    const address = '0xaaa';
    const { result } = renderHook(() => useBadgeCeremony({ enabled: true, address, tier: high }));
    expect(result.current.ceremony?.to).toBe(high);
    expect(window.localStorage.getItem(`dehub.badgeCeremonySeen.${address}`)).toBe(high);
  });

  it('does not replay when the tier flips down and back up', () => {
    const address = '0xbbb';
    window.localStorage.setItem(`dehub.badgeCeremonySeen.${address}`, high);
    const { result, rerender } = renderHook(({ tier }) => useBadgeCeremony({ enabled: true, address, tier }), {
      initialProps: { tier: low },
    });
    expect(result.current.ceremony).toBeNull();
    rerender({ tier: high });
    expect(result.current.ceremony).toBeNull();
    expect(window.localStorage.getItem(`dehub.badgeCeremonySeen.${address}`)).toBe(high);
  });

  it('plays a tier once per session even if storage is lost', () => {
    const address = '0xccc';
    const first = renderHook(() => useBadgeCeremony({ enabled: true, address, tier: high }));
    expect(first.result.current.ceremony?.to).toBe(high);
    first.unmount();
    window.localStorage.clear();
    const again = renderHook(() => useBadgeCeremony({ enabled: true, address, tier: high }));
    expect(again.result.current.ceremony).toBeNull();
  });
});
