import { ensureFreshToken } from '@/lib/api/dehub/core';

export interface AgentTask {
  id: string; agent_id: string; prompt: string; status: string;
  plan: { summary: string; interval_minutes: number | null };
  completed_actions: number; next_run_at: string; needs_review: boolean; message: string | null;
}
export interface AgentTaskAction {
  id: string; tool: string; target: string; status: string; created_at: string;
  result: { error?: string; hint?: string; content?: string; message?: string; post?: { url?: string } } | null;
}
export async function agentTaskRequest<T>(wallet: string, body: Record<string, unknown>): Promise<T> {
  const token = await ensureFreshToken();
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dehub-mcp/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dehub-token': token, 'x-wallet-address': wallet },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The task could not be saved.');
  return data;
}
