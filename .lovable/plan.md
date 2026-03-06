

## Training the AI Assistant with User Context

This isn't about "training" the model itself, but rather enriching the **system prompt** sent with each request so the assistant knows who it's talking to and can reference their data.

### Approach

1. **Gather user context on the client** before sending messages — collect the logged-in user's profile info (username, display name, wallet address, DHB balance, follower/subscriber counts, tips earned, badge count, etc.) from existing hooks/API calls that are already available in the app.

2. **Send that context as part of the request** to the `general-ai-chat` edge function in a new `userContext` field alongside `messages`.

3. **Inject it into the system prompt** on the backend — the edge function prepends a structured block like:

```text
You are talking to @lastchad (display name: "Last Chad").
Their wallet: 0x1234...
DHB Balance: 12,500 DHB
Followers: 340 | Following: 120 | Subscribers: 15
Tips received: 8,200 DHB | Tips sent: 1,500 DHB
Badge count: 3
```

This way the assistant can answer questions like "how many followers do I have?" or "what's my balance?" without the user needing to tell it.

### What data to include

From existing hooks already in the app:
- **useDeHubAccount**: username, displayName, avatar, followers, following, subscribers, likesReceived
- **useOnchainDHBBalance**: current DHB token balance
- **tip_leaderboard_cache table**: sent/received tip totals
- **Wallet address**: from AuthContext

### Implementation steps

1. **Create a `useAssistantUserContext` hook** that aggregates data from the above sources into a single object
2. **Pass `userContext` from AssistantPage** to the edge function call
3. **Update `general-ai-chat` edge function** to accept `userContext` in the request body and inject it into the system prompt
4. **Keep it lightweight** — only send summary stats, not full transaction histories

### Security note

The user context is informational only. The backend should not trust it for authorization decisions — it's just for the AI to reference in conversation. Sensitive fields like private keys are never included.

