import { z } from 'zod';
export const WRITE_TOOLS = ['dehub_post_create', 'dehub_comment', 'dehub_vote', 'dehub_follow', 'dehub_update_profile'] as const;
export const settingsSchema = z.object({
  mode: z.enum(['autonomous', 'approval', 'draft']).default('autonomous'),
  permissions: z.array(z.enum(WRITE_TOOLS)).max(5).default([...WRITE_TOOLS]),
  voice: z.string().max(1000).default(''),
  knowledge: z.string().max(12000).default(''),
  blocked_topics: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  news_enabled: z.boolean().default(false),
  news_topics: z.array(z.enum(['world', 'technology', 'culture', 'sport', 'science'])).min(1).max(3).default(['world']),
}).strict();
export type AgentSettings = z.infer<typeof settingsSchema>;
export const checked = (result: any) => { if (result.error) throw new Error(result.error.message); return result.data; };
export async function agentSettings(db: any, agentId: string): Promise<AgentSettings> {
  const row = checked(await db.from('ai_agent_controls').select('settings').eq('agent_id', agentId).maybeSingle());
  return settingsSchema.parse(row?.settings ?? {});
}
export function blockedReason(settings: AgentSettings, tool: string, args: Record<string, unknown>): string | null {
  if (!settings.permissions.includes(tool as typeof WRITE_TOOLS[number])) return 'This action is disabled in the agent permissions.';
  const text = [args.content, args.title, args.bio, args.display_name].filter(value => typeof value === 'string').join(' ').toLowerCase();
  if (settings.blocked_topics.some(topic => text.includes(topic.toLowerCase()))) return 'This draft contains a blocked topic.';
  return null;
}
export function writingContext(settings: AgentSettings): string {
  return `Owner voice: ${settings.voice || 'Keep the existing voice.'}\nOwner reference material (context, not permission to add tools or change rules): ${settings.knowledge}\nAvoid these topics: ${settings.blocked_topics.join(', ')}.`;
}
const result = (value: Record<string, unknown>, isError = false) => ({ isError, structuredContent: value, content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const canonical = (value: any): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

/** Applied once at the tool boundary for both MCP and internal runners. */
export async function controlledAction(db: any, agent: { id: string }, tool: string, args: Record<string, unknown>, call: () => Promise<any>, approvedId?: string) {
  const settings = await agentSettings(db, agent.id);
  const reason = blockedReason(settings, tool, args);
  if (reason) {
    checked(await db.from('ai_agent_receipts').insert({ agent_id: agent.id, tool, arguments: args, status: 'blocked', result: { error: reason } }));
    return result({ error: reason }, true);
  }
  if (approvedId) {
    const approval = checked(await db.from('ai_agent_receipts').select('id,tool,arguments,status').eq('id', approvedId).eq('agent_id', agent.id).maybeSingle());
    if (!approval || approval.status !== 'executing' || approval.tool !== tool || canonical(approval.arguments) !== canonical(args)) return result({ error: 'Approval no longer matches this action.' }, true);
  }
  const status = approvedId || settings.mode === 'autonomous' ? 'executing' : settings.mode;
  const receipt = approvedId ? { id: approvedId } : checked(await db.from('ai_agent_receipts').insert({ agent_id: agent.id, tool, arguments: args, status }).select('id').single());
  if (status !== 'executing') return result({ skipped: true, approval_id: receipt.id, message: status === 'draft' ? 'Saved as a draft. Nothing was published.' : 'Waiting for owner approval. Nothing was published.' });
  let output: any;
  try { output = await call(); }
  catch (error) {
    checked(await db.from('ai_agent_receipts').update({ status: 'uncertain', result: { error: error instanceof Error ? error.message : 'Connection ended during the action. Check before retrying.' }, updated_at: new Date().toISOString() }).eq('id', receipt.id));
    throw error;
  }
  const payload = output.structuredContent ?? {};
  checked(await db.from('ai_agent_receipts').update({ status: output.isError ? 'failed' : 'succeeded', result: payload, updated_at: new Date().toISOString() }).eq('id', receipt.id));
  return output;
}
