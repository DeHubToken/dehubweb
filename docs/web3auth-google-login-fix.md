# Web3Auth Google Login Fix — Investigation & Solution

## The Problem (April 10, 2026 — Recurrence April 13, 2026)

Google social login was completely broken. Every attempt resulted in:

```
POST https://api-wallet.web3auth.io/auth/verify 400 (Bad Request)

{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "validation": {
    "body": {
      "keys": ["signatures.0"],
      "message": "\"signatures[0]\" length must be less than or equal to 500 characters long"
    }
  }
}
```

User was logged out every time they clicked Google sign-in.

**This is a confirmed Web3Auth server-side regression** — reported publicly on [MetaMask Builder Hub](https://builder.metamask.io/t/auth-verify-fails-signatures-0-must-be-500-characters-account-abstraction/3072) (April 10, 2026). Other developers reported the same production outage. The MetaMask/Web3Auth team acknowledged it as an API-side validation regression.

---

## Root Cause Analysis

### What is WsEmbed?

`@web3auth/modal` v10 always bundles **WsEmbed** (Torus Wallet Services Embed) for any EIP-155 chain. When `connectTo()` is called:

1. OAuth popup opens → user selects Google account
2. Sapphire DKG (Distributed Key Generation) reconstructs the private key → **completes successfully**
3. WsEmbed's `loginWithSessionId()` is called → sends a Torus session signature to `api-wallet.web3auth.io/auth/verify`
4. **Web3Auth's own server rejects the signature with 400** — the session signature is > 500 characters
5. `connectTo()` throws → login fails

This is a **Web3Auth server-side regression** — their own SDK generates a signature that their own server rejects.

### Why the key insight matters

**The Sapphire DKG completes BEFORE `loginWithSessionId()` is called.**

This means even when `connectTo()` throws, the private key is already reconstructed and stored in:
```
authInstance.privKey  (on the auth connector)
```

The key is available even when the overall login flow "fails".

### Why it was intermittent

Two reasons:

1. **Web3Auth server load balancing** — the 500-char limit was rolled out to some servers but not all. Some requests hit old servers (no limit → success), some hit new servers (500-char limit → fail).

2. **Safe deployed vs undeployed** — for accounts where the Safe contract is already deployed on-chain, a regular ECDSA signature (~132 chars) is used. For new accounts, an ERC-6492 counterfactual signature (~575 chars) is used. Only the ERC-6492 variant exceeded the 500-char limit.

### Why we can't use EOA

The user's constraint: **Must use Smart Account (Safe AA) address** to match mobile app accounts.

- EOA address = standard Ethereum address derived from the private key
- Smart Account address = Safe smart contract address (deterministic, derived from EOA)
- Mobile app uses Smart Account addresses — using EOA would break cross-platform account sync

---

## Two Separate Issues Fixed

### Issue 1: Login fails (WsEmbed `auth/verify` 400 during `connectTo()`)

**When:** `connectTo()` throws because WsEmbed's auth/verify rejects the session signature.

**Fix:** Catch block in `connectToSocialProvider()` — extract private key from DKG result, build `EthereumPrivateKeyProvider` directly (bypasses WsEmbed entirely).

### Issue 2: AA signing fails ("Invalid signature" -32603 after successful login)

**When:** Login succeeds (WsEmbed auth/verify passes for EOA), but then `setupAAProvider` uses the modal provider, which routes `personal_sign` through WsEmbed → auth/verify → rejects ERC-6492 signature.

**Fix:** In `setupAAProvider()`, extract private key from the modal provider via `private_key` RPC method, build `EthereumPrivateKeyProvider` for in-process signing — no WsEmbed, no network call.

---

## Approaches Tried

### Approach 1: Remove `accountAbstractionConfig` from modal init
**Status: Did not fix the issue**

Initially thought the AA config was triggering the bad `auth/verify` call. Removed it:

```typescript
// Before
const initOptions = {
  clientId,
  chains: [chainConfig],
  accountAbstractionConfig: { ... },  // ← removed this
};
```

Result: Still 400. WsEmbed is initialized for ALL EIP-155 chains regardless of AA config — it's internal to the `AuthConnector`, not tied to `accountAbstractionConfig`.

### Approach 2: Further version downgrades
**Status: Tried, did not help**

Downgraded `@web3auth/modal` and `@web3auth/no-modal` from `10.14.1` → `10.5.6`. Same error persisted — the WsEmbed `auth/verify` call exists in all v10 versions.

### Approach 3: Use EOA address only
**Status: Rejected by user**

Could skip AA entirely and just use the EOA address. But this breaks mobile app sync — mobile uses Safe Smart Account addresses.

### Approach 4: Disable AA in Web3Auth Dashboard
**Status: Partial fix — helps with Issue 1, not Issue 2**

Disabling "Wallet Services / Account Abstraction" in the Web3Auth dashboard prevents WsEmbed from sending AA signatures during login. Login succeeds but AA signing still fails if modal provider is used in `setupAAProvider`.

---

## Final Solution

### Architecture — Full Flow

```
Google OAuth popup
    ↓
connectTo() called
    ↓
Sapphire DKG completes → authInstance.privKey = "abc123..." ✓
    ↓
WsEmbed loginWithSessionId() → auth/verify
    ├── 400 ERROR (Issue 1 — WsEmbed fails)
    │       ↓
    │   [CATCH BLOCK] extractPrivKeyFromConnector()
    │       ↓
    │   buildProviderFromPrivKey(privKey) → EthereumPrivateKeyProvider
    │       ↓ (returns this as eoaProvider)
    │
    └── 200 OK (happy path — WsEmbed succeeds)
            ↓ (returns modal provider as eoaProvider)

eoaProvider → setupAAProvider()
    ↓
    [if modal provider] eoaProvider.request({ method: 'private_key' })
    ↓                   → extract key → buildProviderFromPrivKey()
    [if already EthereumPrivateKeyProvider] use as-is
    ↓
    signingProvider (EthereumPrivateKeyProvider — in-process, no WsEmbed)
    ↓
AccountAbstractionProvider.getProviderInstance(signingProvider)
    ↓ SafeSmartAccount() on Base Mainnet via Pimlico
    ↓
Safe Smart Account address: 0x294f0a...
    ↓
signWithProvider(aaProvider) → 132-byte ECDSA signature
    ↓
authenticateWallet(saAddress, signature) → DeHub auth ✓
```

### Key Code Changes

**`src/lib/web3auth.ts`** — catch block in `connectToSocialProvider()` (Issue 1 fix):

```typescript
try {
  const provider = await web3auth.connectTo(WALLET_CONNECTORS.AUTH, params);
  lastConnectedConnector = WALLET_CONNECTORS.AUTH;
  return provider;
} catch (err) {
  // ... popup blocked check ...

  // WsEmbed fails but DKG already completed — private key is available
  const privKey = extractPrivKeyFromConnector(web3auth);
  if (privKey) {
    console.log('[Web3Auth] WsEmbed auth/verify failed — recovering via private key');
    const eoaProvider = await buildProviderFromPrivKey(privKey);
    lastConnectedConnector = WALLET_CONNECTORS.AUTH;
    return eoaProvider;
  }

  throw err;
}
```

**`setupAAProvider()`** — bypass WsEmbed for AA signing (Issue 2 fix):

```typescript
export async function setupAAProvider(eoaProvider: IProvider): Promise<AccountAbstractionProvider | null> {
  // ...

  // Resolve signing provider — bypass WsEmbed
  let signingProvider: IProvider = eoaProvider;

  if (!(eoaProvider instanceof EthereumPrivateKeyProvider)) {
    try {
      // Happy path: extract key from modal provider (standard Web3Auth RPC)
      const privKey = await eoaProvider.request({ method: 'private_key' }) as string;
      if (privKey && privKey.length >= 32) {
        signingProvider = await buildProviderFromPrivKey(privKey);
      }
    } catch {
      // Fallback: extract from connector internals (error recovery path)
      const privKey = extractPrivKeyFromConnector(web3authInstance!);
      if (privKey) {
        signingProvider = await buildProviderFromPrivKey(privKey);
      }
    }
  }

  const aaProvider = await AccountAbstractionProvider.getProviderInstance({
    eoaProvider: signingProvider,  // ← in-process signer, not modal provider
    smartAccountInit: new SafeSmartAccount(),
    // ...
  });
}
```

**`extractPrivKeyFromConnector()`** — reads raw private key from connector internals:

```typescript
function extractPrivKeyFromConnector(w3a: Web3Auth): string | null {
  try {
    const connector = (w3a as any).connectedConnector
      || (w3a as any).connectors?.find((c: any) => c.name === WALLET_CONNECTORS.AUTH);
    const privKey = connector?.authInstance?.privKey || connector?.authInstance?.coreKitKey;
    return privKey && privKey.length >= 32 ? privKey : null;
  } catch {
    return null;
  }
}
```

**`buildProviderFromPrivKey()`** — creates a full Ethereum provider from raw private key:

```typescript
async function buildProviderFromPrivKey(privKey: string): Promise<IProvider> {
  const pkProvider = new EthereumPrivateKeyProvider({
    config: {
      chainConfig: {  // ← must be chainConfig, NOT chain
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: "0x2105",
        rpcTarget: "https://base-rpc.publicnode.com",
        // ...
      },
    },
  });
  await pkProvider.setupProvider(privKey);
  return pkProvider;
}
```

> **Critical bug fixed**: The config key must be `chainConfig` (from `BaseProviderConfig`), not `chain`. Using `chain` leaves `chainConfig` as `undefined` and the provider fails silently.

### Why `EthereumPrivateKeyProvider` (not `CommonPrivateKeyProvider`)

`AccountAbstractionProvider.getProviderInstance()` calls `eth_accounts` and `personal_sign` internally to derive the Safe address.

| Provider | `eth_accounts` | `personal_sign` | Works for AA |
|----------|---------------|-----------------|--------------|
| `CommonPrivateKeyProvider` | ❌ | ❌ | ❌ — "Response has no error or result for request" |
| `EthereumPrivateKeyProvider` | ✓ | ✓ | ✓ |

### Why Mobile App Was Not Affected

Mobile uses `@web3auth/react-native-sdk` which does **not include WsEmbed** (a browser-only iframe component). The React Native SDK signs in-process via `EthereumPrivateKeyProvider` directly — no `api-wallet.web3auth.io/auth/verify` call during signing. This is why mobile continued working while web was broken.

### Packages Added

```json
"@web3auth/ethereum-provider": "9.7.0"
```

Must be a **direct dependency** in `package.json` — Vite cannot resolve transitive deps at build time.

---

## Result

```
[Web3Auth] AA setup: using EthereumPrivateKeyProvider (bypassed WsEmbed)   ← happy path
[Web3Auth] AA setup: using EthereumPrivateKeyProvider via connector fallback ← error recovery path
[Web3Auth] AA provider set up successfully (post-login)
[Auth] [POPUP-SA] Address: 0x294f0a6608fe52dd69846938ac719dd48f9c1391
[Auth] [POPUP-SA] Signature format: {length: 132, ...}
[Auth] ✓ DeHub authentication complete via Smart Account (Popup Flow)
[Auth] Login success {method: 'popup-sa', address: '0x294f...', username: 'solarscholar_d5bf'}
```

- Smart Account address matches mobile app ✓
- Standard 132-byte ECDSA signature (backend accepts) ✓
- WsEmbed completely bypassed for both login AND signing ✓
- Works in both happy path (WsEmbed succeeds) and error recovery path ✓

---

## Commits

| Hash | Description |
|------|-------------|
| `77ff37664` | Remove accountAbstractionConfig from modal init (partial fix attempt) |
| `9f6b479b6` | Catch WsEmbed error, extract privKey, build EOA provider as fallback |
| `965e85b9c` | Replace CommonPrivateKeyProvider with EthereumPrivateKeyProvider |
| `e22598307` | Fix config key: `chain` → `chainConfig` in EthereumPrivateKeyProvider |
| `f15e44885` | Attempt: replace modal provider in setupAAProvider (reverted — incomplete) |
| `aaeedd828` | Fix setupAAProvider: bypass WsEmbed via `private_key` RPC + connector fallback |

---

## Notes for Future

- **Web3Auth status page:** https://status.web3auth.io/ — check here first if login breaks without code changes
- **Builder Hub thread:** https://builder.metamask.io/t/auth-verify-fails-signatures-0-must-be-500-characters-account-abstraction/3072
- If Web3Auth fixes the server-side regression, WsEmbed will work again. Our bypass is safe to keep — it just signs in-process instead of via WsEmbed, same result.
- The `private_key` RPC method is a standard Web3Auth feature — it exposes the raw key for in-process use. It is safe to use here because we never transmit it anywhere.
