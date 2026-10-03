# Mobile web layout and scroll audit — 3 October 2026

Scope: first-photo layout, browser version detection, document scrolling,
feed/profile swipe handlers, overlay ownership and post-overlay recovery.
Reviewed against web main `eb072cf46319cd355a7c8ff6c0cb6b6fd0b15766`.

## Confirmed findings and corrections

1. **First public image never matched the new layout selectors.** Production
   DOM has `data-image-card > data-image-media > div[data-no-swipe] >
   data-media-full`. All seven new selectors assumed the last container was
   directly inside `data-image-media`. They therefore left the previous
   floating-capsule clearance in place and did not reorder the author row.
   Corrected only that relationship to allow the existing carousel wrapper.
   Rules remain limited to the first actual image in the System phone feed,
   at widths up to 639px. Later images and mature-content warnings do not match.
   The live HTML, entry bundle and CSS identified the deployed build as
   `eb072cf4`; this was a layout bug in the deployed code, not proof of a stale
   client cache.

2. **Global scroll monitoring could block native swipe delivery.** The
   watchdog registered a cancellable window touchmove listener on every route.
   After a Samsung feed stall it cancelled later vertical swipes and assigned
   offsets manually, without native release momentum. Eligibility checks also
   walked computed styles on each such move. Removed manual gesture takeover
   and made the monitor passive again. Freeze evidence and orphaned-lock
   recovery remain enabled, including on profiles.

3. **Post-overlay recovery could interrupt an active swipe.** The Samsung
   rebuild declined an active touch, but its caller then fell through to a
   one-pixel nudge and offset restoration. That restoration could also rewind
   a swipe which began between frames. Recovery now waits for touch release
   and a quiet scroll interval; it does not rewind a changed offset or a new
   gesture. Owned modal/fullscreen locks are still respected. The poll also
   avoids changing body locks in the middle of a gesture.
   Passive capture listeners also observe release when a horizontal carousel
   stops bubbling touchend; otherwise the watchdog could retain an active
   gesture indefinitely. A remaining finger after multi-touch keeps recovery
   deferred.

4. **Version notifications could leave an old session silent.** The watcher
   delayed its initial check by three minutes, stopped after the first notice
   and saved a notification flag before any UI was necessarily seen. It now
   checks at startup, foreground return, history restoration and reconnect,
   polls visible pages once a minute, and continues across later deployments.
   Only explicit user dismissal suppresses that deployment's prompt. Stale
   translation responses cannot replace the notice for a newer deployment.

## Other scroll paths reviewed

- `document-scroll`: body is intentionally the active scroller because of the
  existing height/overflow rules. No migration of the scrolling element.
- `body-scroll-lock`, drawer/dialog release, and fullscreen ownership:
  reference-counted locks remain in force while the owning surface is open.
- Home/profile pull-to-refresh: own-top and nested-scroll guards reviewed;
  no unconditional document-scroll cancellation added.
- Home tab swipes, horizontal carousels, image viewers and sliders: keep their
  existing local gesture ownership. The global monitor no longer takes over.
- Profile route entry: offset reset runs on profile lookup changes, rather
  than on every scrolling render.
- Scroll direction and content clipping: handlers are passive; the clipping
  hook detaches on inactive cached pages. Geometry reads and clipping remain
  potential device-specific performance costs to measure if lag persists.

## Validation and limits

Regression coverage checks the real wrapped public-image shape, preservation
of warnings/later cards, native swipes after a failed drag, continued gestures,
momentum, new swipes between recovery frames, nested scrolling, overlay locks,
version remounts, explicit dismissal, later deployments and history restoration.
Existing body-lock and fullscreen regression checks are included.

This is a source/behaviour audit, with the live DOM relationship independently
confirmed. The cloud browser does not provide a phone viewport or Samsung
Internet input; desktop DOM observations are not an on-device scroll test.
The fixes address confirmed defects but do not prove the original Samsung
compositor stall is completely eliminated. Physical-phone verification and a
performance trace remain necessary if profile lag continues.

This report covers scrolling and these layout/update defects. It does not
complete the separately requested web/mobile/backend security audit.
