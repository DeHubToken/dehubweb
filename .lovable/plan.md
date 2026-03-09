

## Plan: Add "Report User" to Profile Options Menu

The `ProfileOptionsContent` component (`src/components/app/profile/ProfileOptionsDrawer.tsx`) currently has options like Copy URL, Message, Tip, Block, etc. for other users' profiles, but is missing a "Report User" option. The `ReportModal` already fully supports `reportType: 'user'` with the `reportUser` API.

### Changes

**1. `src/components/app/profile/ProfileOptionsDrawer.tsx`**
- Add state for `reportModalOpen`
- Add a "Report User" button in the non-own-profile section (before the Block button, in the destructive/red zone)
- Render the `ReportModal` with `reportType="user"` and `userId={profile.walletAddress}`
- Import `Flag` icon from lucide-react and `ReportModal` from modals

**2. No other files need changes** -- the `ReportModal` and API layer are already wired up.

### UI Placement
The "Report User" button will appear just above the "Block" button, styled with red/warning colors (matching the block/unfollow styling), and only visible when viewing someone else's profile and they are not blocked.

