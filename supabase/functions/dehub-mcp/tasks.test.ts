import { handleTaskRequest, postBreaksGroundingRules, postText, replyBreaksRules, runTask, type TaskTool, type ProfileImages } from './tasks.ts';
import { AGENT_OWNER } from './task-plan.ts';

const assert = (value: unknown, description: string) => { if (!value) throw new Error(description); };
Deno.test('post drafts keep concrete opinions but reject invented scenes and generic filler', () => {
  assert(!postBreaksGroundingRules("Basil leaves going yellow? I'd check the pot before adding water.", 100, 'yellow basil leaves'), 'rejected a grounded opinion');
  assert(postBreaksGroundingRules('Just whispered to my basil—turns out it prefers silence.', 100, 'yellow basil leaves'), 'allowed an invented action');
  assert(postBreaksGroundingRules('Take the 1965 Mustang for a sunrise run.', 100, 'a worn steering wheel'), 'allowed an invented dated scene');
  assert(postBreaksGroundingRules('The little things tell a story.', 100, 'yellow basil leaves'), 'allowed generic filler');
});
const fixture = (prior?: string) => {
  const agent = { id: 'agent', human_owner_wallet: AGENT_OWNER, owner_wallet_address: '0x1111111111111111111111111111111111111111', api_key: 'test', is_active: true };
  const task = { id: 'task', agent_id: 'agent', owner_wallet: AGENT_OWNER, status: 'running', lease: 'lease', completed_actions: 0,
    cycle: 0, cycle_started_at: new Date().toISOString(), cursor: { step: 0 }, needs_review: false,
    plan: { summary: 'Like a post', interval_minutes: null, steps: [{ tool: 'dehub_vote', arguments: { token_id: '123', vote_type: 'like' }, audience: 'single', from: null, to: null, topic: null }] } };
  const rows: Record<string, any[]> = { ai_agents: [agent], ai_agent_tasks: [task], ai_agent_task_actions: prior ? [{ id: 'prior', task_id: 'task', cycle: 0, step: 0, target: 'single', status: prior }] : [] };
  const db = { from(table: string) {
    let operation = 'select'; let values: any; let one = false;
    const predicates: ((row: any) => boolean)[] = [];
    const query: any = {
      select: () => query,
      eq: (key: string, value: any) => { predicates.push(row => row[key] === value); return query; },
      match: (match: any) => { Object.entries(match).forEach(([key, value]) => query.eq(key, value)); return query; },
      insert: (input: any) => { operation = 'insert'; values = input; return query; },
      upsert: (input: any[]) => { operation = 'upsert'; values = input; return query; },
      update: (input: any) => { operation = 'update'; values = input; return query; },
      delete: () => { operation = 'delete'; return query; },
      single: () => { one = true; return query; }, maybeSingle: () => { one = true; return query; },
      then: (resolve: any, reject: any) => {
        try {
          let matched = rows[table].filter(row => predicates.every(test => test(row)));
          if (operation === 'insert') { const row = { ...structuredClone(values), id: crypto.randomUUID() }; rows[table].push(row); matched = [row]; }
          if (operation === 'upsert') {
            const key = (row: any) => [row.task_id, row.cycle, row.step, row.target].join('|');
            matched = values.filter((row: any) => !rows[table].some(existing => key(existing) === key(row))).map((row: any) => ({ ...structuredClone(row), id: crypto.randomUUID() }));
            rows[table].push(...matched);
          }
          if (operation === 'update') matched.forEach(row => Object.assign(row, structuredClone(values)));
          if (operation === 'delete') rows[table] = rows[table].filter(row => !matched.includes(row));
          return Promise.resolve({ data: structuredClone(one ? matched[0] ?? null : matched), error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  } };
  let calls = 0;
  let callback: () => Promise<any> = async () => ({ structuredContent: { success: true } });
  const registry = new Map<string, TaskTool>([['dehub_vote', { description: 'Vote', validate: args => args, call: async () => { calls++; return callback(); } }]]);
  return { rows, db, task, registry, calls: () => calls, onCall: (handler: () => Promise<any>) => { callback = handler; },
    run: () => runTask({ db: () => db, token: async () => 'test', tools: () => registry }, new Request('https://example.test/tasks/tick'), structuredClone(task)) };
};

Deno.test('a stored success is not replayed after interruption', async () => {
  const test = fixture('succeeded'); await test.run();
  assert(test.calls() === 0, 'replayed a completed reaction');
  assert(test.task.status === 'completed', 'did not finish the remaining cursor');
});
Deno.test('an interrupted pending write pauses without retrying', async () => {
  const test = fixture('pending'); await test.run();
  assert(test.calls() === 0, 'retried an unconfirmed write');
  assert(test.task.status === 'paused' && test.task.needs_review, 'did not require review');
});
Deno.test('a connection failure records uncertainty and does not lose the target', async () => {
  const test = fixture(); test.onCall(async () => { throw new Error('connection closed'); }); await test.run();
  assert(test.calls() === 1, 'unexpected action count');
  assert(test.rows.ai_agent_task_actions[0].status === 'uncertain', 'uncertainty was not saved');
  assert(test.task.status === 'paused' && test.task.needs_review, 'task did not pause');
});
Deno.test('rate limits defer the same target without recording a completed action', async () => {
  const test = fixture(); const reset = new Date(Date.now() + 3600000).toISOString();
  test.onCall(async () => ({ isError: true, structuredContent: { error: 'limited', reset_at: reset } })); await test.run();
  assert(test.calls() === 1, 'retried into the limit');
  assert(test.rows.ai_agent_task_actions.length === 0 && test.task.completed_actions === 0, 'consumed the pending target');
  assert((test.task as any).next_run_at === reset, 'lost the reset time');
});
Deno.test('pausing during an in-flight action preserves both the receipt and pause', async () => {
  const test = fixture(); test.onCall(async () => { test.task.status = 'paused'; return { structuredContent: { success: true } }; }); await test.run();
  assert(test.task.status === 'paused', 'overrode owner pause');
  assert(test.task.completed_actions === 1 && test.rows.ai_agent_task_actions[0].status === 'succeeded', 'lost in-flight receipt');
});

async function profileRequest(body: FormData | Record<string, unknown>, wallet: string | null = AGENT_OWNER, owned = true) {
  const test = fixture();
  if (!owned) test.rows.ai_agents[0].human_owner_wallet = '0x2222222222222222222222222222222222222222';
  let call: { tool: string; args: Record<string, unknown>; images?: ProfileImages } | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert(String(input) === 'https://api.dehub.io/api/auth/verify', 'unexpected network request');
    return Response.json({ address: wallet });
  };
  try {
    const headers = new Headers(wallet ? { 'x-dehub-token': 'test-session' } : {});
    if (!(body instanceof FormData)) headers.set('content-type', 'application/json');
    const response = await handleTaskRequest(new Request('https://example.test/tasks', {
      method: 'POST', headers, body: body instanceof FormData ? body : JSON.stringify(body),
    }), { db: () => test.db, token: async () => 'test', tools: (key, _request, images) => {
      assert(key === 'test', 'incorrect agent key');
      return new Map(['dehub_profile', 'dehub_update_profile'].map(tool => [tool, {
        description: tool, validate: args => args,
        call: async args => { call = { tool, args, images }; return { structuredContent: { success: true, profile: { display_name: 'Name' } } }; },
      } as TaskTool]));
    } });
    return { status: response.status, payload: await response.json(), call };
  } finally { globalThis.fetch = originalFetch; }
}

Deno.test('profile reads and edits require a verified preview owner and an owned agent', async () => {
  for (const operation of ['profile', 'update_profile']) {
    const body = { operation, agent_id: 'agent', updates: { bio: 'Changed' } };
    const anonymous = await profileRequest(body, null);
    assert(anonymous.status === 401 && !anonymous.call, 'anonymous profile access');
    const otherUser = await profileRequest(body, '0x2222222222222222222222222222222222222222');
    assert(otherUser.status === 403 && !otherUser.call, 'non-preview profile access');
    const otherAgent = await profileRequest(body, AGENT_OWNER, false);
    assert(otherAgent.status === 403 && !otherAgent.call, 'another owner profile access');
  }
  const ownProfile = await profileRequest({ operation: 'profile', agent_id: 'agent' });
  assert(ownProfile.status === 200 && ownProfile.call?.args.user === '0x1111111111111111111111111111111111111111', 'profile did not target the selected agent');
  assert(!JSON.stringify(ownProfile.payload).includes('test'), 'profile exposed a credential');
});

Deno.test('profile uploads preserve both image files and intentional empty bio', async () => {
  const form = new FormData();
  form.set('operation', 'update_profile'); form.set('agent_id', 'agent');
  form.set('username', 'community_news'); form.set('display_name', 'Community'); form.set('bio', '');
  form.set('avatar', new File(['avatar bytes'], 'avatar.jpg', { type: 'image/jpeg' }));
  form.set('banner', new File(['banner bytes'], 'banner.webp', { type: 'image/webp' }));
  const result = await profileRequest(form);
  assert(result.status === 200 && result.call?.tool === 'dehub_update_profile', 'upload did not reach the profile callback');
  assert(result.call?.args.bio === '' && result.call?.args.display_name === 'Community', 'profile fields were lost');
  assert(result.call?.args.username === 'community_news', 'username was lost');
  assert(await result.call?.images?.avatar?.text() === 'avatar bytes', 'avatar bytes changed');
  assert(await result.call?.images?.banner?.text() === 'banner bytes', 'banner bytes changed');
});

Deno.test('bulk post reads record public views before the cursor advances or actions run', async () => {
  for (const failViews of [false, true]) {
    const test = fixture();
    const step = test.task.plan.steps[0] as any;
    step.audience = 'posts'; step.from = '2026-10-01T00:00:00Z'; step.to = '2026-10-02T00:00:00Z';
    const originalFetch = globalThis.fetch;
    let viewed = false;
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('/api/feed?')) return Response.json({ result: [
        { tokenId: 123, createdAt: '2026-10-01T12:00:00Z' },
        { tokenId: 456, createdAt: '2026-09-01T12:00:00Z' },
      ], pagination: { next_cursor: null } });
      assert(String(url) === 'https://api.dehub.io/api/view/batch', 'unexpected network call');
      assert(JSON.stringify(JSON.parse(String(init?.body)).tokenIds) === '[123]', 'counted unread/out-of-window posts');
      assert(new Headers(init?.headers).get('authorization') === 'Bearer test', 'lost the reading account');
      assert(test.calls() === 0, 'action ran before views were recorded');
      viewed = true;
      return failViews ? new Response('', { status: 503 }) : Response.json({ success: true });
    };
    try {
      let failed = false;
      try { await test.run(); } catch { failed = true; }
      assert(viewed && failed === failViews, 'view failure was hidden');
      assert(test.calls() === (failViews ? 0 : 1), 'lost ordering or advanced after a failed view write');
      if (failViews) assert(!('targets' in test.task.cursor), 'persisted cursor before recording views');
    } finally { globalThis.fetch = originalFetch; }
  }
});

Deno.test('daily selected likes view the scanned feed but act only on relevant third-party posts', async () => {
  const test = fixture();
  const step = test.task.plan.steps[0] as any;
  step.audience = 'selected_posts'; step.arguments = { vote_type: 'like' };
  step.recent_keywords = ['music', 'vinyl']; step.recent_limit = 2;
  (test.task.plan as any).interval_minutes = 1440;
  const originalFetch = globalThis.fetch;
  let viewed = false;
  const recent = new Date(Date.now() - 60_000).toISOString();
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/api/feed?')) return Response.json({ result: [
      { tokenId: 100, createdAt: recent, name: 'New music finds', minter: '0x2222222222222222222222222222222222222222' },
      { tokenId: 101, createdAt: recent, category: ['vinyl'], minter: '0x3333333333333333333333333333333333333333' },
      { tokenId: 102, createdAt: recent, name: 'Football today', minter: '0x4444444444444444444444444444444444444444' },
      { tokenId: 103, createdAt: recent, name: 'Music again', minter: '0x1111111111111111111111111111111111111111' },
    ] });
    assert(String(url) === 'https://api.dehub.io/api/view/batch', 'unexpected network request');
    assert(JSON.stringify(JSON.parse(String(init?.body)).tokenIds) === '[100,101,102,103]', 'did not count every scanned post as viewed');
    assert(test.calls() === 0, 'liked before recording views');
    viewed = true;
    return Response.json({ success: true });
  };
  try {
    await test.run();
    const targets = test.rows.ai_agent_task_actions.map(action => action.target).sort();
    assert(viewed && JSON.stringify(targets) === '["100","101"]', 'liked an unrelated or owned post');
    assert(test.task.status === 'queued', 'daily task did not schedule its next cycle');
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test('daily likes and ordinary posts run without mint gas', async () => {
  const test = fixture();
  (test.task.plan as any).interval_minutes = 1440;
  (test.task.plan.steps[0] as any).audience = 'selected_posts';
  (test.task.plan.steps[0] as any).recent_keywords = ['music'];
  (test.task.plan.steps[0] as any).recent_limit = 1;
  (test.task.plan.steps[0] as any).arguments = { vote_type: 'like' };
  (test.task.plan.steps as any).push({ tool: 'dehub_post_create', arguments: { content: 'A music note' }, audience: 'single', topic: null });
  test.registry.set('dehub_agent_status', { description: 'Status', validate: args => args,
    call: async () => ({ structuredContent: { gas: { sufficient_for_posting: false } } }) });
  let posted = false;
  test.registry.set('dehub_post_create', { description: 'Post', validate: args => args,
    call: async args => {
      assert(args.content === 'A music note', 'lost the post body');
      posted = true;
      return { structuredContent: { success: true, post: { url: 'https://dehub.io/newpost/500' } } };
    } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('/api/feed?')
    ? Response.json({ result: [{ tokenId: 100, createdAt: new Date(Date.now() - 60_000).toISOString(),
      name: 'Good music', minter: '0x2222222222222222222222222222222222222222' }] })
    : Response.json({ success: true });
  try {
    await test.run();
    assert(test.calls() === 1, 'the selected like did not run');
    assert(posted, 'ordinary post was blocked by zero mint gas');
    assert(test.task.status === 'queued' && test.task.cycle === 1, 'the next daily cycle was not scheduled');
    assert(test.rows.ai_agent_task_actions.length === 2, 'like and post should both be recorded');
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test('swarm members divide bulk targets without repeating actions', async () => {
  const performed: string[][] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/feed?')) return Response.json({ result: [123, 124, 125, 126].map(tokenId => ({
      tokenId, createdAt: '2026-10-01T12:00:00Z',
    })), pagination: { next_cursor: null } });
    assert(String(url) === 'https://api.dehub.io/api/view/batch', 'unexpected network request');
    return Response.json({ success: true });
  };
  try {
    for (const index of [0, 1]) {
      const test = fixture();
      const step = test.task.plan.steps[0] as any;
      step.audience = 'posts'; step.from = '2026-10-01T00:00:00Z'; step.to = '2026-10-02T00:00:00Z';
      (test.task as any).swarm_size = 2; (test.task as any).swarm_index = index;
      await test.run();
      performed.push(test.rows.ai_agent_task_actions.map(action => action.target));
    }
  } finally { globalThis.fetch = originalFetch; }
  const combined = performed.flat();
  assert(combined.length === 4 && new Set(combined).size === 4, 'swarm duplicated or missed a target');
  assert(['123', '124', '125', '126'].every(target => combined.includes(target)), 'swarm did not cover the complete window');
});

