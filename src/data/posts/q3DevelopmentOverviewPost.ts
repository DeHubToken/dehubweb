import { BlogPost as BlogPostType } from '@/types/blog';

export const q3DevelopmentOverviewPost: BlogPostType = {
  id: 'q3-development-overview',
  slug: 'q3-development-overview',
  title: 'Q3 Development Overview',
  excerpt: 'What shipped across web, mobile and the streaming backend since July: live stages with subtitles and dubbing, AI woven through the app, an arcade, three new themes, a self-custody wallet, and an economy that finally works end to end.',
  content: `
## A quarter of shipping

Since the start of July we have merged hundreds of changes across the web app, the mobile app and the streaming backend. The web repository went public on July 17 under an MIT licence, so every line we ship is now readable the day it ships. This post is the round-up of what actually landed — feature by feature, not roadmap.

## Stages grew into a platform

Stages began the quarter as a live audio room. It ends it as a broadcast stack:

- Hosts schedule a stage, announce it, and everyone who set a reminder gets alerted when it goes live — with the guest list showing right on the announcement card.
- Going live no longer needs OBS. Hosts broadcast straight from the browser camera and share their screen mid-room.
- The audience talks back in stage chat, reads live subtitles translated into the languages the room is reading, and can hear the whole stage dubbed live, paid in DHB by the minute.
- Hosts put a radio station on air or play their own music clips between conversations.
- Every stage records, plays from its card, seeks properly on Android, and keeps working after the room ends.
- Moderation moved into the admin panel, with an audit trail behind every action.

## AI moved into every corner

- @assistant answers mentions in posts, comments and live chat — backed by a real tool API rather than keyword guessing, with support tickets it can file straight to the dev inbox.
- Creator Studio v2 arrived: a native generation studio with a Canva-style editor, an Audio mode powered by ElevenLabs, 3D model generation, and pricing built around video.
- Free daily AI credits accrue for every member, denominated in DHB, claimable on sign-in.
- The feed auto-translates: read any post in your language, with translations persisted so nobody pays twice.
- Posters became free — the in-app banner renderer draws SM Template 2.0 brand graphics instead of charging for diffusion renders.
- The Builder turned prompts into working mini-apps, hosted and shareable in one flow.

## The arcade opened

A dedicated Arcade section landed at dehub.io/arcade. King's Gambit gained an online lobby with live boards and leaderboards, joined by Claude of Duty, Jungle Trail, Street Slayer, and Trenchstar — our market-terminal arcade that also boots in VR through WebXR. Games run on touchscreens, boot with their own progress screens, and each carries its own share card.

## Three new themes

Osaka brings rain-on-glass neon, War brings a tactical HUD, and Jungle rebuilds the interface under a walkable WebGL canopy. Each theme now carries its own 3D icon set, so surfaces stay consistent wherever you land.

## Wallets and sign-in rebuilt

Web3Auth went away. Web and mobile now run a self-custody smart wallet with a byte-compatible crypto core, unlocked by biometrics where the device supports it. Sign in with Apple shipped alongside phone login delivering OTPs through CloudTalk, magic links, active session management, and a migration path that finds legacy accounts by email or SMS.

## Posting without the mint toll

Minting became optional. Off-chain posts publish instantly, get their own /newpost links everywhere, and can be minted later if the creator wants them on-chain. Around them: nine reactions with per-reaction totals, tipping on comments and replies, drafts synced to the account so a force-quit loses nothing, file attachments in DMs, scheduled posts, per-post comment controls, and idempotent publishing so a retried upload can never double-post.

## The economy works end to end

DHB sells at a fixed $0.001 peg instead of a market quote. Payments arrive from any chain through NEAR Intents. Solana PPV became payable on web with gas sponsored from the backend wallet, capped against abuse. Robinhood Chain joined the network list. Staking badges now matter day to day: your tier caps how much you can post to the main feed and discounts what you pay to top it up.

## Mobile caught up

The parity push brought Bounties, Stores, Feature Requests, Affiliate, the Command Centre, the Top 100 and the Arcade to native screens. Stages work on phones with reminders, the soundboard and shared-screen viewing. Settings rebuilt around the same tab system as web, the shorts viewer matches the web player frame for frame, and Android builds are signed with the real release key ahead of store listing.

## Under the hood

The boot path got a JS budget that is reported on every build and ratcheted so it cannot drift back up. Images serve through CDN transforms sized to the box they render into. Typecheck runs on every pull request; backend tests gate merges and deploys fire only on merge. Paid endpoints carry per-IP rate limits and SSRF guards. Staging lives at staging.dehub.io, the dehub.net domain move maps onto real pages, and the docs were rewritten around the live app with real screenshots.

## What's next

The quarter is not over, and neither is the list. Q4 continues exactly where this leaves off: more stages, more arcade, deeper economy — shipped in the open, as always.
  `,
  bannerImage: '/lovable-uploads/q3-development-overview-banner.png',
  bannerImageAlt: 'Q3 Development Overview - DeHub rocket banner',
  author: {
    name: 'DeHub Team',
  },
  publishedAt: '2026-08-22T12:00:00.000Z',
  tags: ['Development', 'Update', 'Q3', 'Shipping', '2026'],
  readingTime: 6,
  featured: false,
  status: 'published',
  seoTitle: 'Q3 Development Overview | DeHub',
  seoDescription: 'Everything DeHub shipped in Q3 across web, mobile and the streaming backend: live stages with dubbing, AI tools, the arcade, three themes, self-custody wallets and a working token economy.',
};
