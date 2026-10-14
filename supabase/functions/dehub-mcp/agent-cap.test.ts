import { agentCapForBadgeWeight } from './agent-cap.ts';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };

Deno.test('agent cap rises with each badge tier from one to 25', () => {
  const caps = Array.from({ length: 14 }, (_, weight) => agentCapForBadgeWeight(weight));
  assert(caps[0] === 1 && caps[13] === 25, 'incorrect endpoints');
  assert(caps.every((cap, index) => cap >= 1 && cap <= 25 && (index === 0 || cap > caps[index - 1])), 'tiers did not increase');
  assert(agentCapForBadgeWeight(100) === 25 && agentCapForBadgeWeight(-1) === 1, 'out-of-range cap');
});
