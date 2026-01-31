
# Fix: Include Wallet Address in Mint Request

## Problem Identified

The on-chain minting is failing with "signer should sign tokenId" because the signature verification in the StreamCollection contract likely includes the **minter's address (msg.sender)** in the signed message hash.

Currently, the `/api/user_mint` request sends:
- `name`, `description`, `postType`, `chainId`, `category`, `streamInfo`, `files`

But it does NOT send:
- **The user's wallet address** that will call the `mint()` function

Without the minter address, the backend cannot generate a signature that will pass `ecrecover` verification on-chain.

## Evidence

From the contract ABI:
```solidity
function mint(
  uint256 id,
  uint256 timestamp,
  uint8 v, bytes32 r, bytes32 s,  // signature components
  Fee[] fees,
  uint256 supply,
  string uri
)
```

The signature verification likely hashes:
```solidity
bytes32 message = keccak256(abi.encodePacked(id, msg.sender));
// OR with timestamp:
bytes32 message = keccak256(abi.encodePacked(id, timestamp, msg.sender));
```

## Solution

### Step 1: Get User's Wallet Address Before API Call

In `usePostForm.ts`, retrieve the signer address before calling the mint API:

```typescript
import { getWeb3AuthSigner } from '@/lib/contracts/stream-collection';

// Before calling mintPost()
const signer = await getWeb3AuthSigner();
const minterAddress = await signer.getAddress();
```

### Step 2: Include Address in API Request

Add the `minter` or `creator` field to the FormData:

```typescript
formData.append('minter', minterAddress);
// OR depending on DeHub API expectations:
formData.append('creator', minterAddress);
```

### Step 3: Update mintPost Function

Modify the `mintPost` function in `src/lib/api/dehub.ts` to accept and include the minter address parameter.

## Technical Details

### Files to Modify

1. **src/features/post/hooks/usePostForm.ts**
   - Import `getWeb3AuthSigner` 
   - Get wallet address before API call
   - Pass address to `mintPost`

2. **src/lib/api/dehub.ts**
   - Update `mintPost` function signature to accept `minterAddress`
   - Append `minter` field to FormData

### Code Changes

**usePostForm.ts**
```typescript
// Before calling API
const signer = await getWeb3AuthSigner();
const minterAddress = await signer.getAddress();
console.log('[Mint] User wallet address:', minterAddress);

// Pass to API
const mintResponse = await mintPost({
  ...params,
  minterAddress,
});
```

**dehub.ts - mintPost function**
```typescript
export async function mintPost(params: {
  name: string;
  description?: string;
  // ... other params
  minterAddress: string;  // Add this
}) {
  const formData = new FormData();
  // ... existing fields
  formData.append('minter', params.minterAddress);
  
  // API call
}
```

## Alternative: Check DeHub API Documentation

If the backend doesn't accept a `minter` field, the API might:
1. Extract the address from the JWT token (already authenticated)
2. Use a different parameter name (`creator`, `address`, `wallet`)
3. Require a different endpoint for Web3Auth/Smart Account users

The JWT already contains the address (`0x742371a7cce6b068f3c6222016bf009d570d7d15`), so the backend might already know the minter. In that case, the issue could be:
- The contract's authorized signer list doesn't include the DeHub backend signer
- The message format uses a different encoding (e.g., with or without timestamp)

## Testing Plan

1. Add the minter address to the API request
2. Retry the mint flow
3. Check console logs for recovered signer address
4. Compare recovered address against contract's authorized signers

If this doesn't work, we'll need to contact DeHub team to clarify:
1. Exact message format being signed
2. Whether Smart Account addresses are supported
3. If a different flow is needed for gasless transactions
