# Image-post music audit — 27 September 2026

## Findings and changes

| Area | Finding | Change |
| --- | --- | --- |
| Feed mapping | The legacy image mapper omitted soundtrack fields and rendered the raw tag as a caption. Direct post routes behaved differently. | Parse soundtracks in both feed adapters and retain raw metadata separately from display copy. |
| Editing | Direct image posts supplied a cleaned caption to the edit flow, losing the attachment on save. | Preserve the raw caption for editing. |
| Playback | Each visible image independently attempted audible autoplay, without joining the feed's audio ownership manager. | Start on explicit intent, claim feed audio ownership, pause when displaced, offscreen, hidden, gated, or unmounted. Returning to view does not restart music. |
| Controls | Tiny icons and 10px text, no action label, loading state, or retry. | At least 44px control height, readable title and artist, explicit Play/Pause/Retry, cancelable loading, screen-reader labels, keyboard focus, bounded loading timeout. |
| Fullscreen | The soundtrack continued while its controls were hidden behind the gallery. | Fullscreen uses the card's existing control and audio element, preserving playback position. |
| Media costs | Every soundtrack preloaded metadata. | Attach the source only on a tap; no soundtrack download while browsing silently. |
| Metadata | Full URLs were prefixed with the CDN host; colons and brackets broke title/artist boundaries. | Resolve relative or absolute HTTP(S) URLs; encode and decode metadata fields; retain legacy tag support. |
| Composer | Missing audio paths used a different fallback from mobile and legacy tags. | Use the same feed-audio fallback; clear preview state after failure. |
| Native parity | Badge state was optimistic, ignored feed visibility/navigation/background state, and could start after an async setup had been cancelled. | Native status-driven controls, cancellation generations, focus ownership, pause-on-leave, loading timeout, gated rendering, and fullscreen controls. |

## Verification

- Existing staging examples: `/app/post/5421` and `/app/post/6057`.
- Web regression tests exercise lazy loading, explicit playback, viewport exit, pending cancellation, failed playback/retry, gates, ownership transfer, metadata parsing, and pause-position preservation.
- Native regression tests exercise native status confirmation, asynchronous focus cancellation, visibility, retry, legacy tags and encoded metadata.
- Existing cached-page and audio-handoff suites cover neighbouring playback behavior.

## Limits

This is not a claim of perfection. Native fullscreen is a separate playback surface: opening it pauses the feed and requires a tap in the viewer. Continuous feed-to-detail/native-gallery handoff and a universal coordinator covering radio, live stages, and every off-document player remain separate architectural work. No physical iOS/Android playback claim can be made from browser or mocked tests. Historical malformed tags with unescaped delimiters cannot be reliably reconstructed automatically. Deployed verification and OTA publication must be recorded separately from a successful merge.
