

## Analysis

After reviewing the auth codebase, here is what is correct and what needs to change based on the API docs you shared:

### What is already correct
- **Social login flow** (`completeDeHubAuth`/`completeDeHubAuthAfterRedirect`): Already gets the Smart Account address from the AA provider and signs with the AA provider (EIP-1271). Sends SA address to backend.
- **External wallet flow** (`completeDeHubAuthWagmi`): Already uses EOA address from wagmi and signs with `signMessageAsync`. Sends EOA address to backend.
- **`isNewAccount` handling**: Already checks `authResponse.result?.isNewAccount` to trigger username setup.

### What needs to change

**1. Add `web3AuthMeta` to auth request (required by API)**

The API docs show a `web3AuthMeta` field with `typeOfLogin`, `verifier`, `verifierId`, `email`, `name`, `profileImage`. Currently `authenticateWallet()` does not send this. We need to:
- Update `authenticateWallet()` in `src/lib/api/dehub/auth.ts` to accept an optional `web3AuthMeta` parameter and include it in the request body.
- In `completeDeHubAuth` and `completeDeHubAuthAfterRedirect`, call `web3auth.getUserInfo()` and pass the result as `web3AuthMeta`.

**2. Remove dead `signWithEoaDirectly` function**

This ~100-line function tries to extract the EOA private key to bypass AA signing. Per your clarification, social logins should use the smart account signature directly (which the code already does). This function and the `extractEoaSignatureFromErc6492` helper are dead code that should be removed along with misleading comments like "AA is used for on-chain transactions; auth signing uses standard ECDSA".

**3. Clean up misleading comments**

Multiple files have comments stating "EOA mode" or "auth signing uses standard ECDSA" which contradict the actual architecture. These should be updated to reflect that social logins use smart account signatures (EIP-1271) and external wallets use standard ECDSA.

### Files to modify

| File | Change |
|------|--------|
| `src/lib/api/dehub/auth.ts` | Add optional `web3AuthMeta` param to `authenticateWallet()`, include in request body |
| `src/contexts/AuthContext.tsx` | Gather `getUserInfo()` and pass as `web3AuthMeta` in social login flows; remove `signWithEoaDirectly`, `extractEoaSignatureFromErc6492`, `normalizeSignatureV` dead code; fix comments |

