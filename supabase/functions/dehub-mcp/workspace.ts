import { type Context, planPrompt } from './tasks.ts';
import { agentSettings, blockedReason, checked, settingsSchema } from './controls.ts';
import { currentNews } from './news.ts';

const STARTERS = [
  { id: 'daily', name: 'Daily poster', prompt: 'Post once per day about music with a conversational voice.' },
  { id: 'reply', name: 'Comment responder', prompt: 'Reply to every post in the last 24 hours with a short relevant question grounded in the post.' },
  { id: 'curator', name: 'Feed curator', prompt: 'Like up to 3 recent posts about music and film.' },
  { id: 'news', name: 'Current events', prompt: 'Post once per day about current news and real-world events.' },
];
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const error = (message: string, status = 400) => Response.json({ error: message }, { status });
export async function handleWorkspace(req: Request, context: Context, wallet: string, input: Record<string, any>): Promise<Response> {
  const db = context.db();
  if (input.operation === 'workspace_overview') {
    const agents = checked(await db.from('ai_agents').select('id,name,is_active,last_active_at').eq('human_owner_wallet', wallet));
    const ids = agents.map((agent: any) => agent.id);
    const receipts = ids.length ? checked(await db.from('ai_agent_receipts').select('id,agent_id,tool,arguments,status,result,created_at').in('agent_id', ids).order('created_at', { ascending: false }).limit(100)) : [];
    const tasks = checked(await db.from('ai_agent_tasks').select('id,agent_id,status,next_run_at,message,needs_review').eq('owner_wallet', wallet).order('created_at', { ascending: false }).limit(200));
    const templates = checked(await db.from('ai_agent_templates').select('id,name,prompt,published,owner_wallet').or(`owner_wallet.eq.${wallet},published.eq.true`).order('created_at', { ascending: false }).limit(100));
    const alerts = [
      ...tasks.filter((task: any) => task.needs_review || task.status === 'failed').map((task: any) => ({ id: task.id, message: task.message || 'A task needs attention.' })),
      ...receipts.filter((receipt: any) => ['uncertain', 'failed', 'blocked'].includes(receipt.status) || receipt.status === 'executing' && Date.parse(receipt.created_at) < Date.now() - 300000).slice(0, 10).map((receipt: any) => ({ id: receipt.id, message: receipt.result?.error || `${receipt.tool}: ${receipt.status}. Check activity before retrying.` })),
    ];
    return Response.json({ agents, receipts, tasks, alerts, templates: [...STARTERS, ...templates], sampled: true });
  }
  if (input.operation === 'workspace_save_template') {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 4000 || typeof input.published !== 'boolean') return error('Enter a name, instructions and sharing preference.');
    const count = await db.from('ai_agent_templates').select('id', { count: 'exact', head: true }).eq('owner_wallet', wallet); checked(count);
    if (count.count >= 100) return error('Your library already contains 100 templates.', 409);
    const template = checked(await db.from('ai_agent_templates').insert({ owner_wallet: wallet, name: input.name.trim(), prompt: input.prompt.trim(), published: input.published }).select('id').single());
    return Response.json({ template });
  }
  if (!uuid(input.agent_id)) return error('Select an agent.');
  const agent = checked(await db.from('ai_agents').select('id,name,api_key,is_active,description').eq('id', input.agent_id).eq('human_owner_wallet', wallet).maybeSingle());
  if (!agent) return error('Agent not found.', 404);
  if (input.operation === 'workspace_settings') return Response.json({ settings: await agentSettings(db, agent.id) });
  if (input.operation === 'workspace_save_settings') {
    const parsed = settingsSchema.safeParse(input.settings);
    if (!parsed.success) return error('Check the voice, reference material, permissions and news topics.');
    checked(await db.from('ai_agent_controls').upsert({ agent_id: agent.id, settings: parsed.data, updated_at: new Date().toISOString() }));
    return Response.json({ settings: parsed.data });
  }
  if (input.operation === 'workspace_news') {
    const settings = await agentSettings(db, agent.id);
    return Response.json({ stories: await currentNews(db, settings.news_topics) });
  }
  if (input.operation === 'workspace_preview') {
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 4000) return error('Enter instructions to simulate.');
    let timezone = typeof input.timezone === 'string' ? input.timezone : 'UTC';
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { timezone = 'UTC'; }
    try {
      const plan = await planPrompt(input.prompt, timezone, context.tools(agent.api_key, req));
      const settings = await agentSettings(db, agent.id);
      const checks = plan.steps.map(step => ({ tool: step.tool, audience: step.audience, generated: !!step.topic,
        permission: step.tool === 'dehub_view' ? null : blockedReason(settings, step.tool, step.arguments) }));
      return Response.json({ plan, checks, mode: settings.mode, simulation: true,
        message: 'Plan simulation only. No posts, comments, views or moderation actions were executed. Generated text is written when the task runs.' });
    } catch (reason) { return error(reason instanceof Error ? reason.message : 'Could not simulate these instructions.', 422); }
  }
  if (input.operation === 'workspace_approve' || input.operation === 'workspace_reject') {
    if (!uuid(input.receipt_id)) return error('Select a draft.');
    const receipt = checked(await db.from('ai_agent_receipts').select('*').eq('id', input.receipt_id).eq('agent_id', agent.id).maybeSingle());
    if (!receipt || !['draft', 'approval'].includes(receipt.status)) return error('This draft has already been handled.', 409);
    if (input.operation === 'workspace_reject') {
      checked(await db.from('ai_agent_receipts').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', receipt.id).eq('status', receipt.status));
      return Response.json({ rejected: true });
    }
    if (!agent.is_active) return error('Activate the agent before approving.', 409);
    const settings = await agentSettings(db, agent.id);
    const reason = blockedReason(settings, receipt.tool, receipt.arguments);
    if (reason) return error(reason, 409);
    const claimed = checked(await db.from('ai_agent_receipts').update({ status: 'executing', updated_at: new Date().toISOString() }).eq('id', receipt.id).eq('status', receipt.status).select('id'));
    if (!claimed.length) return error('This draft has already been handled.', 409);
    const tool = context.tools(agent.api_key, req).get(receipt.tool);
    if (!tool) return error('This action is no longer available.', 409);
    try {
      const result = await tool.call(receipt.arguments, receipt.id);
      return Response.json(result.structuredContent, { status: result.isError ? 422 : 200 });
    } catch {
      return error('The action outcome is uncertain. Check the activity log before doing anything again.', 409);
    }
  }
  return error('Unknown workspace operation.');
}
