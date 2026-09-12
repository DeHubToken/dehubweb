# Independent edge reachability canary

Deploy this directory as an isolated Vercel project, framework Other, with no
build or install command. It requires no secrets or application dependencies.
Do not change production DNS or either client's routing for this experiment.

The deployment has three read-only checks:

- `/api/health`: checks the independent edge/function itself.
- `/api/web`: checks that it can retrieve the application shell from staging.
- `/api/backend`: checks that it can reach the existing public API health endpoint.

Visitor cookies, auth headers, bodies and query parameters are never forwarded.
Responses are not cached; upstream requests have a ten-second deadline and do
not follow redirects. This is not a production app or an authenticated API proxy.

Before building the full gateway, verify all three endpoints with valid HTTPS
from the affected Android device while the original Cloudflare addresses fail.
Record the deployment hostname, DNS answers, results and elapsed times. A test
from the laptop alone does not prove phone recovery.

The next phase needs a suitable commercial hosting plan, explicit cache and
credential handling, stable upstream hostname to prevent routing loops, web
assets/auth/CORS checks, and matching web/native route selection. Keep existing
Cloudflare proxy protection and TLS. Do not publish a raw backend IP as a fix.
Do not switch live DNS until that gateway is verified.

Run the dependency-free tests with `npm test` in this directory.
