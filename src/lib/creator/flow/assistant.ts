/**
 * Creator Flow — client for the creator-prompt-assistant edge function.
 * =====================================================================
 * Streams tokens from the assistant persona (the prompt-crafter persona).
 * Works signed out; the function is IP-limited rather than wallet-gated.
 */
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co'}/functions/v1/creator-prompt-assistant`;
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I';

export type AssistantModelId = 'gemini-flash' | 'gemini-pro' | 'gpt-5-mini' | 'claude-haiku';

export interface AssistantModel {
  id: AssistantModelId;
  label: string;
  descKey: string;
}

export const ASSISTANT_MODELS: AssistantModel[] = [
  { id: 'gemini-flash', label: 'Gemini Flash', descKey: 'creatorFlow.modelFast' },
  { id: 'gemini-pro', label: 'Gemini Pro', descKey: 'creatorFlow.modelBest' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', descKey: 'creatorFlow.modelBalanced' },
  { id: 'claude-haiku', label: 'Claude Haiku', descKey: 'creatorFlow.modelFast' },
];

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = 'gemini-flash';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface StreamOptions {
  messages?: AssistantMessage[];
  prompt?: string;
  persona?: 'craft' | 'rewrite';
  model?: AssistantModelId;
  onDelta: (text: string, accumulated: string) => void;
  signal?: AbortSignal;
}

/** Stream a reply; resolves with the full text. */
export async function streamAssistant({ messages, prompt, persona = 'craft', model, onDelta, signal }: StreamOptions): Promise<string> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ messages, prompt, persona, model, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = 'The assistant is unavailable right now.';
    try {
      const j = await res.json();
      if (j?.error) message = String(j.error);
    } catch {
      /* not json */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as { delta?: string };
        if (parsed.delta) {
          accumulated += parsed.delta;
          onDelta(parsed.delta, accumulated);
        }
      } catch {
        /* partial frame */
      }
    }
  }
  return accumulated;
}
