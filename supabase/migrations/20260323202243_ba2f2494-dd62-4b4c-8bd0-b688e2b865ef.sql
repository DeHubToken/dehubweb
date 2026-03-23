-- Delete 2065 bogus BNB staking records that were bulk-inserted from legacy contract scan
-- These are transfers TO the legacy BNB staking contract (0x26d2cd77), NOT the unified staking address
-- They inflate staked balances by recording every individual legacy stake tx without corresponding unstakes
DELETE FROM public.staking_records
WHERE chain = 'BNB'
  AND created_at >= '2026-03-21 17:16:07'
  AND created_at <= '2026-03-21 17:16:08';