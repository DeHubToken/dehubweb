# Mobile and web appearance

The phone layout at https://dehub.io is the reference for the Android app. Changes to native presentation must preserve existing navigation, keyboard handling, uploads, recording, calls, payments, polls, privacy, and accessibility actions.

Web's reference implementation is `src/components/app/page-kit/PageKit.tsx`, `src/styles/page-kit.css`, the messaging pages, and the active theme's surface styles. Native coverage is recorded in [dehub-mobile/docs/mobile-page-appearance.md](https://github.com/DeHubToken/dehub-mobile/blob/main/docs/mobile-page-appearance.md).

## Shared rules

| Surface | Phone appearance |
| --- | --- |
| Ordinary page header | Title island with 15px corners, 32px semantic artwork, 17px bold title, 11.5px subtitle, and 36px action squares. Search and filter rows belong inside its material. |
| Direct and public conversations | Flat identity header, full-width composer above its action toolbar, visible native search, attachments, recording, and sending actions. |
| System, Immersive, and Minimal sections | Full-width transparent content between 1px hairlines; ordinary content receives 16px horizontal and 18px vertical padding. |
| Canvas-theme sections | The active theme's card fill and rim, rather than a stale System-grey panel. Existing content dimensions and handlers remain intact. |
| Buttons and selected tabs | Primary and quiet actions use the theme's control material; selected tabs retain their accent and disabled actions remain disabled. |
| Dialogs and pickers | The active theme's legible panel material with an opaque base where content would otherwise show through. |
| Artwork | Resolve the semantic key through the published theme pack; never request an unpublished filename or pin another theme to System artwork. |
| Media and exchange | Preserve deliberate media darkness, profile covers, brand colours, and the exchange's slate trading palette. |

The native app currently exposes fourteen themes: System, Immersive, Minimal, Cosmic, Hazy, Swarms, Lava Lamp, Winter, War, Osaka, Jungle, Island, Hacker, and Horror. Web additionally exposes Light. This contract does not add a native Light selector. Immersive shares the System artwork pack while preserving its immersive content treatment.

## Verification

Image feed surfaces follow the same contract on both clients: canvas themes remain visible behind glass cards when a collage opens into a feed. The cached collage is hidden while the feed is open and retains its scroll state for the return. Native fullscreen image feeds keep an opaque base from the current theme to cover their previous route. Drawer and grab-strip materials must update after a theme change rather than retain colours captured when their module first loaded.

Shared-component tests should exercise ordinary header visibility across every native theme, theme material precedence over stale caller fills, disabled controls, published artwork keys, search navigation, and modal dismissal. Full checks run in GitHub-hosted CI.

Source coverage across all native screen files is distinct from device verification. After Android publication, check a flat theme and a canvas theme on the installed app, including settings/search, a keyboard-open conversation, attachments, recording controls, and representative dialogs. Opening a media or profile route must retain its intended cover treatment. Do not count an unpublished bundle or a merged PR as a verified installed update.

Presentation parity does not require sending a message, placing a call, making a payment, or invoking a paid generation during a visual check. Data-dependent and private states need their own suitable fixtures or device evidence before they are marked verified.

## Page header ownership

Native ScreenHeader follows web PageIsland: page tabs share the title material, with one gutter and a bounded horizontal strip. Work, WorkHistory, and Communities keep search and filters inside their header. Apps categories, billing cadence, Affiliate tiers, wallet and TV section controls remain in the body. Collapsible headers measure the full content so list padding and refresh offsets clear every control.
