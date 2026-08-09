/**
 * kie.ai provider client — the cheap lane.
 * ========================================
 * kie.ai resells most of the models the studio already offers at well below
 * fal's rates (flat-rate Veo instead of per-second is the headline). The
 * generation functions route a job here when the model has a kie listing and
 * the inputs are kie-compatible, and fall back to the existing fal/Replicate
 * path otherwise — so a kie outage degrades cost, never availability.
 *
 * Two API surfaces, both polled:
 *
 * - The unified "jobs" market API (`/api/v1/jobs/createTask` +
 *   `/api/v1/jobs/recordInfo`) covers everything except Veo. Every model takes
 *   its own input shape, so the callers keep per-model builders just as they
 *   do for fal.
 * - Veo has a dedicated endpoint pair (`/api/v1/veo/generate` +
 *   `/api/v1/veo/record-info`) with a different status vocabulary
 *   (`successFlag` 0/1/2/3 instead of state strings).
 *
 * One sharp edge worth keeping in mind: kie fetches media inputs by URL. It
 * does not take inline `data:` payloads, so any job carrying one must stay on
 * fal — `kieUsableUrl` is that check.
 */

const KIE_API_BASE = 'https://api.kie.ai';

/** The API key, or null when the secret is not configured in this project. */
export function kieKey(): string | null {
  return Deno.env.get('KIE_API_KEY') || null;
}

function kieHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/**
 * True when this input can be handed to kie. kie downloads inputs from a URL,
 * so a `data:` URI (the poster logo path, some chat edits) disqualifies the
 * job. Absent inputs are fine — text-to-anything has nothing to fetch.
 */
export function kieUsableUrl(url: string | undefined | null): boolean {
  return !url || /^https?:\/\//i.test(url);
}

export interface KieTaskStatus {
  /** waiting | queuing | generating | success | fail */
  state: string;
  resultUrls: string[];
  failMsg?: string;
}

/** Submit a jobs-API task. Returns the taskId to poll. */
export async function kieCreateTask(
  key: string,
  model: string,
  input: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: kieHeaders(key),
    body: JSON.stringify({ model, input }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`kie createTask ${res.status}: ${text.substring(0, 300)}`);
  }
  const data = JSON.parse(text) as { code?: number; msg?: string; data?: { taskId?: string } };
  const taskId = data.data?.taskId;
  if (data.code !== 200 || !taskId) {
    throw new Error(`kie createTask rejected: ${text.substring(0, 300)}`);
  }
  return taskId;
}

/** One status read on a jobs-API task. */
export async function kieTaskStatus(key: string, taskId: string): Promise<KieTaskStatus> {
  const res = await fetch(
    `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: kieHeaders(key) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`kie recordInfo ${res.status}: ${text.substring(0, 300)}`);
  }
  const data = (await res.json()) as {
    code?: number;
    data?: { state?: string; resultJson?: string; failMsg?: string; failCode?: string };
  };
  const state = data.data?.state ?? 'waiting';
  let resultUrls: string[] = [];
  if (state === 'success' && data.data?.resultJson) {
    try {
      const parsed = JSON.parse(data.data.resultJson) as { resultUrls?: string[] };
      resultUrls = parsed.resultUrls ?? [];
    } catch {
      // A success with unreadable results is treated as a failure by callers,
      // because resultUrls stays empty.
    }
  }
  return { state, resultUrls, failMsg: data.data?.failMsg || undefined };
}

/**
 * Block until a jobs-API task settles, for the synchronous callers (images).
 * Video callers poll from the client instead and never use this.
 */
export async function kieWaitForResult(
  key: string,
  taskId: string,
  { timeoutMs = 120_000, intervalMs = 2_000 } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await kieTaskStatus(key, taskId);
    if (status.state === 'success') {
      const url = status.resultUrls[0];
      if (!url) throw new Error('kie task succeeded but returned no result URL');
      return url;
    }
    if (status.state === 'fail') {
      throw new Error(`kie task failed: ${status.failMsg || 'no reason given'}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`kie task ${taskId} timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ─── Veo dedicated API ───────────────────────────────────────────────────────

/** Submit a Veo render. Returns the taskId to poll with kieVeoStatus. */
export async function kieVeoGenerate(
  key: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/veo/generate`, {
    method: 'POST',
    headers: kieHeaders(key),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`kie veo generate ${res.status}: ${text.substring(0, 300)}`);
  }
  const data = JSON.parse(text) as { code?: number; data?: { taskId?: string } };
  const taskId = data.data?.taskId;
  if (data.code !== 200 || !taskId) {
    throw new Error(`kie veo generate rejected: ${text.substring(0, 300)}`);
  }
  return taskId;
}

export interface KieVeoStatus {
  status: 'starting' | 'processing' | 'succeeded' | 'failed';
  videoUrl?: string;
  error?: string;
}

/** One status read on a Veo task. successFlag: 0 generating, 1 done, 2/3 failed. */
export async function kieVeoStatus(key: string, taskId: string): Promise<KieVeoStatus> {
  const res = await fetch(
    `${KIE_API_BASE}/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`,
    { headers: kieHeaders(key) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`kie veo record-info ${res.status}: ${text.substring(0, 300)}`);
  }
  const data = (await res.json()) as {
    data?: {
      successFlag?: number;
      errorMessage?: string;
      response?: { resultUrls?: string[] };
    };
  };
  const flag = data.data?.successFlag ?? 0;
  if (flag === 1) {
    const url = data.data?.response?.resultUrls?.[0];
    if (!url) return { status: 'failed', error: 'Veo finished but returned no video URL' };
    return { status: 'succeeded', videoUrl: url };
  }
  if (flag === 2 || flag === 3) {
    return { status: 'failed', error: data.data?.errorMessage || 'Video generation failed on kie.ai' };
  }
  return { status: 'processing' };
}
