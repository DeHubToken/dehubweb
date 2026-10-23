import { BlogPost as BlogPostType } from '@/types/blog';

export const q4DevelopmentOverviewPost: BlogPostType = {
  id: 'q4-development-overview',
  slug: 'q4-development-overview',
  title: 'Q4 Development Overview',
  excerpt: 'Everything we shipped since October across dehubweb, dehub-mobile, dehub-stream-backend and stream-admin-hub — the video editor, Creator and Maboroshi, AI agents, feeds, live, profiles, System Light, wallets and the stats page, with the pull request next to each entry.',
  content: `
## Q4 so far

Since October 1 we merged more than 1,150 changes across four repositories: [dehubweb](https://github.com/DeHubToken/dehubweb) (about 650 commits), [dehub-mobile](https://github.com/DeHubToken/dehub-mobile) (about 520), [dehub-stream-backend](https://github.com/DeHubToken/dehub-stream-backend) (27) and [stream-admin-hub](https://github.com/DeHubToken/stream-admin-hub). This page groups every distinct piece of that work by what it changed for you, with the pull request next to each entry, and grows as the quarter goes on.

## The video editor became a studio

The browser editor from Q3 is now a full production tool on web and in the app:

- Projects save to the cloud with version history ([d745ec08bf](https://github.com/DeHubToken/dehubweb/commit/d745ec08bf), [f7381fff80](https://github.com/DeHubToken/dehubweb/commit/f7381fff80)), merge saves from several of your devices ([#2396](https://github.com/DeHubToken/dehubweb/pull/2396), [mobile #1765](https://github.com/DeHubToken/dehub-mobile/pull/1765)), keep conflicting edits instead of dropping them ([#2380](https://github.com/DeHubToken/dehubweb/pull/2380), [#2381](https://github.com/DeHubToken/dehubweb/pull/2381)), and can be searched with a recoverable Trash ([#2367](https://github.com/DeHubToken/dehubweb/pull/2367)).
- Share a cut for review: reviewers leave timestamped comments ([#2370](https://github.com/DeHubToken/dehubweb/pull/2370), [mobile #1738](https://github.com/DeHubToken/dehub-mobile/pull/1738)), accepted editors can save the shared project ([00f99b6174](https://github.com/DeHubToken/dehubweb/commit/00f99b6174)), anyone invited can decline or leave ([#2371](https://github.com/DeHubToken/dehubweb/pull/2371)), and an optional live session shows who else is editing ([#2386](https://github.com/DeHubToken/dehubweb/pull/2386)) with your unfinished edits protected while others' changes arrive ([#2415](https://github.com/DeHubToken/dehubweb/pull/2415), [#2420](https://github.com/DeHubToken/dehubweb/pull/2420), [#2421](https://github.com/DeHubToken/dehubweb/pull/2421), [#2422](https://github.com/DeHubToken/dehubweb/pull/2422), [#2424](https://github.com/DeHubToken/dehubweb/pull/2424), [#2426](https://github.com/DeHubToken/dehubweb/pull/2426)).
- The editor finds the good parts for you: speech highlights you can review ([afafe7ead4](https://github.com/DeHubToken/dehubweb/commit/afafe7ead4)), highlights that respect the topics you ask for ([#2324](https://github.com/DeHubToken/dehubweb/pull/2324)), optional visual highlights read from the frames ([#2372](https://github.com/DeHubToken/dehubweb/pull/2372), [#2375](https://github.com/DeHubToken/dehubweb/pull/2375)), and refinements by chat ([#2330](https://github.com/DeHubToken/dehubweb/pull/2330), [#2337](https://github.com/DeHubToken/dehubweb/pull/2337)).
- Cutting got smarter with scene-change detection ([9d5b962301](https://github.com/DeHubToken/dehubweb/commit/9d5b962301)), music beat markers with automatic cut alignment ([58a14d15d0](https://github.com/DeHubToken/dehubweb/commit/58a14d15d0)), numeric cuts you can rely on ([#2295](https://github.com/DeHubToken/dehubweb/pull/2295)), precise frame controls ([#2399](https://github.com/DeHubToken/dehubweb/pull/2399), [mobile #1768](https://github.com/DeHubToken/dehub-mobile/pull/1768)) and timed starter templates ([#2400](https://github.com/DeHubToken/dehubweb/pull/2400), [#2537](https://github.com/DeHubToken/dehubweb/pull/2537)).
- Assemble a video from media you already have, by describing it or by file name ([#2346](https://github.com/DeHubToken/dehubweb/pull/2346), [#2351](https://github.com/DeHubToken/dehubweb/pull/2351)), with picture-in-picture layers kept intact ([#2453](https://github.com/DeHubToken/dehubweb/pull/2453)) and chosen scenes matched to the prompt ([1ee9ebfbad](https://github.com/DeHubToken/dehubweb/commit/1ee9ebfbad)).
- Background removal saves against the source timing ([#2325](https://github.com/DeHubToken/dehubweb/pull/2325)) and handles long clips in pages ([#2392](https://github.com/DeHubToken/dehubweb/pull/2392)).
- Sound: normalise volume and clean up voices ([#2303](https://github.com/DeHubToken/dehubweb/pull/2303), [#2388](https://github.com/DeHubToken/dehubweb/pull/2388)), keep original fades through cuts ([#2326](https://github.com/DeHubToken/dehubweb/pull/2326)), create soundtrack drafts ([#2507](https://github.com/DeHubToken/dehubweb/pull/2507)) and sound effects ([#2510](https://github.com/DeHubToken/dehubweb/pull/2510)), and import Wikimedia audio ([#2509](https://github.com/DeHubToken/dehubweb/pull/2509)).
- Captions: import and save subtitle files ([9b4d89a5c1](https://github.com/DeHubToken/dehubweb/commit/9b4d89a5c1)), fit captions inside the frame ([#2323](https://github.com/DeHubToken/dehubweb/pull/2323)), wrap and fit any text ([#2369](https://github.com/DeHubToken/dehubweb/pull/2369)), review captions with one-step corrections ([4d3e121bc7](https://github.com/DeHubToken/dehubweb/commit/4d3e121bc7)), and translate whole caption tracks with progress and Undo ([34d61b36e3](https://github.com/DeHubToken/dehubweb/commit/34d61b36e3)).
- Record straight into the timeline ([5de751c394](https://github.com/DeHubToken/dehubweb/commit/5de751c394)), record your screen with shared sound and an optional voiceover ([d653e9fc62](https://github.com/DeHubToken/dehubweb/commit/d653e9fc62)), and on Android record the device screen into the editor ([mobile de15c03559](https://github.com/DeHubToken/dehub-mobile/commit/de15c03559)).
- Export every design page ([#2345](https://github.com/DeHubToken/dehubweb/pull/2345)), download animations as looping GIFs ([#2307](https://github.com/DeHubToken/dehubweb/pull/2307)), download cuts as separate files ([9f034e5d33](https://github.com/DeHubToken/dehubweb/commit/9f034e5d33)), share finished exports through the device picker ([#2543](https://github.com/DeHubToken/dehubweb/pull/2543)), and export animated designs as video by default ([#2542](https://github.com/DeHubToken/dehubweb/pull/2542)).
- Generation now happens in a docked editor window that stays open while you work ([#2637](https://github.com/DeHubToken/dehubweb/pull/2637), [mobile #2007](https://github.com/DeHubToken/dehub-mobile/pull/2007)), and saved media libraries connect to the editor ([#2567](https://github.com/DeHubToken/dehubweb/pull/2567)).

## Creator and Maboroshi

- Dozens of new models arrived, including FLUX video ([#2211](https://github.com/DeHubToken/dehubweb/pull/2211)) and 26 more fal models with validated inputs ([#2336](https://github.com/DeHubToken/dehubweb/pull/2336), [mobile #1713](https://github.com/DeHubToken/dehub-mobile/pull/1713)).
- Presets went from a handful to hundreds: 100 image and video presets ([91fb1110a8](https://github.com/DeHubToken/dehubweb/commit/91fb1110a8)), every published studio preset with search ([#2193](https://github.com/DeHubToken/dehubweb/pull/2193)), 180 Maboroshi presets ([#2629](https://github.com/DeHubToken/dehubweb/pull/2629)), playable viral video effects ([#2633](https://github.com/DeHubToken/dehubweb/pull/2633), [mobile #2004](https://github.com/DeHubToken/dehub-mobile/pull/2004)), playable trend videos ([#2662](https://github.com/DeHubToken/dehubweb/pull/2662)) and a real motion clip library ([ca4b719f14](https://github.com/DeHubToken/dehubweb/commit/ca4b719f14)).
- Maboroshi moved into Creator ([3ef7d85111](https://github.com/DeHubToken/dehubweb/commit/3ef7d85111), [mobile #1799](https://github.com/DeHubToken/dehub-mobile/pull/1799)) with video replacement, Creator payment options ([#2472](https://github.com/DeHubToken/dehubweb/pull/2472)), clearer clip and character editing ([#2475](https://github.com/DeHubToken/dehubweb/pull/2475)) and a lower-cost Kling rendering option ([#2686](https://github.com/DeHubToken/dehubweb/pull/2686)).
- Character workflows and reusable asset references keep a face consistent across generations ([65a971b615](https://github.com/DeHubToken/dehubweb/commit/65a971b615)), and 3D generations show real thumbnails ([7909cf22ee](https://github.com/DeHubToken/dehubweb/commit/7909cf22ee)).
- The Creator page got a new hero with a calm video background and a before-and-after intro ([#2732](https://github.com/DeHubToken/dehubweb/pull/2732), [#2733](https://github.com/DeHubToken/dehubweb/pull/2733), [#2734](https://github.com/DeHubToken/dehubweb/pull/2734)).

## AI agents and tasks

- Agents take private prompts, bulk actions and scheduled tasks ([0ef9f0a77b](https://github.com/DeHubToken/dehubweb/commit/0ef9f0a77b)), daily selective tasks such as posting and liking ([0e6dd84a7a](https://github.com/DeHubToken/dehubweb/commit/0e6dd84a7a)), and coordinate in task swarms ([#2634](https://github.com/DeHubToken/dehubweb/pull/2634), [mobile #2005](https://github.com/DeHubToken/dehub-mobile/pull/2005)).
- How many agents and tasks you can run follows your badge ([ec24e3f40e](https://github.com/DeHubToken/dehubweb/commit/ec24e3f40e)).
- Scheduled agent posts are spaced out with varied content ([#2695](https://github.com/DeHubToken/dehubweb/pull/2695)), stay inside your account limit ([#2687](https://github.com/DeHubToken/dehubweb/pull/2687)), carry thumbnails on video ([#2697](https://github.com/DeHubToken/dehubweb/pull/2697)), publish without minting ([#2680](https://github.com/DeHubToken/dehubweb/pull/2680)) and keep running while posting waits for gas ([#2672](https://github.com/DeHubToken/dehubweb/pull/2672)).
- Managed profiles can be edited privately and opened from your account cards ([4fc074bf9b](https://github.com/DeHubToken/dehubweb/commit/4fc074bf9b), [#2584](https://github.com/DeHubToken/dehubweb/pull/2584)).

## Feed, video and photos

- Phone feed videos play as clean muted previews, hug the video's own shape and open in the Shorts viewer, which carries on into the latest shorts ([#2646](https://github.com/DeHubToken/dehubweb/pull/2646), [#2651](https://github.com/DeHubToken/dehubweb/pull/2651), [mobile #2012](https://github.com/DeHubToken/dehub-mobile/pull/2012)). Phone photos and videos cap at 55% of the screen ([#2652](https://github.com/DeHubToken/dehubweb/pull/2652)).
- On desktop, feed videos hug their shape too, capped at 75% of the screen, with controls only on hover ([#2655](https://github.com/DeHubToken/dehubweb/pull/2655)).
- Only photos with a song open in Shorts; plain photos open their post, and tall photos fill the Shorts screen ([#2722](https://github.com/DeHubToken/dehubweb/pull/2722), [mobile #2066](https://github.com/DeHubToken/dehub-mobile/pull/2066)).
- Photo posts can carry a soundtrack: a glass capsule that opens into a wave along the photo, playable from the feed and draggable to seek ([#2164](https://github.com/DeHubToken/dehubweb/pull/2164), [#2169](https://github.com/DeHubToken/dehubweb/pull/2169), [mobile #1547](https://github.com/DeHubToken/dehub-mobile/pull/1547)).
- A Shorts carousel follows the first home post and returns further down, without repeating creators ([#2595](https://github.com/DeHubToken/dehubweb/pull/2595), [#2564](https://github.com/DeHubToken/dehubweb/pull/2564), [#2679](https://github.com/DeHubToken/dehubweb/pull/2679)).
- Scrolling got steadier: no more videos flashing to their poster ([#2639](https://github.com/DeHubToken/dehubweb/pull/2639)), frames locked before they scroll into view ([#2671](https://github.com/DeHubToken/dehubweb/pull/2671)), distant cards windowed out ([#2648](https://github.com/DeHubToken/dehubweb/pull/2648)) and photos and videos that keep their size ([#2664](https://github.com/DeHubToken/dehubweb/pull/2664)).
- Videos that keep getting paused offer an autoplay switch ([bcf88d28d7](https://github.com/DeHubToken/dehubweb/commit/bcf88d28d7)), foreign-language videos dub themselves with the original audio lowered ([#2299](https://github.com/DeHubToken/dehubweb/pull/2299)), and dubbing is now opt-in with a one-time tip ([3328559511](https://github.com/DeHubToken/dehubweb/commit/3328559511)).
- Images keep loading straight from storage when the image service is unreachable ([#2721](https://github.com/DeHubToken/dehubweb/pull/2721), [mobile #2061](https://github.com/DeHubToken/dehub-mobile/pull/2061)).

## Posting and conversation

- Schedule a stage or a livestream from the post composer ([#2290](https://github.com/DeHubToken/dehubweb/pull/2290), [mobile #1669](https://github.com/DeHubToken/dehub-mobile/pull/1669)).
- Quote posts use the standard composer ([3c43c8a054](https://github.com/DeHubToken/dehubweb/commit/3c43c8a054)) and show attached polls ([5efa4ae016](https://github.com/DeHubToken/dehubweb/commit/5efa4ae016)).
- Ended polls show final results with the winner ticked ([#2402](https://github.com/DeHubToken/dehubweb/pull/2402), [mobile #1771](https://github.com/DeHubToken/dehub-mobile/pull/1771)), and superadmins can set custom vote counts ([backend #507](https://github.com/DeHubToken/dehub-stream-backend/pull/507), [admin #45](https://github.com/DeHubToken/stream-admin-hub/pull/45)).
- The thumbs-down moved into the reaction tray with totals under each emoji ([#2104](https://github.com/DeHubToken/dehubweb/pull/2104)).
- The post AI button became "AI overview" in the three-dot menu ([#2462](https://github.com/DeHubToken/dehubweb/pull/2462), [mobile #1829](https://github.com/DeHubToken/dehub-mobile/pull/1829)), and the comment box has an AI button beside the mic ([#2730](https://github.com/DeHubToken/dehubweb/pull/2730), [mobile #2070](https://github.com/DeHubToken/dehub-mobile/pull/2070)).
- Tapping blank space beside a post's name opens the post; the avatar, name and handle open the profile ([#2593](https://github.com/DeHubToken/dehubweb/pull/2593), [mobile #1970](https://github.com/DeHubToken/dehub-mobile/pull/1970)).
- Unfinished comments and chat drafts are kept, guests included ([#2405](https://github.com/DeHubToken/dehubweb/pull/2405), [#2416](https://github.com/DeHubToken/dehubweb/pull/2416)).
- Posting chain selection moved into Settings ([#2362](https://github.com/DeHubToken/dehubweb/pull/2362)).

## Sharing

- Rich cards for Polymarket and Manifold predictions ([409d6387f6](https://github.com/DeHubToken/dehubweb/commit/409d6387f6)), Snapshot, Audius, DeFi and any open link ([#2360](https://github.com/DeHubToken/dehubweb/pull/2360)), with source tiles and compact fallbacks ([#2491](https://github.com/DeHubToken/dehubweb/pull/2491)).
- Share images show text posts and engagement ([b9e93ba102](https://github.com/DeHubToken/dehubweb/commit/b9e93ba102)) inside a new chrome frame ([#2444](https://github.com/DeHubToken/dehubweb/pull/2444), [#2447](https://github.com/DeHubToken/dehubweb/pull/2447), [#2450](https://github.com/DeHubToken/dehubweb/pull/2450)).
- Bounties share as rich post cards ([b80a1c5244](https://github.com/DeHubToken/dehubweb/commit/b80a1c5244)).

## Live and stages

- The phone live viewer has a Who's here sheet with top tippers and the most active viewers ([#2519](https://github.com/DeHubToken/dehubweb/pull/2519), [mobile #1892](https://github.com/DeHubToken/dehub-mobile/pull/1892), [backend #514](https://github.com/DeHubToken/dehub-stream-backend/pull/514)), tap or swipe to clear the screen with a rotate button ([#2530](https://github.com/DeHubToken/dehubweb/pull/2530)), and each viewer's arrival shows once in chat ([mobile #2062](https://github.com/DeHubToken/dehub-mobile/pull/2062)).
- Live reactions and viewer peaks stay in sync ([#2452](https://github.com/DeHubToken/dehubweb/pull/2452), [backend #512](https://github.com/DeHubToken/dehub-stream-backend/pull/512)), and live timelines can be shared and recovered ([#2430](https://github.com/DeHubToken/dehubweb/pull/2430), [mobile #1796](https://github.com/DeHubToken/dehub-mobile/pull/1796)).
- People who are live wear a broadcast ripple around their avatar across feeds, profiles, chats and the side panel ([#2727](https://github.com/DeHubToken/dehubweb/pull/2727), [mobile #2069](https://github.com/DeHubToken/dehub-mobile/pull/2069)), and the side panel Live tab plays the streams ([#2725](https://github.com/DeHubToken/dehubweb/pull/2725)).
- Live chat shows a glowing online count ([44fd7f817e](https://github.com/DeHubToken/dehubweb/commit/44fd7f817e), [mobile #1943](https://github.com/DeHubToken/dehub-mobile/pull/1943)) and the chat box stays above the keyboard ([#2484](https://github.com/DeHubToken/dehubweb/pull/2484), [mobile #2064](https://github.com/DeHubToken/dehub-mobile/pull/2064)).
- Live feed tiles open the live page on any tap ([mobile #1886](https://github.com/DeHubToken/dehub-mobile/pull/1886)).
- Stage speech runs on Chirp voices and video dubs on Chatterbox ([030859ead7](https://github.com/DeHubToken/dehubweb/commit/030859ead7), [mobile #1725](https://github.com/DeHubToken/dehub-mobile/pull/1725)).

## Profiles and communities

- Profiles got a frosted collapsing header ([85024a9c63](https://github.com/DeHubToken/dehubweb/commit/85024a9c63)), one themed glass navigation row ([#2549](https://github.com/DeHubToken/dehubweb/pull/2549)), and desktop profiles wear their pinned community's art ([#2418](https://github.com/DeHubToken/dehubweb/pull/2418)).
- Owners choose which tab their profile opens on ([mobile #2072](https://github.com/DeHubToken/dehub-mobile/pull/2072)), can edit their username ([#2610](https://github.com/DeHubToken/dehubweb/pull/2610), [mobile #1984](https://github.com/DeHubToken/dehub-mobile/pull/1984)), and every tab shows real totals ([#2735](https://github.com/DeHubToken/dehubweb/pull/2735), [backend #521](https://github.com/DeHubToken/dehub-stream-backend/pull/521)).
- Subscription plans can be pinned to profiles ([backend #497](https://github.com/DeHubToken/dehub-stream-backend/pull/497), [mobile #1555](https://github.com/DeHubToken/dehub-mobile/pull/1555)).
- Invite your followers to a community with confirmed delivery ([#2473](https://github.com/DeHubToken/dehubweb/pull/2473)), add existing posts without copying engagement ([#2469](https://github.com/DeHubToken/dehubweb/pull/2469)), and see recent contributors recognised ([#2165](https://github.com/DeHubToken/dehubweb/pull/2165), [backend #496](https://github.com/DeHubToken/dehub-stream-backend/pull/496)).

## Messages

- Sent messages clear from every box straight away ([#2484](https://github.com/DeHubToken/dehubweb/pull/2484), [#2486](https://github.com/DeHubToken/dehubweb/pull/2486)) and replies stay until the server confirms them ([52ea436328](https://github.com/DeHubToken/dehubweb/commit/52ea436328)).
- Public chat opens instantly and shows unread chips ([d16c73a465](https://github.com/DeHubToken/dehubweb/commit/d16c73a465), [mobile #1628](https://github.com/DeHubToken/dehub-mobile/pull/1628)), and unread markers behave after reopening a conversation ([#2358](https://github.com/DeHubToken/dehubweb/pull/2358)).
- Encryption setup reconnects your wallet before turning on ([9f1312244b](https://github.com/DeHubToken/dehubweb/commit/9f1312244b)), and translated DMs no longer crash the app ([mobile #2057](https://github.com/DeHubToken/dehub-mobile/pull/2057)).
- Calls no longer stutter ([#2147](https://github.com/DeHubToken/dehubweb/pull/2147)).

## Themes and design

- System Light is a new theme on web and in the app ([#2612](https://github.com/DeHubToken/dehubweb/pull/2612), [mobile #1994](https://github.com/DeHubToken/dehub-mobile/pull/1994)), with readable toasts, drawers and standalone pages ([#2647](https://github.com/DeHubToken/dehubweb/pull/2647), [#2654](https://github.com/DeHubToken/dehubweb/pull/2654), [#2657](https://github.com/DeHubToken/dehubweb/pull/2657), [mobile #2016](https://github.com/DeHubToken/dehub-mobile/pull/2016)).
- The System theme went fully immersive with no boxes ([#2261](https://github.com/DeHubToken/dehubweb/pull/2261), [mobile #1631](https://github.com/DeHubToken/dehub-mobile/pull/1631)).
- The theme picker shows Minimal and Minimal Light ([#2534](https://github.com/DeHubToken/dehubweb/pull/2534)).
- The DeHub Cut icon family now covers every control ([cfd741c871](https://github.com/DeHubToken/dehubweb/commit/cfd741c871), [#2574](https://github.com/DeHubToken/dehubweb/pull/2574), [#2592](https://github.com/DeHubToken/dehubweb/pull/2592)).
- Every desktop tooltip is liquid glass ([#2723](https://github.com/DeHubToken/dehubweb/pull/2723)), unread chips are solid in every theme ([#2597](https://github.com/DeHubToken/dehubweb/pull/2597)), and Island's lagoon got reflective water ([#2554](https://github.com/DeHubToken/dehubweb/pull/2554)).
- A shared page kit put every remaining page on the home look ([#2186](https://github.com/DeHubToken/dehubweb/pull/2186), [mobile #1568](https://github.com/DeHubToken/dehub-mobile/pull/1568)).

## Wallets, payments and economy

- Wallet login and recovery use single-use proofs ([#2551](https://github.com/DeHubToken/dehubweb/pull/2551), [backend #517](https://github.com/DeHubToken/dehub-stream-backend/pull/517), [backend #518](https://github.com/DeHubToken/dehub-stream-backend/pull/518)), and wallet encryption costs are bounded ([#2544](https://github.com/DeHubToken/dehubweb/pull/2544)).
- Saved phone passkeys unlock on other browsers ([8363ec0509](https://github.com/DeHubToken/dehubweb/commit/8363ec0509)), interrupted wallet resets resume ([#2681](https://github.com/DeHubToken/dehubweb/pull/2681)), Import Wallet opens directly ([#2678](https://github.com/DeHubToken/dehubweb/pull/2678)), and inaccessible wallets can be replaced while keeping encrypted archives ([2f025cde22](https://github.com/DeHubToken/dehubweb/commit/2f025cde22)).
- Wallet balances recover from RPC failures ([#2459](https://github.com/DeHubToken/dehubweb/pull/2459)).
- Bounties are reputation-backed with verified payouts ([#2191](https://github.com/DeHubToken/dehubweb/pull/2191), [mobile #1575](https://github.com/DeHubToken/dehub-mobile/pull/1575)), and sponsors can fund creator support ads ([#2185](https://github.com/DeHubToken/dehubweb/pull/2185), [mobile #1567](https://github.com/DeHubToken/dehub-mobile/pull/1567)).
- Staking deposits can no longer be counted twice and every pool credit is backed by a verified receipt ([backend #498](https://github.com/DeHubToken/dehub-stream-backend/pull/498), [backend #499](https://github.com/DeHubToken/dehub-stream-backend/pull/499)).
- Paid audio is protected and keeps permanent access ([backend #508](https://github.com/DeHubToken/dehub-stream-backend/pull/508)).
- The DEX shows only the DeHub pool ([#2461](https://github.com/DeHubToken/dehubweb/pull/2461)), and a DHB listing-soon card takes email sign-ups ([#2278](https://github.com/DeHubToken/dehubweb/pull/2278)).
- Subscription allowances are versioned and checkout prices verified ([#2245](https://github.com/DeHubToken/dehubweb/pull/2245)).

## Transparency, feedback and requests

- The stats page publishes revenue and costs ([#2558](https://github.com/DeHubToken/dehubweb/pull/2558)), daily revenue totals ([backend #516](https://github.com/DeHubToken/dehub-stream-backend/pull/516)), recorded provider costs from April 2026 ([#2705](https://github.com/DeHubToken/dehubweb/pull/2705)) and reconciled marketplace revenue ([af0a169106](https://github.com/DeHubToken/dehubweb/commit/af0a169106)).
- Feedback is a dedicated page with all published feedback ([#2640](https://github.com/DeHubToken/dehubweb/pull/2640), [mobile #2009](https://github.com/DeHubToken/dehub-mobile/pull/2009)).
- Feedback is reachable from the navigation and the tools menu ([cd644634a2](https://github.com/DeHubToken/dehubweb/commit/cd644634a2)).
- Requests is a prompt-first workspace ([#2717](https://github.com/DeHubToken/dehubweb/pull/2717), [mobile #2059](https://github.com/DeHubToken/dehub-mobile/pull/2059)).

## Speed, reliability and the app

- Web startup is bundled into about six files instead of hundreds ([#2660](https://github.com/DeHubToken/dehubweb/pull/2660)), with less work on the first feed render ([#2659](https://github.com/DeHubToken/dehubweb/pull/2659)).
- An Intermission maintenance screen is served from the edge during outages ([#2710](https://github.com/DeHubToken/dehubweb/pull/2710), [#2712](https://github.com/DeHubToken/dehubweb/pull/2712)), and the app has its own version ([mobile be19296530](https://github.com/DeHubToken/dehub-mobile/commit/be19296530)).
- The Android app moved to Expo 55 ([mobile #1619](https://github.com/DeHubToken/dehub-mobile/pull/1619)), lifts its splash without waiting on the network ([mobile #1632](https://github.com/DeHubToken/dehub-mobile/pull/1632)) and ships startup profiles ([mobile ef329487ed](https://github.com/DeHubToken/dehub-mobile/commit/ef329487ed)).
- Message boxes stay above the keyboard on every phone ([mobile #2067](https://github.com/DeHubToken/dehub-mobile/pull/2067)).
- Priority languages are complete across web and app ([#2457](https://github.com/DeHubToken/dehubweb/pull/2457), [mobile #1826](https://github.com/DeHubToken/dehub-mobile/pull/1826)), with multilingual sitemaps and guide previews ([#2485](https://github.com/DeHubToken/dehubweb/pull/2485)).
- Guest visitors count in the online tracker ([backend #519](https://github.com/DeHubToken/dehub-stream-backend/pull/519)).

## What's next

October is only half done. The rest of Q4 continues from here, and this page will keep growing with it.
  `,
  bannerImage: '/media/q4-development-overview-banner.png',
  bannerImageAlt: 'Q4 Development Overview - DeHub rocket banner',
  author: {
    name: 'DeHub Team',
  },
  publishedAt: '2026-10-17T12:00:00.000Z',
  tags: ['Development', 'Update', 'Q4', 'Shipping', '2026'],
  readingTime: 12,
  featured: false,
  status: 'published',
  seoTitle: 'Q4 Development Overview | DeHub',
  seoDescription: 'Everything DeHub shipped since October across web, mobile, the streaming backend and admin — the video editor, Creator, AI agents, live, profiles, System Light and wallets — with pull request links throughout.',
};
