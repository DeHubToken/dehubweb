import { describe, expect, it } from 'vitest';
import { windowPrompt, windowRange } from './agent-task-window';

const now = new Date('2026-10-17T12:00:00Z');

describe('every post in a time period', () => {
  it('turns presets into windows, and lets "next 7 days" end in the future', () => {
    expect(windowRange('last24h', { from: '', to: '' }, now)).toEqual({ from: new Date('2026-10-16T12:00:00Z'), to: now });
    expect(windowRange('next7d', { from: '', to: '' }, now)?.to.toISOString()).toBe('2026-10-24T12:00:00.000Z');
  });

  it('rejects custom windows that are reversed or end more than 31 days ahead', () => {
    expect(windowRange('custom', { from: '2026-10-10T00:00', to: '2026-10-09T00:00' }, now)).toBeNull();
    expect(windowRange('custom', { from: '2026-10-10T00:00', to: '2026-12-01T00:00' }, now)).toBeNull();
    expect(windowRange('custom', { from: '2026-10-10T00:00', to: '2026-10-11T00:00' }, now)).not.toBeNull();
  });

  it('writes the exact instruction the task runner parses, in a fixed action order', () => {
    const range = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-02T00:00:00Z') };
    expect(windowPrompt(range, ['reply', 'view'], '  warm\n and short ')).toBe(
      'Every post from 2026-10-01T00:00:00.000Z to 2026-10-02T00:00:00.000Z\nActions: view, reply\nReply style: warm and short');
    expect(windowPrompt(range, ['like'], 'ignored')).toBe('Every post from 2026-10-01T00:00:00.000Z to 2026-10-02T00:00:00.000Z\nActions: like');
  });
});
