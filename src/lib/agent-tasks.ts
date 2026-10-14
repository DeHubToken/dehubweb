import { ensureFreshToken } from '@/lib/api/dehub/core';

export interface AgentTask {
  id: string; agent_id: string; prompt: string; status: string;
  swarm_id: string | null; swarm_index: number | null; swarm_size: number | null;
  plan: { summary: string; interval_minutes: number | null };
  completed_actions: number; next_run_at: string; needs_review: boolean; message: string | null;
}
export interface AgentTaskAction {
  id: string; tool: string; target: string; status: string; created_at: string;
  result: { error?: string; hint?: string; content?: string; message?: string; post?: { url?: string } } | null;
}
export async function agentTaskRequest<T>(wallet: string, body: Record<string, unknown> | FormData): Promise<T> {
  const token = await ensureFreshToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co'}/functions/v1/dehub-mcp/tasks`, {
      method: 'POST', headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'x-dehub-token': token, 'x-wallet-address': wallet },
      body: body instanceof FormData ? body : JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json().catch(() => { throw new Error(`The task service returned an unreadable response (${response.status}). Refresh tasks before retrying.`); });
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `The task request failed (${response.status}). Refresh tasks before retrying.`);
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The task request timed out. Refresh tasks before retrying.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
