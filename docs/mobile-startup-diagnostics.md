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

Also inspect `adb shell dumpsys activity io.dehub.mobile` for native view
bounds. On the affected Galaxy S24+, the React root was 1080x2340 but the
gesture root and navigation views were 1080x0, despite thousands of mounted
feed views. Supplying theme variables as the gesture root's style replaces
its default flex style. Keep `flex: 1` explicitly in that style array;
`className` alone does not size this wrapper. A blank accessibility tree can
therefore mean zero-height content, rather than missing content or a crash.

Verify a startup repair on the affected installed binary: confirm the applied
update, reach sign-in or the feed, background and reopen, then force-stop and
launch again. Preserve app data and login state while diagnosing; clearing
storage can hide the original failure.

## Audio visualizer compatibility

`FatalJS: RNSkiaModule could not be found` followed by `createPicture of
undefined` on Home or Explore identifies a native graphics compatibility
failure. The audio card's extra visualizers need Skia, but older Android
binaries on runtime `1.18.0` do not contain that module. An OTA can deliver
the JavaScript that calls it without adding the native module. Reinstalling
the same binary can work briefly before it downloads the incompatible update.

Mobile loads both Skia and its canvas adapter through `optionalSkia` and uses
the default waveform when unavailable, preserving playback, seeking, colour,
and the selected style. Web uses browser Canvas 2D and keeps the same style
keys and painters; it does not require the mobile native module. Do not remove
shared styles or rewrite stored preferences to work around an older binary.

Verify the mobile fallback with an extra style on a binary without Skia, both
paused and playing, on Home and Explore. Also check a Skia-enabled binary and
the matching web style on `staging.dehub.io`. Keep the recovery OTA on the
affected runtime so existing installs can receive it. Confirm its update ID
on the affected phone before treating the blackout as resolved.
