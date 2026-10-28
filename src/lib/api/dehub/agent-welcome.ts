/**
 * Agent welcomes API
 * ==================
 * A person's own agents can follow and/or message people who just joined
 * (dehub-stream-backend src/agent-welcome). The server enforces every limit;
 * these only read and switch.
 *
 * @module lib/api/dehub/agent-welcome
 */
import { apiCall } from './core';

export interface AgentWelcome {
  address: string;
  username: string;
  displayName: string;
  avatarImageUrl: string | null;
  follow: boolean;
  message: boolean;
  text: string;
  perDay: number;
  today: { follows: number; messages: number };
}

export interface AgentWelcomeList {
  limits: { maxPerDay: number; defaultPerDay: number; ownerMessagesPerDay: number; maxText: number };
  agents: AgentWelcome[];
}

export interface AgentWelcomeEntry {
  kind: 'follow' | 'message';
  status: 'done' | 'skipped' | 'failed';
  reason: string;
  content: string;
  at: string;
  target: { address: string; username: string | null; displayName: string | null; avatarImageUrl: string | null };
}

type Envelope = { status?: boolean; error?: string; message?: string; result?: unknown };

function unwrap<T>(response: Envelope): T {
  if (response && response.status === false) throw new Error(response.error || response.message || 'Request failed');
  return (response?.result ?? response) as T;
}

export async function getAgentWelcomes(): Promise<AgentWelcomeList> {
  return unwrap(await apiCall<Envelope>('/api/agent-welcome', { requiresAuth: true }));
}

export async function setAgentWelcome(agent: string, change: Partial<Pick<AgentWelcome, 'follow' | 'message' | 'text' | 'perDay'>>): Promise<AgentWelcome> {
  return unwrap(await apiCall<Envelope>(`/api/agent-welcome/${encodeURIComponent(agent)}`, { method: 'POST', body: change, requiresAuth: true }));
}

export async function getAgentWelcomeLog(agent: string): Promise<AgentWelcomeEntry[]> {
  return unwrap<{ entries: AgentWelcomeEntry[] }>(await apiCall<Envelope>(`/api/agent-welcome/${encodeURIComponent(agent)}/log`, { requiresAuth: true })).entries ?? [];
}
