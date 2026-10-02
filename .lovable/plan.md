# Scroll freeze reports for "early" (read-only findings)

## Query results (verified)
The query worked. Rows match wallet 0x4642…a239. All are `ScrollFreeze`, "A drag moved the finger but not the page". Browser: Samsung Internet 30.0 (Chrome 143), Android 10, dehub.io.

| Server time (UTC) | Route | Touch target / at finger | scrollTop | contentHeight | viewport |
|---|---|---|---|---|---|
| 16:42:28 (ep 3) | /app | video.object-contain / same | 0 | 21753 | 384x654 |
| 16:40:45 (ep 2) | /app | video.object-contain / same | 0 | 21681 | 384x654 |
| 16:38:41 (ep 1) | /app/post/6237 | div.fixed.top-0.bottom-0.z-10 / img | 3412 | 6567 | 384x750 |
| 15:13:10 | /app | button.gap-0.5 / h3 | 0 | 8894 | 384x654 |
| 14:38:15 (ep 2) | /app/explore | span.truncate / div | n/a | n/a | n/a |

Every row shows the same thing:
- blockedBy [], lockOwners [], overlays [], overlayNodes 0, coveringLayer null
- body: position static, overflow-y auto, pointer-events auto, no inline style; html overflow-y auto
- bodyHeight "654.222px", which equals the viewport, while the content is 6.5k–21k px tall
- touchDefaultPrevented false, recoveryAttempted true, recovered false, undone []

## Likely cause (inferred from the evidence, not confirmed)
Nothing is blocking the touch. No scroll lock, overlay or preventDefault shows up in the data. The page is not covered or locked. The body is pinned to viewport height with overflow-y auto. That makes the body its own inner scroller, so the document itself has nothing to scroll. Samsung Internet doesn't reliably send touch drags to that inner scroller, especially when the drag starts on a video. scrollTop 0 on /app fits that. The current Samsung recovery (restoreDocumentTouchScroll) rebuilds the same layer, so it never recovers.

On the post page (16:38), the drag started on the fixed post layer, which is the `data-scroll-nav-source` overlay. That overlay was not counted as an overlay, so the post-overlay path is a second suspect.

## Proposed next step (only if you approve; nothing has been changed)
1. Find the CSS that gives body a fixed height plus overflow-y auto. Confirm it's the scroller with a Playwright run using the Samsung userAgent.
2. Then decide on a fix, for example letting the document scroll on Samsung or adding the post layer to the watchdog's checks.
