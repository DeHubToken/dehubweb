

# User Guide Page — `/guide`

## Summary

Create a comprehensive, native in-app guide page at `/guide` that documents every DeHub feature with clear instructions. The page will use DeHub's liquid glass aesthetic, feature a sticky sidebar table of contents, and include placeholder screenshot slots for each feature section.

## Features to Document

Based on the full codebase, the guide will cover these sections:

1. **Getting Started** — Sign up (Web3Auth vs external wallet), landing page, navigating to the app
2. **Home Feed** — Feed tabs (Home, Videos, Images, Shorts, Music, Live), sorting/filtering, pull-to-refresh, swipe navigation
3. **Creating Posts** — Text, images, videos, voice notes, GIFs, quote posts, hashtags, cashtags, mentions
4. **Interacting with Posts** — Voting (upvote/downvote), commenting, tipping, bookmarking, sharing, translating text/images
5. **Explore & Search** — Search tabs (All, People, Posts, Images, Videos, Music, Live), trending topics
6. **Profile** — Viewing/editing profile, avatar, bio, wallet address, followers/following
7. **Messages** — Direct messaging, conversations
8. **AI Assistant** — Chat with AI, capabilities
9. **Notifications** — Types of notifications, mark as read
10. **Wallet** — Viewing balances, DHB across chains, staking deposits, refresh scan
11. **Staking** — How to stake DHB, unstaking, viewing staked amounts
12. **Leaderboard** — Tabs (balance, daily spent, talk of the town), rankings
13. **Command Centre** — Dashboard overview
14. **Governance** — Proposals, voting on proposals
15. **Bookmarks** — Saving and managing bookmarks
16. **Settings** — Language, preferences
17. **Buying DHB** — Swap interface, slippage settings
18. **Bridge** — Cross-chain bridging
19. **Music & TV** — Media playback features
20. **Glossary** — Crypto/platform terminology

## Page Structure

- **Route**: `/guide` (outside AppLayout, standalone page with back-to-app link)
- **Layout**: Full-width dark page with max-w-4xl content area
- **Navigation**: Sticky left sidebar TOC on desktop, collapsible top nav on mobile
- **Sections**: Each feature gets a card with:
  - Section title + icon
  - Step-by-step instructions
  - Screenshot placeholder (gray bordered box with "Screenshot" label)
  - Pro tips where relevant
- **Styling**: Liquid glass cards (`bg-white/5 backdrop-blur border-white/10 rounded-2xl`)

## Technical Changes

1. **New file: `src/pages/GuidePage.tsx`**
   - Full guide page component with all 20 sections
   - Sticky TOC sidebar with smooth-scroll anchor links
   - Responsive: sidebar collapses to horizontal scroll on mobile
   - Screenshot placeholder components (styled empty boxes)
   - Back-to-app button in header

2. **Update: `src/App.tsx`**
   - Add lazy import for `GuidePage`
   - Add route `<Route path="/guide" element={<GuidePage />} />`

The page will be self-contained — no new dependencies needed. All content is hardcoded (not fetched from DB) since it's documentation.

