

## Auto-Detect All Base Wallet Tokens for Swap

### Problem
The swap drawer only shows 5 hardcoded tokens (ETH, DHB, USDT, USDC, BTC). Users with other Base ERC20 tokens (e.g. DEGEN, AERO, BRETT) can't use them to swap.

### Solution
Use Alchemy's `alchemy_getTokenBalances` API to discover all ERC20 tokens with non-zero balances, then fetch their metadata. Merge with the existing known token list.

### Changes

1. **New utility: `src/lib/wallet/alchemy-tokens.ts`**
   - Call Alchemy `alchemy_getTokenBalances` (Base endpoint) to get all non-zero ERC20 balances
   - Call `alchemy_getTokenMetadata` in batch for discovered tokens to get symbol/name/decimals/logo
   - Cache results in React Query (same stale time as existing token queries)
   - Merge with existing `DEFAULT_TOKENS` (known tokens take priority for metadata/logos)

2. **Update `src/lib/wallet/tokens.ts` → `getAllTokenBalances`**
   - Add an optional `discoverAll?: boolean` parameter
   - When true, call Alchemy discovery and merge results with the known list
   - Fall back to current behavior if Alchemy call fails

3. **Create edge function `supabase/functions/alchemy-tokens/index.ts`**
   - Proxy the Alchemy API calls server-side to keep the API key secret
   - Accept wallet address and chain ID, return token balances + metadata
   - JWT verification disabled (public data)

4. **Update `SwapToTokenDrawer.tsx`**
   - Pass `discoverAll: true` when building payTokens so the swap drawer shows all detected tokens
   - No UI changes needed — tokens already render dynamically from the `payTokens` array

### Technical Notes
- Alchemy's `alchemy_getTokenBalances` with `DEFAULT_TOKENS` param returns all non-zero ERC20 balances in a single call
- Metadata calls can be batched but may need rate limiting consideration
- Results cached for 5 minutes (matching existing stale time)
- Known tokens retain their custom logos; discovered tokens use Alchemy-provided logos or a generic icon

