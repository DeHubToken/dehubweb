# Maintenance mode

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
