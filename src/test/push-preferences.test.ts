import { describe, it, expect } from 'vitest';
import {
  getPref,
  getInAppPref,
  buildPrefPatch,
  unwrapPreferences,
  CATEGORY_OF,
  NOTIFICATION_CATEGORIES,
  type PushPreferences,
} from '@/lib/api/dehub/push';

/**
 * Captured verbatim from a live GET /api/push/preferences. `likes` is false
 * here on purpose — that is the exact case the old code got wrong, rendering
 * the toggle as ON.
 */
const LIVE_RESPONSE = {
  success: true,
  preferences: {
    engagement: { likes: false, comments: true, commentReplies: true, mentions: true },
    social: { newFollowers: true },
    monetization: { tips: true, subscriptions: true, ppvPurchases: true },
    content: { milestones: true, livestreamStart: true },
    system: { accountAlerts: true, announcements: true },
    quietHours: { enabled: false, startHour: 22, endHour: 8, timezone: 'UTC' },
    digestMode: { enabled: false, frequency: 'daily' },
    pushEnabled: true,
  },
};

describe('unwrapPreferences', () => {
  it('unwraps the {success, preferences} envelope the server actually sends', () => {
    const p = unwrapPreferences(LIVE_RESPONSE);
    expect(p.engagement.likes).toBe(false);
    expect(p.social.newFollowers).toBe(true);
  });

  it('still accepts a {result} envelope', () => {
    const p = unwrapPreferences({ result: LIVE_RESPONSE.preferences });
    expect(p.engagement.likes).toBe(false);
  });

  it('accepts a bare preferences object', () => {
    const p = unwrapPreferences(LIVE_RESPONSE.preferences);
    expect(p.engagement.likes).toBe(false);
  });

  it('does not throw on null/undefined', () => {
    expect(() => unwrapPreferences(null)).not.toThrow();
    expect(() => unwrapPreferences(undefined)).not.toThrow();
  });
});

describe('getPref', () => {
  const prefs = unwrapPreferences(LIVE_RESPONSE);

  it('reads a false value as false — the regression that shipped', () => {
    // Previously `pushPrefs?.likes ?? true` evaluated to true because `likes`
    // sat under `engagement`, so a disabled toggle rendered as enabled.
    expect(getPref(prefs, 'likes')).toBe(false);
  });

  it('reads true values across every category', () => {
    expect(getPref(prefs, 'comments')).toBe(true);
    expect(getPref(prefs, 'newFollowers')).toBe(true);
    expect(getPref(prefs, 'tips')).toBe(true);
    expect(getPref(prefs, 'livestreamStart')).toBe(true);
    expect(getPref(prefs, 'announcements')).toBe(true);
  });

  it('defaults to on when a key or the whole object is missing', () => {
    expect(getPref(undefined, 'likes')).toBe(true);
    expect(getPref({ engagement: {} } as PushPreferences, 'likes')).toBe(true);
  });
});

describe('buildPrefPatch', () => {
  it('nests the key under its category', () => {
    expect(buildPrefPatch('likes', false)).toEqual({ engagement: { likes: false } });
    expect(buildPrefPatch('newFollowers', true)).toEqual({ social: { newFollowers: true } });
    expect(buildPrefPatch('ppvPurchases', false)).toEqual({ monetization: { ppvPurchases: false } });
  });

  it('never emits a bare top-level key, which the server ignores', () => {
    for (const key of Object.keys(CATEGORY_OF)) {
      const patch = buildPrefPatch(key as never, true) as Record<string, unknown>;
      expect(Object.keys(patch)).toHaveLength(1);
      expect(Object.keys(NOTIFICATION_CATEGORIES)).toContain(Object.keys(patch)[0]);
    }
  });
});

describe('category map', () => {
  it('covers every key the live response contains', () => {
    const live = LIVE_RESPONSE.preferences as unknown as Record<string, Record<string, boolean>>;
    for (const cat of Object.keys(NOTIFICATION_CATEGORIES)) {
      for (const key of Object.keys(live[cat])) {
        expect(CATEGORY_OF[key as never]).toBe(cat);
      }
    }
  });

  it('declares no key the server does not have', () => {
    const live = LIVE_RESPONSE.preferences as unknown as Record<string, Record<string, boolean>>;
    for (const [key, cat] of Object.entries(CATEGORY_OF)) {
      expect(live[cat]).toHaveProperty(key);
    }
  });
});

/**
 * The per-type toggles read the account document, not the push-preferences
 * collection above. Those are two different stores: only the account one is
 * consulted when deciding whether a notification row gets created.
 */
describe('getInAppPref', () => {
  it('treats a missing key as enabled', () => {
    expect(getInAppPref(undefined, 'likes')).toBe(true);
    expect(getInAppPref({}, 'likes')).toBe(true);
    expect(getInAppPref({ inApp: {} }, 'likes')).toBe(true);
  });

  it('reads an explicit false', () => {
    expect(getInAppPref({ inApp: { likes: false } }, 'likes')).toBe(false);
    expect(getInAppPref({ inApp: { likes: false } }, 'comments')).toBe(true);
  });

  it('lets the master switch win over a per-type true', () => {
    expect(getInAppPref({ inAppEnabled: false, inApp: { likes: true } }, 'likes')).toBe(false);
  });

  it('ignores the push block, which mobile owns separately', () => {
    expect(getInAppPref({ inApp: { tips: true }, push: { tips: false } }, 'tips')).toBe(true);
  });
});
