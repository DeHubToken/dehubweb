import { describe, expect, it } from 'vitest';
import { estimateRelayedVisitors, fillMoveGap, type SiteStats } from '@/hooks/use-site-stats';

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

describe('estimateRelayedVisitors across the dehub.io -> riftn.com move', () => {
  it('corrects each zone on its own, then adds them so the move leaves no cliff', () => {
    const dehub = [
      day('2026-10-20', 3000, 10000),
      day('2026-10-21', 2000, 10000),
      day('2026-10-22', 2500, 10000),
      day('2026-10-26', 200, 16000), // relayed
      day('2026-11-04', 100, 400), // after the move: hand-offs and apps
    ];
    const riftn = [day('2026-11-04', 3000, 15000)];
    const merged = [...dehub.slice(0, 4), day('2026-11-04', 3100, 15400)];
    const input = {
      ...stats(merged),
      zones: [
        { name: 'dehub.io', ok: true, daily: dehub, hourly: [] },
        { name: 'riftn.com', ok: true, daily: riftn, hourly: [] },
      ],
    } as SiteStats;
    const out = estimateRelayedVisitors(input);
    expect(out.daily.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-26', '2026-11-04']);
    // Relayed dehub.io day rebuilt from its own clean ratio (0.25).
    expect(out.daily[3]).toMatchObject({ visitors: 4000, measuredVisitors: 200, estimated: true });
    // Move day: both zones' measured visitors added, nothing estimated.
    expect(out.daily[4]).toMatchObject({ visitors: 3100, pageViews: 15400 });
    expect(out.daily[4].estimated).toBeUndefined();
    expect(out.estimate?.since).toBe('2026-10-26');
  });

  it('falls back to one series when only one zone is readable', () => {
    const input = {
      ...stats([day('2026-09-10', 2000, 10000), day('2026-09-11', 2500, 10000)]),
      zones: [{ name: 'dehub.io', ok: true, daily: [] }, { name: 'riftn.com', ok: false, error: 'denied' }],
    } as SiteStats;
    expect(estimateRelayedVisitors(input).daily).toEqual(input.daily);
  });
});

describe('fillMoveGap', () => {
  const before = Array.from({ length: 14 }, (_, i) => day(`2026-10-${String(19 + i).padStart(2, '0')}`, 3000, 15000));
  const after = [day('2026-11-03', 155, 7000), day('2026-11-04', 300, 2400), day('2026-11-05', 50, 300)];
  const zones = (riftnOk: boolean) => [
    { name: 'dehub.io', ok: true, daily: [] },
    riftnOk ? { name: 'riftn.com', ok: true, daily: [] } : { name: 'riftn.com', ok: false, error: 'denied' },
  ];

  it('fills days since the move with the pre-move median while riftn.com is unreadable', () => {
    const now = Date.parse('2026-11-05T12:00:00Z');
    const out = fillMoveGap({ ...stats([...before, ...after]), zones: zones(false) } as SiteStats, now);
    expect(out.daily.at(-3)).toMatchObject({ visitors: 3000, pageViews: 15000, measuredVisitors: 155, estimated: true });
    expect(out.daily.at(-2)).toMatchObject({ visitors: 3000, pageViews: 15000, estimated: true });
    // Half of today has passed: half a day's average.
    expect(out.daily.at(-1)).toMatchObject({ visitors: 1500, pageViews: 7500 });
    expect(out.gapFill).toMatchObject({ since: '2026-11-03', baselineDays: 14 });
  });

  it('leaves real rows alone once riftn.com is readable', () => {
    const input = { ...stats([...before, ...after]), zones: zones(true) } as SiteStats;
    const out = fillMoveGap(input);
    expect(out.daily).toEqual(input.daily);
    expect(out.gapFill).toBeNull();
  });
});
