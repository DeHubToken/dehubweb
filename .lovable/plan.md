

## Why Some Users Are Seeing "An error occurred" in the Assistant

### Root Cause Analysis

The screenshot shows a Turkish-language user getting "Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin." (the `assistant.errorGeneric` translation) on every message. This comes from the catch block in `AssistantPage.tsx` (line 916-922).

The edge function logs show **no errors** — requests are processing successfully. This means the error is happening **client-side** before or after the edge function call. Possible causes:

1. **Edge function timeout on the published site** — the published app may be hitting a different deployment or the AI gateway may be intermittently slow/failing for some users (e.g., rate limits, regional latency).
2. **The catch block swallows all error details** — when any exception occurs (network timeout, JSON parse error, etc.), the user only sees the generic error with no diagnostic info logged to the backend.
3. **No retry mechanism** — a single transient failure shows the error immediately with no recovery option.

### Plan

#### 1. Add better error handling and logging in the catch block
- Log the actual error to `client_error_logs` via the existing logger so we can see what's failing on the published site.
- Include the user's message content (first 50 chars), the selected model, and the error message/status.

#### 2. Add automatic retry with exponential backoff
- Retry the `general-ai-chat` call up to 2 times on transient failures (network errors, 429, 500, 502, 503).
- Only show the error message after all retries are exhausted.

#### 3. Add a "Retry" button on error messages
- When the generic error is shown, include a small "Retry" button so users can tap to resend their last message without retyping.

#### 4. Improve edge function error responses
- In `general-ai-chat/index.ts`, add a timeout wrapper around the AI gateway fetch (e.g., 25s `AbortController`) so we get a clear timeout error instead of hanging.
- Return more specific error messages (timeout vs rate limit vs API failure) so the client can show better feedback.

### Files to modify
- `src/pages/app/AssistantPage.tsx` — retry logic, error logging, retry button
- `supabase/functions/general-ai-chat/index.ts` — fetch timeout, better error messages

