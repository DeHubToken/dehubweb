

## Debug "Failed to create plan" Error

The error message is coming from the DeHub API but we can't see the actual response details. I'll add console logging to capture the real error, and also improve error handling so we can diagnose the issue.

### Changes

**File: `src/hooks/use-subscriptions.ts`** (useCreatePlan mutation)
- Add `console.error` logging in the `onError` handler to capture the full error object
- Display the actual API error message in the toast instead of the generic fallback

**File: `src/components/app/subscriptions/CreatePlanModal.tsx`**
- Wrap `mutateAsync` in a try/catch that logs the full error, so we can see the exact API response in the console next time it fails

This will let us capture the actual error from the DeHub API when you try again, so we can fix the root cause.

