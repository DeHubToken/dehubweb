
## Problem

The "Invalid signature" error on Discord (and all social) logins has persisted through multiple fix attempts. Here's exactly what's happening:

1. `signWithEoaDirectly` tries to extract the raw private key via `eth_private_key` RPC method
2. **That method does not exist** on any provider in Web3Auth v10 with AA -- the console confirms: `"the method eth_private_key does not exist/is not available"`
3. The function returns `null`, so it falls back to `signWithProvider` which calls `personal_sign` on the **AA-wrapped provider**
4. The AA provider wraps the signature in ERC-6492 format (the signature is 2242 characters long instead of the standard 132)
5. The backend's `ecrecover` cannot verify ERC-6492 signatures, so it returns "Invalid signature"

Every previous fix attempt tried to find the private key from different internal properties of the Web3Auth instance. None of them work because **Web3Auth v10 does not expose `eth_private_key` on any accessible provider**.

## Solution

Stop trying to extract the private key entirely. Instead, call `personal_sign` directly on the **EOA provider** (not the AA provider). The EOA provider's `personal_sign` returns a standard ECDSA signature that the backend can verify.

The `AccountAbstractionProvider` stores the underlying EOA provider in `state.eoaProvider` (confirmed in the type definitions). We need to:

1. **Rewrite `signWithEoaDirectly`** to find the EOA provider and use `personal_sign` on it, rather than trying to extract a private key
2. The function should:
   - Get the Web3Auth instance
   - Access the AA provider's `state.eoaProvider`
   - Call `eth_accounts` on the EOA provider to get the EOA address
   - Call `personal_sign` on the EOA provider with the auth message
   - Return the standard ECDSA signature (should be 132 chars, not 2242)
3. If the EOA provider is not found, fall back to the existing provider signing (which will likely still fail, but at least we log it clearly)

### Technical detail

```text
Current flow (broken):
  AA provider → eth_private_key → NOT AVAILABLE → fallback →
  AA provider → personal_sign → ERC-6492 signature (2242 chars) → backend rejects

Fixed flow:
  AA provider → state.eoaProvider → personal_sign → standard ECDSA (132 chars) → backend accepts
```

### File to change
- `src/contexts/AuthContext.tsx` -- rewrite `signWithEoaDirectly` (lines ~211-291) to use `personal_sign` on the EOA provider instead of extracting the private key. Remove the `privateKeyToAccount` import from viem if no longer needed.
