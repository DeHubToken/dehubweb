# Connected account MCP

`https://dehub.io/mcp` is the account connector. Public browsing requires no login.
Account actions use OAuth authorization code + S256 PKCE, with exact registered
HTTPS callbacks and the MCP resource bound to `https://dehub.io/mcp`.

## Tools and permissions

| Scope | Account controls |
| --- | --- |
| `dehub:read` | Connected identity, own posts, followers/following, notifications, bookmarks, generation status and private Creator library |
| `dehub:profile` | Username, display name, bio, avatar, banner and profile privacy |
| `dehub:social` | Publish ordinary posts, comments/replies, reactions, follow/unfollow, bookmarks and notification read state |
| `dehub:generate` | Images, video, audio and 3D through the existing Creator endpoints |

`dehub_features` describes supported chat controls and links to app surfaces for
encrypted messages, timeline editing, live capture, wallet signatures and agent
tasks. These features retain their existing app authentication and signing flow.

## Connection lifecycle

Discovery documents are at `/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server`; resource-path variants are supported.
Dynamic registration, authorization, token exchange and revocation live under
`/mcp/oauth/`. Each tool declares its security scheme and scope.

The authorization redirect opens `/connect/chatgpt?authorization=...`. It contains
an opaque pending request ID, never a session token. The person sees the callback
origin, account address and requested permissions before approving. Consent and
connection management require a verified DeHub session and same-origin POST.

The `ACCOUNT_MCP` SQLite Durable Object stores grants and credentials privately.
Codes, access tokens and refresh tokens are hashed as storage keys. Codes and
refresh tokens are consumed atomically; refreshes rotate the refresh credential.
Access tokens last one hour. Each grant holds its own DeHub session (listed in
Active sessions as "<app> (DeHub connector)"), issued by `POST /auth/connector-session`
and rotated through `/auth/refresh` before its 15 minute access token runs out.
Grants slide to 30 days on every refresh, so a connection used at least weekly stays
linked; one idle past the DeHub refresh lifetime asks to reconnect. Every tool request
revalidates the underlying DeHub session and takes identity from that session.
Expired or revoked credentials never fall back to anonymous account access.
The connection page lists active grants for the signed-in account and can revoke
them immediately. Expired records are collected by the object's bounded alarm.

## Creator and publication behavior

Model IDs and quotes use the existing shared Creator catalogue and pricing code.
Generation calls the same authenticated Edge Functions as web and mobile, keeping
credit, transfer, starter allowance, provider routing and refund checks intact.
No wallet keys are exported and the connector cannot sign a transfer or mint.

Generation and publication require a request UUID. The account and request ID
reserve one operation before contacting the service. A retry with changed content
is refused; an ambiguous response is retained rather than starting another paid
job. Status lookup accepts only a job ID previously stored for the same account,
and uses its recorded provider ticket. It makes one request and starts no watcher.
Paid outputs use the existing journal/library recovery; starter images are saved
with the same private library upload protocol. Save failures are reported using
`savePending`. No generation automatically becomes a public post.

Profile/post media inputs accept only HTTPS DeHub CDN or storage URLs. Downloads
reject redirects, enforce MIME type and stream size limits. Output links can
expire and can be refreshed from the account's Creator library.

## Deployment and app registration

The account endpoint ships with the production Worker through the existing
`production-deploy.yml` workflow. The new Durable Object binding and migration
are versioned in `wrangler.jsonc`; no Supabase schema migration or paid deployment
chat is needed. The previous public `/functions/v1/mcp` connector and key-based
`dehub-mcp/k/...` agent connectors remain compatible with existing clients.

An existing published ChatGPT app must be updated in its developer configuration
to use `https://dehub.io/mcp`, OAuth discovery and a fresh tool scan. Shipping the
server alone does not change the tool catalogue already registered with ChatGPT.
Custom OAuth connectors can use the new endpoint immediately after deployment.

CI runs the authentication, authorization, ownership and retry tests in
`server/account-mcp.test.mjs`, the Worker bundle validation and the app typechecks.
The mobile connection guide uses the same endpoint and browser account manager;
existing agent URLs remain separate.
