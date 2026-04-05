

## Hide Non-Default Tokens from Wallet (Manual Add Only)

Currently, Alchemy token discovery automatically shows all ERC20 tokens with non-zero balances in the wallet. The change will restrict the main wallet view to only show **default tokens** (DHB, ETH, BNB, USDT, USDC, BTC) plus any **user-imported custom tokens**. Unknown tokens will only appear in the "Import Token" drawer for manual addition.

### Changes

**1. Remove `discoverAll` from `getAllTokenBalances` calls**

In `src/hooks/use-wallet-tokens.ts`:
- Remove the `discoverAll: true` parameter from the Base chain query in `useWalletTokens` (line 33)
- Remove the `discoverAll: true` parameter from the Base chain query in `useAllChainsTokens` (line 52)

This means the main wallet and balance card will only show default + custom tokens.

**2. Keep Alchemy discovery in the Import Token dialog only**

The `ImportTokenDialog` in `src/pages/app/FullWalletPage.tsx` already has its own Alchemy discovery query — this stays as-is so users can browse and quick-import discovered tokens.

### What stays visible by default
- DHB (Base, BNB)
- ETH (native on Base, Ethereum)
- BNB (native on BNB Chain)
- USDT (all chains)
- USDC (Base)
- BTC (all chains)
- Any tokens the user has manually imported via the Import Token drawer

### What gets hidden
- All other ERC20 tokens discovered by Alchemy — these will only appear inside the Import Token drawer for manual addition

### Technical details
- Two lines changed in `use-wallet-tokens.ts`: remove the third argument (`true`) from `getAllTokenBalances` calls
- No database or edge function changes needed

