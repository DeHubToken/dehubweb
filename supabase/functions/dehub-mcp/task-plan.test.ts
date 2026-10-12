import { agentOwnerAllowed, nextScheduledRun, parseTaskPlan, PLAN_TOOL, taskPlanSchema } from './task-plan.ts';
const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const base = { summary: 'Like yesterday’s posts', interval_minutes: null, steps: [{ tool: 'dehub_vote', arguments: { vote_type: 'like' }, audience: 'posts', from: '2026-10-10T00:00:00Z', to: '2026-10-11T00:00:00Z', topic: null }] };

Deno.test('only the pinned owner receives access, never a username or missing wallet', () => {
  assert(agentOwnerAllowed('0x9324840523a5d17dd12a2f11a9472e5a199c1937'));
  assert(agentOwnerAllowed('0x9324840523A5D17DD12A2F11A9472E5A199C1937'));
  for (const value of [null, undefined, '', 'maldoteth', '0x0000000000000000000000000000000000000001']) assert(!agentOwnerAllowed(value));
});
Deno.test('bulk actions preserve an explicit time window and cannot expand into unsupported actions', () => {
  assert(taskPlanSchema.safeParse(base).success);
  for (const change of [{ from: null }, { to: base.steps[0].from }, { tool: 'dehub_post_create' }, { tool: 'transfer' }]) {
    assert(!taskPlanSchema.safeParse({ ...base, steps: [{ ...base.steps[0], ...change }] }).success);
  }
  assert(!taskPlanSchema.safeParse({ ...base, interval_minutes: 60 }).success);
});
Deno.test('posting schedules respect the action budget and skip missed slots without a burst', () => {
  const step = { tool: 'dehub_post_create', arguments: {}, audience: 'single', topic: 'Music', from: null, to: null };
  assert(taskPlanSchema.safeParse({ summary: 'Three music posts per day', interval_minutes: 480, steps: [step] }).success);
  assert(taskPlanSchema.safeParse({ summary: 'Seven music posts per day', interval_minutes: 1440 / 7, steps: [step] }).success);
  assert(!taskPlanSchema.safeParse({ summary: 'Too many posts', interval_minutes: 30, steps: [step, step] }).success);
  assert(nextScheduledRun('2026-10-10T00:00:00Z', 480, Date.parse('2026-10-11T03:00:00Z')) === '2026-10-11T08:00:00.000Z');
});

Deno.test('planning requires an explicit plan or clarification and rejects incomplete output', () => {
  assert(PLAN_TOOL.function.parameters.required.includes('plan'));
  assert(PLAN_TOOL.function.parameters.required.includes('clarification'));
  const plan = parseTaskPlan({ plan: { summary: 'Three posts per day', interval_minutes: 480, steps: [{ tool: 'dehub_post_create', arguments: {}, audience: 'single', from: null, to: null, topic: 'Independent music' }] }, clarification: null });
  assert(plan.interval_minutes === 480 && plan.steps[0].topic === 'Independent music');
  for (const output of [{}, { plan: null }, { plan: { summary: 'Missing actions' } }]) {
    let rejected = false;
    try { parseTaskPlan(output); } catch (error) { rejected = error instanceof Error && error.message.includes('complete task'); }
    assert(rejected, 'incomplete output became an executable task');
  }
  let clarification = '';
  try { parseTaskPlan({ plan: null, clarification: 'Which post should receive the comment?' }); } catch (error) { clarification = (error as Error).message; }
  assert(clarification === 'Which post should receive the comment?');
});
