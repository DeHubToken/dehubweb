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
  assert(taskPlanSchema.safeParse({ summary: 'Curated caption', interval_minutes: 1440, steps: [{ ...post, media_pool: [{ ...media_pool[0], caption: 'Just the trail and the ridgeline.' }] }] }).success);
  assert(!taskPlanSchema.safeParse({ summary: 'Empty caption', interval_minutes: 1440, steps: [{ ...post, media_pool: [{ ...media_pool[0], caption: '   ' }] }] }).success);
  const video = { url: 'https://videos.pexels.com/clip.mp4', type: 'video', subject: 'Coffee poured into a cup' };
  assert(!taskPlanSchema.safeParse({ summary: 'Missing cover', interval_minutes: 1440, steps: [{ ...post, media_pool: [video] }] }).success);
  assert(taskPlanSchema.safeParse({ summary: 'Video with cover', interval_minutes: 1440, steps: [{ ...post, media_pool: [{ ...video, thumbnail_url: 'https://images.pexels.com/videos/clip.jpg' }] }] }).success);
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

Deno.test('every post in a time window: views, likes and written replies from the task form', () => {
  const plan = explicitTaskPlan('Every post from 2026-10-01T00:00:00Z to 2026-10-08T00:00:00Z\nActions: view, like, reply\nReply style: warm and brief');
  assert(plan?.interval_minutes === null && plan.steps.length === 3, 'lost an action');
  assert(plan!.steps.every(step => step.audience === 'posts' && step.from === '2026-10-01T00:00:00.000Z' && step.to === '2026-10-08T00:00:00.000Z'), 'lost the window');
  assert(plan!.steps[0].tool === 'dehub_view' && plan!.steps[1].arguments.vote_type === 'like' && plan!.steps[2].topic === 'warm and brief', 'wrong actions');
  assert(explicitTaskPlan('Every post from 2026-10-01T00:00:00Z to 2026-10-02T00:00:00Z\nActions: view')?.steps.length === 1);
  for (const prompt of ['Every post from 2026-10-01T00:00:00Z to 2026-10-02T00:00:00Z\nActions: reply', 'Every post from 2026-10-01T00:00:00Z to 2026-10-02T00:00:00Z\nActions: tip', 'Every post from yesterday to 2026-10-02T00:00:00Z\nActions: view']) {
    let rejected = false;
    try { explicitTaskPlan(prompt); } catch { rejected = true; }
    assert(rejected, `accepted: ${prompt}`);
  }
  let reversed = false;
  try { explicitTaskPlan('Every post from 2026-10-02T00:00:00Z to 2026-10-01T00:00:00Z\nActions: view'); } catch { reversed = true; }
  assert(reversed, 'accepted a window that ends before it starts');
});
Deno.test('views and written replies are limited to posts', () => {
  const step = base.steps[0];
  assert(taskPlanSchema.safeParse({ ...base, steps: [{ ...step, tool: 'dehub_view', arguments: {} }] }).success);
  assert(!taskPlanSchema.safeParse({ ...base, steps: [{ ...step, tool: 'dehub_view', arguments: {}, audience: 'all_users', from: null, to: null }] }).success);
  assert(taskPlanSchema.safeParse({ ...base, steps: [{ ...step, tool: 'dehub_comment', arguments: {}, topic: 'Friendly' }] }).success);
  assert(!taskPlanSchema.safeParse({ ...base, steps: [{ ...step, tool: 'dehub_comment', arguments: { token_id: '1' }, audience: 'single', from: null, to: null, topic: 'Friendly' }] }).success);
});

Deno.test('universal likes never request interests or use the selective three-like cap', () => {
  const now = new Date('2026-10-20T19:30:00Z');
  for (const prompt of ['Like every post in the last 24 hours', 'like every post today in last day every categorhy', 'Like all posts last day across all categories.']) {
    const plan = explicitTaskPlan(prompt, now, 'Europe/London');
    assert(plan?.steps.length === 1 && plan.steps[0].audience === 'posts');
    assert(plan?.steps[0].from === '2026-10-19T19:30:00.000Z' && plan.steps[0].to === now.toISOString());
    assert(plan?.steps[0].recent_keywords === null && plan.steps[0].recent_limit === null);
  }
  assert(explicitTaskPlan('Like every post today', now, 'Europe/London')?.steps[0].from === '2026-10-19T23:00:00.000Z');
  assert(explicitTaskPlan('Like every post today', new Date('2026-10-25T19:30:00Z'), 'Europe/London')?.steps[0].from === '2026-10-24T23:00:00.000Z');
  for (const prompt of ['Like every post today except music', 'Like every post today and follow everyone', 'Like every post daily', 'Like every post']) assert(explicitTaskPlan(prompt, now) === null, 'ignored a constraint or guessed a window');
});
