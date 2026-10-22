import { describe, expect, it } from 'vitest';
import { freshRuleId, parseRuleFired, presetRule, RULE_SOUND_FILES } from '../rules';

describe('stream rule presets', () => {
  const text = { name: 'Read chat aloud', say: '{name} says {message}', alert: '{name}!', chat: 'Thanks {name}' };

  it('reads chat aloud for followers only, one line per viewer at a time', () => {
    const rule = presetRule('readChat', [], text);
    expect(rule.trigger).toEqual({ type: 'chat' });
    expect(rule.audience).toBe('followers');
    expect(rule.userCooldownSec).toBeGreaterThan(0);
    expect(rule.actions).toEqual([{ type: 'say', text: '{name} says {message}' }]);
  });

  it('never posts a viewer message from a chat preset', () => {
    for (const preset of ['thankFollowers', 'command'] as const) {
      const rule = presetRule(preset, [], text);
      for (const action of rule.actions) if (action.type === 'chat') expect(action.text).not.toMatch(/\{message\}/i);
    }
  });

  it('gives each new rule an id no other rule has', () => {
    const first = presetRule('blank', [], text);
    expect(freshRuleId([first])).not.toBe(first.id);
  });
});

describe('fired rules from the server', () => {
  it('keeps only known sounds and real lines', () => {
    const fired = parseRuleFired({
      ruleId: 'r1',
      user: { address: '0xa' },
      alerts: [{ text: 'hi', durationMs: 60000 }, { text: '  ' }],
      sounds: ['airhorn', 'https://evil.example/x.mp3'],
      say: ['gm', ''],
    });
    expect(fired).toEqual({
      ruleId: 'r1',
      user: { address: '0xa' },
      alerts: [{ text: 'hi', durationMs: 20000 }],
      sounds: ['airhorn'],
      say: ['gm'],
      test: false,
    });
    expect(Object.keys(RULE_SOUND_FILES)).toContain('airhorn');
  });

  it('ignores anything that is not a fired rule', () => {
    expect(parseRuleFired(null)).toBeNull();
    expect(parseRuleFired({ alerts: [] })).toBeNull();
  });
});
