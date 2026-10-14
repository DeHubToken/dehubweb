import { agentOwnerAllowed, explicitTaskPlan, nextScheduledRun, parseTaskPlan, PLAN_TOOL, taskPlanSchema } from './task-plan.ts';
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

Deno.test('curated media belongs only to a generated post and has a usable subject', () => {
  const media_pool = [{ url: 'https://images.unsplash.com/photo-example?w=1200', type: 'image', subject: 'A mountain trail' }];
  const post = { tool: 'dehub_post_create', arguments: {}, audience: 'single', topic: 'Walking trails', from: null, to: null, media_pool };
  assert(taskPlanSchema.safeParse({ summary: 'Trail posts', interval_minutes: 1440, steps: [post] }).success);
  assert(!taskPlanSchema.safeParse({ summary: 'Repeated file', interval_minutes: 1440, steps: [{ ...post, arguments: { media_url: media_pool[0].url } }] }).success);
  assert(!taskPlanSchema.safeParse({ summary: 'Bad media', interval_minutes: 1440, steps: [{ ...post, media_pool: [{ ...media_pool[0], subject: '' }] }] }).success);
  assert(!taskPlanSchema.safeParse({ ...base, steps: [{ ...base.steps[0], media_pool }] }).success);
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

Deno.test('exact follow and posting commands preserve explicit intent without a model', () => {
  const follow = explicitTaskPlan('Follow @maldoteth once.');
  assert(follow?.steps[0].arguments.target_wallet === 'maldoteth' && follow.interval_minutes === null);
  assert(explicitTaskPlan('Follow every user.')?.steps[0].audience === 'all_users');
  const posts = explicitTaskPlan('Post 3 times per day about supporting independent musicians.');
  assert(posts?.interval_minutes === 480 && posts.steps[0].topic === 'supporting independent musicians.');
  assert(explicitTaskPlan('Publish 7 posts a day about music')?.interval_minutes === 1440 / 7);
  const daily = explicitTaskPlan('Post once per day about: independent music\nStyle: curious and concise\nLike up to 2 recent posts per day about: music, live shows, vinyl');
  assert(daily?.interval_minutes === 1440 && daily.steps.length === 2, 'daily post and likes were not combined');
  assert(daily?.steps[0].audience === 'selected_posts' && daily?.steps[0].recent_limit === 2 && daily?.steps[0].recent_keywords?.[1] === 'live shows', 'selected likes lost their interests');
  assert(daily?.steps[1].topic?.includes('curious and concise'), 'post style was lost');
  for (const prompt of ['Follow @maldoteth except on Mondays', 'Follow everyone who posts today', 'Post about music', 'Post 3 times per day at 09:00 about music']) assert(explicitTaskPlan(prompt) === null, 'expanded ambiguous or constrained wording');
  for (const count of [0, 49]) {
    let rejected = false;
    try { explicitTaskPlan(`Post ${count} times per day about music`); } catch { rejected = true; }
    assert(rejected, 'accepted a schedule outside the rate budget');
  }
});
