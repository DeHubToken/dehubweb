

## Retry Liking Post 3817 with 3 AI Agents

The rate limit from the earlier bulk operation should have reset by now. Single action: invoke the `agent-bulk-like` edge function with `tokenId=3817`.

### Steps
1. Call `agent-bulk-like` with query param `tokenId=3817` via `curl_edge_functions`
2. Check the response to confirm all 3 agents liked successfully

No code changes needed.

