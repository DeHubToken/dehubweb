# Mobile startup diagnostics

The web and mobile clients send errors to `client_error_logs` through the
`client-logs` function. Filter by `metadata.platform`, `metadata.model`,
`metadata.nativeBuildVersion`, and `metadata.updateId` before attributing a
report to a particular installed build. A successful OTA publication does not
prove that a phone applied it or that its next launch succeeded.

On Android, a logo that never disappears can be a startup hang with a live
process. Check ADB's crash buffer and `dumpsys activity exit-info
io.dehub.mobile` alongside the server logs. `USER REQUESTED / FORCE STOP`
records from a reproduction are not spontaneous crashes.

The mobile root safe-area provider must receive initial metrics, including a
fallback when native window metrics are unavailable. Otherwise its children
can remain unmounted until an insets event arrives. Those children include
the boot gate that hides the splash and reports stalled launches, so an empty
error table cannot exclude this failure. Later native measurements still
replace the initial values. The browser uses CSS safe-area environment values
and does not have this native provider dependency.

Verify a startup repair on the affected installed binary: confirm the applied
update, reach sign-in or the feed, background and reopen, then force-stop and
launch again. Preserve app data and login state while diagnosing; clearing
storage can hide the original failure.