Deno.test('unsupported or oversized profile uploads never reach a write callback', async () => {
  for (const file of [new File(['html'], 'avatar.html', { type: 'text/html' }), new File([], 'empty.png', { type: 'image/png' }), new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })]) {
    const form = new FormData(); form.set('operation', 'update_profile'); form.set('agent_id', 'agent'); form.set('avatar', file);
    const result = await profileRequest(form);
    assert(result.status === 400 && !result.call, 'invalid image reached profile write');
  }
});

Deno.test('viewing every post in a window records tagged views and logs each post once, without any write tool', async () => {
  const test = fixture();
  const step = test.task.plan.steps[0] as any;
  Object.assign(step, { tool: 'dehub_view', arguments: {}, audience: 'posts', from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' });
  const originalFetch = globalThis.fetch;
  const viewed: any[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/api/feed?')) return Response.json({ result: [123, 124, 125].map(tokenId => ({ tokenId, createdAt: '2026-10-01T12:00:00Z' })), pagination: { next_cursor: null } });
    assert(String(url) === 'https://api.dehub.io/api/view/batch', 'unexpected network request');
    viewed.push(JSON.parse(String(init?.body)));
    return Response.json({ success: true });
  };
  try { await test.run(); } finally { globalThis.fetch = originalFetch; }
  assert(viewed.length === 1 && viewed[0].source === 'agent' && viewed[0].tokenIds.length === 3, 'views were not recorded or not tagged as agent traffic');
  assert(test.calls() === 0, 'a view task called a write tool');
  assert(test.rows.ai_agent_task_actions.filter(action => action.tool === 'dehub_view' && action.status === 'succeeded').length === 3, 'viewed posts were not logged');
  assert(test.task.completed_actions === 3 && test.task.status === 'completed', 'the view task did not finish');
});

Deno.test('a window that ends in the future covers posts so far, then checks again from where it stopped', async () => {
  const test = fixture();
  const step = test.task.plan.steps[0] as any;
  const from = new Date(Date.now() - 3600_000).toISOString();
  Object.assign(step, { tool: 'dehub_view', arguments: {}, audience: 'posts', from, to: new Date(Date.now() + 2 * 86400_000).toISOString() });
  const originalFetch = globalThis.fetch;
  const windows: { from: string | null; to: string | null }[] = [];
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/feed?')) {
      const query = new URL(String(url)).searchParams;
      windows.push({ from: query.get('from'), to: query.get('to') });
      return Response.json({ result: [], pagination: { next_cursor: null } });
    }
    return Response.json({ success: true });
  };
  try {
    await test.run();
    assert(test.task.status === 'queued', 'a live window finished early');
    const recheck = Date.parse((test.task as any).next_run_at);
    assert(recheck > Date.now() && recheck <= Date.now() + 31 * 60_000, 'the next check is not within the recheck interval');
    const scanned = (test.task.cursor as any).scanned?.[0];
    assert(scanned && Date.parse(scanned) <= Date.now(), 'did not remember how far it covered');
    assert(windows[0].from === from && Date.parse(windows[0].to!) <= Date.now(), 'first pass reached into the future');
    test.task.status = 'running';
    await runTask({ db: () => (test as any).db, token: async () => 'test', tools: () => test.registry }, new Request('https://example.test/tasks/tick'), structuredClone(test.task));
    assert(windows[1].from === scanned, 'the next pass did not start where the last one stopped');
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test('written replies are grounded in the post and stay plain', () => {
  assert(postText({ name: 'Vinyl haul', description: 'Vinyl haul' }) === 'Vinyl haul', 'repeated the same text');
  assert(postText({ name: '', description: '  ' }) === '', 'invented text for an empty post');
  assert(!replyBreaksRules('That pressing sounds warmer than the reissue, which side did you play first?'), 'rejected a plain reply');
  for (const reply of ['Check https://example.com', 'Love it #vinyl', 'Hey @someone look', '"Quoted reply"', 'x'.repeat(221), '']) assert(replyBreaksRules(reply), `allowed: ${reply.slice(0, 20)}`);
});
