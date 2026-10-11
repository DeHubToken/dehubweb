import { runTask, type TaskTool } from './tasks.ts';
import { AGENT_OWNER } from './task-plan.ts';

const assert = (value: unknown, description: string) => { if (!value) throw new Error(description); };
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
      update: (input: any) => { operation = 'update'; values = input; return query; },
      delete: () => { operation = 'delete'; return query; },
      single: () => { one = true; return query; }, maybeSingle: () => { one = true; return query; },
      then: (resolve: any, reject: any) => {
        try {
          let matched = rows[table].filter(row => predicates.every(test => test(row)));
          if (operation === 'insert') { const row = { ...structuredClone(values), id: crypto.randomUUID() }; rows[table].push(row); matched = [row]; }
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
  return { rows, task, calls: () => calls, onCall: (handler: () => Promise<any>) => { callback = handler; },
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
