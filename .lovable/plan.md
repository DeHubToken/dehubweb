

## Problem

The governance vote fee check reads the user's DHB balance on **Base chain only**, but the error message just says "Insufficient DHB balance" without specifying the chain. If the user holds DHB on BNB Chain but not enough on Base, the error is confusing.

Additionally, `getERC20Balance` doesn't forward `chainId`, though in this case it defaults to Base which is correct for governance.

## Plan

### 1. Improve the error message in the vote flow (`src/hooks/use-governance.ts`)

Change the insufficient balance error at line ~272 from:
```
Insufficient DHB balance. Need 2,000 DHB but have X DHB
```
to:
```
Insufficient DHB on Base. Need 2,000 DHB on Base chain but have X DHB. Please bridge or transfer DHB to Base.
```

### 2. Same fix for the proposal fee error (~line 188)

Update the proposal submission balance error to also mention Base chain.

### 3. Pass `chainId` explicitly in `getERC20Balance` calls

In both the vote and proposal flows, the code calls `getERC20Balance(chainConfig.dhbToken, signerAddress)` without a chain ID. While it defaults to Base, it's better to be explicit. However, `getERC20Balance` doesn't accept a `chainId` parameter — so either:
- Add an optional `chainId` parameter to `getERC20Balance` and pass it through to `readContract`, or
- Call `readContract` directly with `chainId` in the governance hook

Recommended: Add `chainId` param to `getERC20Balance` in `aa-utils.ts` (line 536) and pass `BASE_CHAIN_ID` in both governance calls.

### Technical Details

**File: `src/lib/contracts/aa-utils.ts`** (line 536-545)
- Add optional `chainId` parameter to `getERC20Balance`
- Forward it to `readContract`

**File: `src/hooks/use-governance.ts`**
- Line ~267: Pass `BASE_CHAIN_ID` to `getERC20Balance`
- Line ~272: Update error message to mention Base chain
- Line ~183: Pass `BASE_CHAIN_ID` to `getERC20Balance`
- Line ~188: Update error message to mention Base chain

