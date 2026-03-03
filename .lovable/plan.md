

## In-App Crypto Buying: Available Options

You already have the backend contract code in `uniswap-swap.ts` (quote + swap via Uniswap V3 on Base). Here are the realistic options for activating "Buy with Crypto" in-app:

---

### Option 1: Custom Swap UI (using your existing code)
You already have `getSwapQuote()`, `swapETHForDHB()`, `applySlippage()`, and `getNativeBalance()` built out. We'd create a swap drawer/page that:
- Shows the user's ETH balance
- Lets them input a DHB amount
- Fetches a live quote via your existing Quoter V2 integration
- Executes the swap through your AA (Account Abstraction) utils
- **Limitation**: Only works for users with Web3Auth smart accounts (your AA pipeline). External wallet users would still need the Uniswap link.

### Option 2: Uniswap Swap Widget (`@uniswap/widgets`)
- Embeddable React component, one-line integration
- **Problem**: Package is unmaintained (last release 2+ years ago), may have compatibility issues with React 18 and current wagmi/viem versions
- Not recommended

### Option 3: LI.FI Widget
- Modern, actively maintained cross-chain swap aggregator widget
- Supports Uniswap pools + many other DEXs, better pricing via aggregation
- Embeddable React component with theming
- Works with external wallets via wagmi (you already have wagmi installed)
- **Best for external wallet users**

### Option 4: Hybrid (Recommended)
- Use **Option 1** (your existing swap code) for Web3Auth/AA users — seamless, no external UI needed
- Use **Option 3** (LI.FI widget) or a simple iframe/redirect for external wallet users

---

### Recommendation

**Option 1 is the fastest path** since all the contract code exists. We'd build a swap drawer UI in `FundActions.tsx` that calls your existing functions. This works for your primary user flow (Web3Auth smart accounts).

### Technical Details

The implementation would:
1. Add a swap drawer with ETH→DHB input
2. Show live quote from `getSwapQuote()`
3. Display ETH balance from `getNativeBalance()`
4. Execute via `swapETHForDHB()` with slippage protection
5. Show transaction confirmation + explorer link

No new dependencies or API keys needed — everything is already wired up.

