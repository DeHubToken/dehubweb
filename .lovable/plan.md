
## Convert Token Action Popup to Drawer

Currently, when you tap a token in the wallet, a `Dialog` (popup modal) appears with Send/Receive/Buy actions. This will be converted to a bottom `Drawer` for a more native feel on all devices.

### Changes

**File: `src/pages/app/FullWalletPage.tsx`**

In the `TokenActionDrawer` component (lines 303-364):
- Replace `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` with `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` from the existing drawer component
- Use the `glass` prop on `DrawerContent` to match the liquid glass aesthetic already used elsewhere in the app
- Keep the same token icon, symbol, balance display, and Send/Receive/Buy action buttons
- Update imports: remove `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`, add `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` from `@/components/ui/drawer`

### Technical Details

The drawer will slide up from the bottom on all devices (mobile and desktop), matching the existing drawer pattern used throughout the app. The `glass` prop enables the frosted glass styling (`bg-zinc-900/10 backdrop-blur-2xl`). The existing `shouldScaleBackground` and touch handling from the drawer component will provide a native swipe-to-dismiss experience.
