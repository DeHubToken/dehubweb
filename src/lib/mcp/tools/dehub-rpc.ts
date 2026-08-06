/**
 * Client for the dehub-mcp edge function.
 *
 * dehub-mcp is a real MCP server speaking Streamable HTTP, not a plain JSON-RPC
 * endpoint. Two things it insists on, and which the previous helper got wrong:
 *
 *  - `Accept` must list both `application/json` and `text/event-stream`, or the
 *    transport rejects the request with 406 before any tool runs.
 *  - The method is `tools/call` with `{ name, arguments }`; a bare tool name as
 *    the method resolves to nothing.
 *
 * Every tool in this directory previously sent the bare form without the Accept
 * header, so all of them failed for every caller.
 */

export const DEHUB_MCP_URL = "https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/dehub-mcp";

interface McpToolResult {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * Streamable HTTP answers with an SSE frame even for a single response, so pull
 * the last `data:` payload out. A plain JSON body is also accepted, since the
 * transport is allowed to send one.
 */
function parseStreamableResponse(raw: string): { result?: McpToolResult; error?: { message?: string } } {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("DeHub MCP returned an empty response");

  if (trimmed.startsWith("{")) return JSON.parse(trimmed);

  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (!dataLines.length) throw new Error("DeHub MCP returned no data frame");
  return JSON.parse(dataLines[dataLines.length - 1]);
}

/** Call a tool on dehub-mcp and return its structured payload. */
export async function callDeHubTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(DEHUB_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!response.ok) {
    throw new Error(`DeHub MCP request failed with HTTP ${response.status}`);
  }

  const payload = parseStreamableResponse(await response.text());
  if (payload.error) throw new Error(payload.error.message ?? "DeHub MCP error");

  const result = payload.result;
  if (!result) throw new Error("DeHub MCP returned no result");

  // A tool can fail while the transport succeeds; surface its message rather
  // than handing back an error object dressed as data.
  const body = result.structuredContent ?? safeParse(result.content?.[0]?.text);
  if (result.isError) {
    const message = (body as { error?: string } | undefined)?.error;
    throw new Error(message ?? "DeHub tool call failed");
  }

  return body ?? {};
}

function safeParse(text: string | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}
