# Maintenance mode

## Serving the notice during a server outage

`MAINTENANCE_MODE: "true"` in `wrangler.jsonc` enables the static edge notice.
The `dehub.io/*` Worker route serves it without React, auth, API calls or the
DigitalOcean gateway. Page requests return HTTP 503 with Retry-After and
no-store/noindex headers. `/maintenance.json` returns `{"enabled":true}` for
the already-published Android gate. This does not publish an iOS update.

For the October 15 outage, proxy only the existing apex A record through
Cloudflare after this Worker version is deployed. Preserve its content
`138.68.188.224`; the API record and other hostnames retain their current routing.
The static notice uses only Worker-hosted fonts and artwork. `/version.json`
and app association files remain available for release checks and app links.

Recovery: verify the server is healthy first, then restore the apex record to
DNS-only (same A record content). Change `MAINTENANCE_MODE` to `"false"` and
remove the temporary apex Worker route through a PR and deploy. Confirm normal
web and Android access after both changes. Keep the separate origin hostname
attached to the existing Worker.

## Application screen

The Intermission screen is shared across web and mobile. Preview it at
https://dehub.io/maintenance without taking the platform offline.

`public/maintenance.json` is the activation switch. Set `enabled` to `true`
through a PR and deploy production to show it; set it back to `false` and
deploy to reopen. It ships disabled. This is a client presentation gate, not
an API authorization control or a replacement for backend write restrictions.

Both clients read the same uncached production document on launch, on return
to the foreground, and when someone presses Try again. There is no interval
polling. A failed check preserves the previous state; an ordinary network
failure cannot activate maintenance. Try again restores the original web URL
or mobile launch flow after the switch is disabled.

Web and native use their existing glass primary buttons with 12px corners.
The artwork is bundled on mobile so the screen can render without fetching
its images during maintenance. A new native runtime is not required.
