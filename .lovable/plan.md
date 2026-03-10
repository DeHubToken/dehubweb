

## Custom In-App DHB Buy Solution

You already have a working **Uniswap V3 swap** integration (`uniswap-swap.ts`) that swaps ETH → DHB on Base. The best custom solution is to build a **Swap Drawer** directly in the wallet, letting users convert their ETH (or any supported token) to DHB without leaving the app.

### What to build

**"Swap to DHB" Drawer** — a dedicated UI for buying DHB with ETH on Base via the existing Uniswap V3 integration.

### Flow

1. User taps **Buy** on DHB in wallet → opens the buy method drawer
2. New option: **"Swap from ETH"** (uses in-wallet ETH balance)
3. User enters DHB amount they want → live quote shows ETH cost (via `getSwapQuote`)
4. User confirms → executes `swapETHForDHB` via Smart Account
5. Success toast with tx link

### Implementation

1. **Create `SwapToDHBDrawer.tsx`** component:
   - Input: desired DHB amount (with preset buttons: 1K, 5K, 10K, 50K)
   - Shows live ETH cost via `getSwapQuote()` (debounced)
   - Shows user's current ETH balance via `getNativeBalance()`
   - Validates sufficient ETH (including 2% slippage)
   - Executes swap via `swapETHForDHB()` on confirm
   - Loading/success/error states

2. **Update `GroupedActionDrawer`** in `FullWalletPage.tsx`:
   - For DHB token's Buy button, show the buy method sub-drawer with:
     - "Buy with Card" → existing `/app/buy` page
     - "Swap from ETH" → opens `SwapToDHBDrawer`
   - Remove the direct navigate to `/app/buy` for DHB

3. **Price display**: Use `useTokenPrices` to show USD equivalent of both the DHB amount and ETH cost.

### Technical details

- All contract infrastructure exists: `getSwapQuote`, `applySlippage`, `swapETHForDHB` in `src/lib/contracts/uniswap-swap.ts`
- Smart Account (AA) writes handle gas abstraction automatically
- Uniswap V3 pool: WETH/DHB on Base, 1% fee tier, router at `0x2626664c2603336E57B271c5C0b26F421741e481`
- No new backend or edge functions needed — pure on-chain swap

