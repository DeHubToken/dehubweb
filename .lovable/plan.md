

## Problem

The feature requests were updated to status `shipped` in the database, but:
1. The `useShippedFeatures` hook queries for `status = 'completed'`
2. The TypeScript `FeatureStatus` type defines `completed`, not `shipped`
3. The main list excludes `status = 'completed'` via `.neq('status', 'completed')`

Result: all 8 "shipped" items are invisible — they appear in neither the main feed nor the Shipped tab.

## Fix (two parts)

### 1. Database: Update the 8 rows from `shipped` to `completed`
Change all `feature_requests` where `status = 'shipped'` to `status = 'completed'` so they match the existing code.

### 2. No code changes needed
The existing code already handles `completed` correctly — the Shipped tab filters by `completed`, and the main list excludes `completed`. Once the data is corrected, everything will work.

## Technical Details
- **SQL**: `UPDATE feature_requests SET status = 'completed', updated_at = now() WHERE status = 'shipped'`
- This will move all 8 items into the Shipped tab, bringing the count from 22 to 30.

