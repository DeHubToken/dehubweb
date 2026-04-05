/**
 * Streaming Chat Client
 * =====================
 * Parses SSE from general-ai-chat edge function token-by-token.
 */

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/general-ai-chat`;

interface StreamChatOptions {
  body: Record<string, any>;
  onDelta: (text: string) => void;
  onMeta?: (meta: { modelUsed?: string; modelTier?: string; modelReason?: string; fallbackUsed?: boolean }) => void;
  onDone: () => void;
  onError: (error: Error & { errorCode?: string; statusCode?: number }) => void;
  signal?: AbortSignal;
}

export async function streamChat({ body, onDelta, onMeta, onDone, onError, signal }: StreamChatOptions) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });

    if (!resp.ok) {
      let errorData: any = {};
      try { errorData = await resp.json(); } catch { /* ignore */ }
      const err = new Error(errorData.error || `AI request failed (${resp.status})`) as any;
      err.errorCode = errorData.errorCode || (resp.status === 429 ? 'RATE_LIMIT' : resp.status === 402 ? 'CREDITS_EXHAUSTED' : 'API_ERROR');
      err.statusCode = resp.status;
      onError(err);
      return;
    }

    if (!resp.body) {
      onError(new Error('No response body'));
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);

          // Check for metadata event from our edge function
          if (parsed.__meta) {
            onMeta?.(parsed.__meta);
            continue;
          }

          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          // Incomplete JSON — put it back
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

    // Flush remaining
    if (buffer.trim()) {
      for (let raw of buffer.split('\n')) {
        if (!raw) continue;
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (raw.startsWith(':') || raw.trim() === '') continue;
        if (!raw.startsWith('data: ')) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.__meta) { onMeta?.(parsed.__meta); continue; }
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch { /* ignore partial leftovers */ }
      }
    }

    onDone();
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    onError(err);
  }
}
