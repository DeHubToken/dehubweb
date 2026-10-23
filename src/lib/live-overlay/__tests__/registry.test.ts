import { describe, expect, it } from 'vitest';
import { OVERLAY_KINDS, WIDGET_TEMPLATES, newWidget, setting } from '../registry';

describe('newWidget', () => {
  it('gives each widget of a kind its own id', () => {
    const first = newWidget('follow_alert', []);
    const second = newWidget('follow_alert', [first]);
    expect(first.id).toBe('follow_alert-1');
    expect(second.id).toBe('follow_alert-2');
  });

  it('stacks a new widget above everything already placed', () => {
    const low = { ...newWidget('frame', []), z: 4 };
    expect(newWidget('goal_bar', [low]).z).toBe(5);
  });

  it('copies its template rather than sharing it', () => {
    // Shared objects would mean moving one goal bar moved every goal bar
    // added after it, and edited the template for the rest of the session.
    const a = newWidget('goal_bar', []);
    a.landscape.x = 0.9;
    (a.settings as Record<string, unknown>).title = 'changed';
    const b = newWidget('goal_bar', [a]);
    expect(b.landscape.x).toBe(WIDGET_TEMPLATES.goal_bar.landscape.x);
    expect(b.settings.title).toBe('');
  });

  it('has a template inside the frame for every kind, in both shapes', () => {
    for (const kind of OVERLAY_KINDS) {
      for (const shape of ['landscape', 'portrait'] as const) {
        const r = WIDGET_TEMPLATES[kind][shape];
        expect(r.x + r.w, `${kind} ${shape}`).toBeLessThanOrEqual(1);
        expect(r.y + r.h, `${kind} ${shape}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('setting', () => {
  it('falls back when a stored value is missing or the wrong type', () => {
    expect(setting({ count: 5 }, 'count', 3)).toBe(5);
    expect(setting({ count: '5' }, 'count', 3)).toBe(3);
    expect(setting(undefined, 'count', 3)).toBe(3);
  });
});
