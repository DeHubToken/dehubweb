/**
 * Streaming variant of the assistant agent loop.
 * ==============================================
 * Emits exactly the SSE shape the client already parses —
 * `choices[0].delta.content` chunks, a trailing `__meta` event, then `[DONE]` —
 * plus `__tool` events so the UI can say what it is looking up rather than
 * showing an idle spinner for four seconds.
 *
 * Tool rounds are streamed as well. When a round turns out to be tool calls
 * rather than prose, nothing has reached the client yet, so the switch is
 * invisible; when it is prose, it flows straight through with no added latency
 * over the old single-shot path.
 */
import {
  fetchToolCatalog,
  executeDeHubTool,
  executeWebSearch,
  GATEWAY_URL,
  WEB_SEARCH_TOOL,
  type AgentOptions,
  type ToolTraceEntry,
} from './assistant-agent.ts';

/** Streamed tool_call deltas arrive in fragments and must be reassembled. */
interface PartialToolCall {
  id: string;
  name: string;
  args: string;
}

function mergeToolCallDeltas(into: Map<number, PartialToolCall>, deltas: any[]) {
  for (const d of deltas) {
    const idx = d.index ?? 0;
    const existing = into.get(idx) || { id: '', name: '', args: '' };
    if (d.id) existing.id = d.id;
    if (d.function?.name) existing.name = d.function.name;
    if (d.function?.arguments) existing.args += d.function.arguments;
    into.set(idx, existing);
  }
}

export function streamAgentLoop(opts: AgentOptions): ReadableStream<Uint8Array> {
  const {
    messages,
    systemPrompt,
    surface,
    userToken,
    adminToken,
    model,
    lovableApiKey,
    perplexityKey,
    // Godmode asks chains rather than lookups — what shipped, what did it
    // change, what has the log said since — so it gets more rounds and longer
    // to spend them. It is also streaming, so the wait is visible rather than
    // silent: the `__tool` frames name each lookup as it happens.
    maxRounds = surface === 'admin' ? 9 : 5,
    maxTokens = 3000,
    timeoutMs = surface === 'admin' ? 150_000 : 90_000,
  } = opts;

  const encoder = new TextEncoder();
  const trace: ToolTraceEntry[] = [];

  return new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      const sendDelta = (text: string) => send({ choices: [{ delta: { content: text } }] });
      const finish = () => {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      };
      const toolSummary = () =>
        trace.length ? `Used ${trace.length} tool${trace.length === 1 ? '' : 's'}` : 'Answered directly';

      let fullText = '';

      try {
        const catalog = await fetchToolCatalog(surface, adminToken);
        const toolSchemas = [...catalog, WEB_SEARCH_TOOL].map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));

        const convo: Array<Record<string, unknown>> = [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ];

        const deadline = Date.now() + timeoutMs;

        for (let round = 0; round < maxRounds; round++) {
          const remaining = deadline - Date.now();
          if (remaining <= 2000) break;

          // Tools are withheld on the last round so the model has to answer
          // from what it has instead of asking for more and returning nothing.
          const isFinalRound = round === maxRounds - 1;
          const abort = new AbortController();
          const timer = setTimeout(() => abort.abort(), remaining);

          let res: Response;
          try {
            res = await fetch(GATEWAY_URL, {
              method: 'POST',
              headers: { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
              signal: abort.signal,
              body: JSON.stringify({
                model,
                messages: convo,
                ...(isFinalRound ? {} : { tools: toolSchemas }),
                max_completion_tokens: maxTokens,
                stream: true,
              }),
            });
          } finally {
            clearTimeout(timer);
          }

          if (!res.ok || !res.body) throw new Error(`Gateway ${res.status} on round ${round + 1}`);

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          const pending = new Map<number, PartialToolCall>();
          let buffer = '';
          let roundText = '';

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!line.startsWith('data:')) continue;

              const payload = line.slice(5).trim();
              if (payload === '[DONE]') continue;

              try {
                const delta = JSON.parse(payload)?.choices?.[0]?.delta;
                if (!delta) continue;
                if (delta.tool_calls) mergeToolCallDeltas(pending, delta.tool_calls);
                if (delta.content) {
                  roundText += delta.content;
                  fullText += delta.content;
                  sendDelta(delta.content);
                }
              } catch {
                // Partial JSON split across chunks — the buffer picks it up next pass.
              }
            }
          }

          // No tool calls means this round was the answer.
          if (pending.size === 0) {
            send({
              choices: [{ delta: {} }],
              __meta: { modelUsed: model, modelTier: 'agent', modelReason: toolSummary(), toolTrace: trace },
            });
            finish();
            return;
          }

          const calls = [...pending.values()].filter((c) => c.name);
          send({ choices: [{ delta: {} }], __tool: { status: 'running', tools: calls.map((c) => c.name) } });

          convo.push({
            role: 'assistant',
            content: roundText || null,
            tool_calls: calls.map((c, i) => ({
              id: c.id || `call_${round}_${i}`,
              type: 'function',
              function: { name: c.name, arguments: c.args || '{}' },
            })),
          });

          const results = await Promise.all(
            calls.map(async (c, i) => {
              let args: Record<string, unknown> = {};
              try {
                args = c.args ? JSON.parse(c.args) : {};
              } catch {
                args = {};
              }

              const started = Date.now();
              let output: unknown;
              try {
                output =
                  c.name === 'web_search'
                    ? await executeWebSearch(String(args.query || ''), perplexityKey)
                    : await executeDeHubTool(c.name, args, userToken, surface, adminToken);
              } catch (err) {
                output = { error: err instanceof Error ? err.message : 'Tool threw' };
              }

              const ok = !(output && typeof output === 'object' && 'error' in (output as any));
              trace.push({ tool: c.name, args, ok, ms: Date.now() - started });

              return {
                role: 'tool',
                tool_call_id: c.id || `call_${round}_${i}`,
                name: c.name,
                content: JSON.stringify(output).slice(0, 12_000),
              };
            }),
          );

          convo.push(...results);
          send({ choices: [{ delta: {} }], __tool: { status: 'done', tools: calls.map((c) => c.name) } });
        }

        // Rounds or time ran out mid-loop. Say something rather than nothing.
        if (!fullText) {
          sendDelta('I could not finish looking that up in time. Try asking again, or narrow the question down.');
        }
        send({
          choices: [{ delta: {} }],
          __meta: { modelUsed: model, modelTier: 'agent', modelReason: 'Tool budget exhausted', toolTrace: trace },
        });
        finish();
      } catch (err) {
        console.error('[Agent stream] failed:', err);
        if (!fullText) {
          sendDelta('Something went wrong reaching DeHub data just then. Please try again.');
        }
        send({
          choices: [{ delta: {} }],
          __meta: { modelUsed: model, modelTier: 'agent', modelReason: 'Agent error', toolTrace: trace },
        });
        finish();
      }
    },
  });
}

/** Collect the streamed text for memory extraction without buffering it twice. */
export function teeStreamText(
  stream: ReadableStream<Uint8Array>,
  onComplete: (text: string) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let collected = '';
  let buffer = '';

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const content = JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if (content) collected += content;
          } catch {
            // Ignore partial frames; the next chunk completes them.
          }
        }
        controller.enqueue(chunk);
      },
      flush() {
        if (collected) onComplete(collected);
      },
    }),
  );
}
