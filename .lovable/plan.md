

## Fix: Auto-reload on chunk load failures

### Root cause
Every deploy produces new JS chunk filenames. Users with stale tabs try to load old chunks that no longer exist → uncaught dynamic import error → ErrorBoundary crash screen.

### Solution
Wrap each `React.lazy()` call with a retry-then-reload helper. On chunk load failure:
1. Retry the import once (in case of transient network issue)
2. If retry fails, do a full page reload **once** (to get the new HTML with correct chunk references)
3. Use `sessionStorage` flag to prevent infinite reload loops

### Changes

**New file: `src/lib/lazy-with-retry.ts`**
- Export a `lazyWithRetry` function that wraps `React.lazy()`
- On import failure: retry once after 1 second
- If retry also fails: check sessionStorage for a `chunk-reload` flag
  - If no flag → set flag + `window.location.reload()`
  - If flag exists → clear flag and let the error propagate to ErrorBoundary (prevents infinite loop)

**Edit: `src/components/app/PersistentPageCache.tsx`**
- Replace all 19 `React.lazy(() => import(...))` calls with `lazyWithRetry(() => import(...))`
- Import the new helper

**Edit: `src/components/ErrorBoundary.tsx`**
- In `componentDidCatch`, detect chunk load errors (`error.message` contains "Loading chunk" or "Failed to fetch dynamically imported module")
- If detected and no reload flag in sessionStorage → auto-reload instead of showing crash screen

### What users will experience after this fix
- On deploy: navigating to a new page triggers a seamless full-page reload instead of a crash screen
- The reload only happens once per deploy
- If something is genuinely broken, the ErrorBoundary still shows after the single reload attempt

