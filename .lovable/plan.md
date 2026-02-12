

## Fix: Improve Error Handling for Post Minting Failures

### Problem
When a post fails to mint, the toast shows "Post failed: [object Object]" because the error from the wallet provider is a complex object that doesn't stringify properly. This is most likely a gas/insufficient funds error from the Pimlico paymaster rejecting the transaction.

### Root Cause
In `src/lib/contracts/aa-utils.ts`, the `parseTxError` function uses `String(error)` as a fallback, which produces `[object Object]` for structured error objects from wallet providers.

### Changes

**1. `src/lib/contracts/aa-utils.ts` - Improve `parseTxError` to handle complex error objects**

- Use `JSON.stringify` as a fallback instead of `String(error)` for non-Error objects
- Recursively check nested `error.message`, `error.error`, `error.data`, `error.details`, and `error.shortMessage` fields (common in viem/ethers/provider errors)
- Add detection for paymaster-related errors (e.g., "paymaster", "sponsor", "aa21", "aa25", "aa31" prefunded errors) with a user-friendly message like "Gas sponsorship unavailable. Please add ETH to your wallet."

**2. `src/features/post/hooks/usePostForm.ts` - Add deeper error extraction in the catch block**

- Before displaying the toast, attempt to extract nested error messages (e.g., `error.error?.message`, `error.data?.message`)
- Log the full error object with `JSON.stringify` for debugging

### Technical Details

The key improvement in `parseTxError`:

```typescript
export function parseTxError(error: unknown, context: string = 'transaction'): string {
  // Extract message from nested error objects
  let errorStr = '';
  if (error instanceof Error) {
    errorStr = error.message;
  } else if (typeof error === 'string') {
    errorStr = error;
  } else if (error && typeof error === 'object') {
    const e = error as Record<string, any>;
    errorStr = e.message || e.shortMessage || e.reason || 
               e.error?.message || e.data?.message || 
               JSON.stringify(error).slice(0, 300);
  } else {
    errorStr = String(error);
  }
  
  // ... existing checks plus new paymaster checks ...
  if (lowerError.includes('paymaster') || lowerError.includes('aa21') || 
      lowerError.includes('aa25') || lowerError.includes('aa31')) {
    return 'Gas sponsorship failed. Please add ETH to your wallet for gas fees.';
  }
}
```

This ensures any error -- whether from Pimlico, the AA bundler, or the on-chain contract -- produces a readable message instead of `[object Object]`.

