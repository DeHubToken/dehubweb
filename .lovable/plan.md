

## Remove Chain Breakdown Section from Staking Page

Delete lines 480–513 in `src/pages/app/StakingPage.tsx` (the entire "Chain Breakdown" `motion.div` block). Also check if the `bnbLogo` and `baseLogo` imports are still used elsewhere in the file — if not, remove those imports too.

### Files Changed
- `src/pages/app/StakingPage.tsx` — Remove the chain breakdown card (~34 lines)

