import { describe, expect, it } from 'vitest';
import { estimateRelayedVisitors, type SiteStats } from '@/hooks/use-site-stats';

const day = (date: string, visitors: number, pageViews: number) => ({
  date,
  visitors,
  pageViews,
  requests: pageViews * 8,
  bytes: 0,
});

function stats(daily: ReturnType<typeof day>[], hourly: SiteStats['hourly'] = []): SiteStats {
  return { daily, hourly } as unknown as SiteStats;
}

describe('estimateRelayedVisitors', () => {
  it('leaves an edge-direct series untouched', () => {
    const input = stats([day('2026-09-10', 2000, 10000), day('2026-09-11', 2500, 10000)]);
    const out = estimateRelayedVisitors(input);
    expect(out.estimate).toBeNull();
    expect(out.daily).toEqual(input.daily);
  });

  it('rebuilds relayed days from page views at the clean median ratio', () => {
    const out = estimateRelayedVisitors(
      stats(
        [
          day('2026-09-10', 2000, 10000),
          day('2026-09-11', 3000, 10000),
          day('2026-09-12', 2500, 10000),
          day('2026-09-13', 100, 8000),
        ],
        [{ hour: '2026-09-13T10:00:00Z', visitors: 3, pageViews: 400, requests: 3000 }],
      ),
    );
    expect(out.estimate).toEqual({ since: '2026-09-13', ratio: 0.25, baselineDays: 3 });
    expect(out.daily[3]).toMatchObject({ visitors: 2000, measuredVisitors: 100, estimated: true });
    expect(out.daily[2].estimated).toBeUndefined();
    expect(out.hourly[0]).toMatchObject({ visitors: 100, measuredVisitors: 3, estimated: true });
  });
});
