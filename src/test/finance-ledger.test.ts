import { describe, expect, it } from 'vitest';
import {
  buildSeries,
  daysInMonth,
  jobProviderCostUsd,
  spreadFixedCost,
  spreadMonthAmount,
  usageCostUsd,
} from '../../supabase/functions/finance-stats/ledger';
import { quotePriceDhb } from '../../supabase/functions/_shared/ai-pricing';

const sum = (xs: { usd: number }[]) => xs.reduce((a, x) => a + x.usd, 0);

describe('finance ledger', () => {
  it('spreads a monthly bill so each whole month adds up to exactly its price', () => {
    const entries = spreadFixedCost(
      { id: 'tool', label: 'Tool', group: 'ai_tools', usdMonthly: 200, since: '2026-09-01' },
      '2026-10-31',
    );
    const sept = entries.filter((e) => e.date.startsWith('2026-09'));
    const oct = entries.filter((e) => e.date.startsWith('2026-10'));
    expect(sept).toHaveLength(30);
    expect(oct).toHaveLength(31);
    expect(sum(sept)).toBeCloseTo(200, 6);
    expect(sum(oct)).toBeCloseTo(200, 6);
  });

  it('stops a fixed bill at its until date and never runs past today', () => {
    const closed = spreadFixedCost(
      { id: 'old', label: 'Old', group: 'infrastructure', usdMonthly: 30, since: '2026-09-01', until: '2026-09-10' },
      '2026-10-07',
    );
    expect(closed.at(-1)?.date).toBe('2026-09-10');
    const open = spreadFixedCost(
      { id: 'new', label: 'New', group: 'infrastructure', usdMonthly: 30, since: '2026-10-01' },
      '2026-10-07',
    );
    expect(open.at(-1)?.date).toBe('2026-10-07');
    expect(open).toHaveLength(7);
  });

  it('spreads a month-to-date invoice over the elapsed days only', () => {
    const entries = spreadMonthAmount('do', '2026-10', 70, '2026-10-07');
    expect(entries).toHaveLength(7);
    expect(sum(entries)).toBeCloseTo(70, 6);
    expect(daysInMonth('2026-02')).toBe(28);
  });

  it('recovers provider cost from what a generation was charged', () => {
    const price = quotePriceDhb('model3d', 'rodin-hyper3d');
    expect(price).not.toBeNull();
    // Retail rounds up to whole DHB, so the recovered cost is the list cost to within a tenth of a cent.
    expect(jobProviderCostUsd(price!, 'rodin-hyper3d')).toBeCloseTo(0.45, 3);
    // Banded markups divide back out with their own rate.
    const veo = quotePriceDhb('video', 'veo-3.1');
    expect(jobProviderCostUsd(veo!, 'veo-3.1')).toBeCloseTo(1.275, 3);
  });

  it('prices paid text routes, counts free tiers as zero and refuses to guess unknown models', () => {
    const base = { day: '2026-10-06', attempts: 10, requested_model: null };
    expect(usageCostUsd({ ...base, route: 'free', served_model: 'openai/gpt-oss-120b', input_tokens: 1e6, output_tokens: 1e6 })).toBe(0);
    expect(
      usageCostUsd({ ...base, route: 'gateway', served_model: 'google/gemini-2.5-flash', input_tokens: 1e6, output_tokens: 1e6 }),
    ).toBeCloseTo(2.8, 6);
    expect(usageCostUsd({ ...base, route: 'direct', served_model: 'some-new-model', input_tokens: 5, output_tokens: 5 })).toBeNull();
    expect(usageCostUsd({ ...base, route: 'direct', served_model: 'some-new-model', input_tokens: 0, output_tokens: 0 })).toBe(0);
  });

  it('builds a gap-filled daily series from the first entry to today', () => {
    const days = buildSeries(
      [
        { kind: 'revenue', entry: { date: '2026-10-01', source: 'ads', usd: 5 } },
        { kind: 'revenue', entry: { date: '2026-10-01', source: 'ads', usd: 2.5 } },
        { kind: 'cost', entry: { date: '2026-10-03', source: 'do', usd: 1.23456 } },
        { kind: 'cost', entry: { date: '2026-10-09', source: 'do', usd: 9 } },
      ],
      '2026-10-04',
    );
    expect(days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(days[0].revenue).toEqual({ ads: 7.5 });
    expect(days[1]).toEqual({ date: '2026-10-02', revenue: {}, costs: {} });
    expect(days[2].costs).toEqual({ do: 1.2346 });
  });

  it('nets refunds into the same source', () => {
    const days = buildSeries(
      [
        { kind: 'revenue', entry: { date: '2026-10-01', source: 'ai', usd: 10 } },
        { kind: 'revenue', entry: { date: '2026-10-01', source: 'ai', usd: -4 } },
      ],
      '2026-10-01',
    );
    expect(days[0].revenue).toEqual({ ai: 6 });
  });
});
