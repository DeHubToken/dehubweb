# Authentication Setup — Current vs Original

## TL;DR

| Aspect | Original (`cosmic-echo-hero-main`) | Current (`cosmic-echo-hero`) |
|--------|-----------------------------------|-----------------------------|
| **Web3Auth SDK** | v10 Modal (`@web3auth/modal@10.13.2`) | v8 No-Modal (`@web3auth/no-modal@8.12.4`) |
| **Signature Type** | EIP-1271 Smart Contract (~2000+ chars) | Standard ECDSA (~132 chars) |
| **Private Key Access** | BLOCKED by v10 wallet services | WORKS via `eth_private_key` |
| **Account Abstraction** | Yes (Pimlico AA Provider) | No (Direct EOA) |
| **Wallet Connection** | Web3Auth Modal handles everything | Wagmi (external wallets) + Web3Auth (social) |
| **RPC URL** | `mainnet.base.org` (returns 403) | `base-rpc.publicnode.com` (works) |
| **Aggregate Verifier** | Not configured | Supported (optional via edge function) |
| **clientId Source** | Edge function (`get-web3auth-config`) | Edge function (`get-web3auth-config`) — same |

---

## 1. SDK Version Change (BIGGEST CHANGE)

### Original (v10)
```json
"@web3auth/modal": "10.13.2",
"@web3auth/ethereum-provider": "9.7.0",
"@web3auth/account-abstraction-provider": "9.7.0"
```

### Current (v8)
```json
"@web3auth/no-modal": "8.12.4",
"@web3auth/openlogin-adapter": "8.12.4",
"@web3auth/ethereum-provider": "8.12.4",
"@web3auth/base": "8.12.4"
```

### Why changed?
Web3Auth v10 Modal SDK routes ALL provider requests through `wallet.web3auth.io`. This **blocks `eth_private_key`** RPC method and returns **EIP-1271 smart contract signatures** instead of standard ECDSA. DeHub backend (`/api/web/auth`) rejects EIP-1271 signatures — it requires standard ECDSA (~132 chars).

---

## 2. Web3Auth Initialization (`src/lib/web3auth.ts`)

### Original (v10)
```typescript
import { Web3Auth, WALLET_CONNECTORS } from "@web3auth/modal";
import { AccountAbstractionProvider } from "@web3auth/account-abstraction-provider";

const web3auth = new Web3Auth({
  clientId,
  chainConfig,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
  accountAbstractionProvider: new AccountAbstractionProvider({
    config: { /* Pimlico bundler + paymaster */ }
  })
});

// External wallets via Web3Auth Modal
await web3auth.connectTo(WALLET_CONNECTORS.METAMASK);
await web3auth.connectTo(WALLET_CONNECTORS.WALLET_CONNECT_V2);
```

### Current (v8)
```typescript
import { Web3AuthNoModal } from "@web3auth/no-modal";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

const privateKeyProvider = new EthereumPrivateKeyProvider({
  config: { chainConfig }
});

const web3auth = new Web3AuthNoModal({
  clientId,
  chainConfig,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
  // NO Account Abstraction
});

const openloginAdapter = new OpenloginAdapter({
  privateKeyProvider,
  adapterSettings: {
    uxMode: isMobile ? UX_MODE.REDIRECT : UX_MODE.POPUP,
    redirectUrl,
    loginConfig: { /* optional aggregate verifier */ }
  }
});
web3auth.configureAdapter(openloginAdapter);

// External wallets handled by Wagmi (NOT Web3Auth)
```

### Key Differences:
- **No `AccountAbstractionProvider`** — no Pimlico, no smart accounts
- **`EthereumPrivateKeyProvider`** gives direct `eth_private_key` access
- **`OpenloginAdapter`** instead of built-in modal adapters
- **External wallets moved to Wagmi** — Web3Auth only handles social/email/SMS

---

## 3. Signature Generation (CRITICAL — Affects Address)

### Original (v10) — Social Login
```typescript
// Uses provider.request which goes through AA layer
const accounts = await provider.request({ method: 'eth_accounts' });
const address = accounts[0]; // Smart Account address (AA)

const signature = await provider.request({
  method: 'personal_sign',
  params: [message, address],
});
// Returns: EIP-1271 signature (2000+ chars) ❌ DeHub rejects this
```

### Current (v8) — Social Login
```typescript
// Gets raw private key, signs directly with ethers
const privateKey = await provider.request({ method: 'eth_private_key' });
const wallet = new Wallet(privateKey);
const address = wallet.address; // EOA address (NOT smart account)

const signature = await wallet.signMessage(message);
// Returns: Standard ECDSA signature (~132 chars) ✓ DeHub accepts
```

### This is why addresses are different!
- Original: `eth_accounts` returns **Smart Account address** (AA-derived)
- Current: `eth_private_key` + `ethers.Wallet` returns **EOA address** (key-derived)
- Same email + same clientId → different address depending on which method is used

---

## 4. Wallet Connection Architecture

### Original (v10)
```
All wallets → Web3Auth Modal SDK
  ├─ Social (Google, Email, etc.) → Embedded wallet via AA
  ├─ MetaMask → WALLET_CONNECTORS.METAMASK
  ├─ WalletConnect → WALLET_CONNECTORS.WALLET_CONNECT_V2
  ├─ Phantom → WALLET_CONNECTORS.PHANTOM
  └─ Coinbase → WALLET_CONNECTORS.COINBASE
```

### Current (v8)
```
Social logins → Web3Auth No-Modal (v8)
  ├─ Google, Twitter, Telegram, Apple, Discord, GitHub
  ├─ Email Passwordless
  └─ SMS Passwordless

External wallets → Wagmi + Reown AppKit (separate from Web3Auth)
  ├─ Injected (MetaMask, Rabby, etc.)
  ├─ WalletConnect
  └─ Coinbase
```

---

## 5. Auth Context (`src/contexts/AuthContext.tsx`)

### Original
- Single connection path through Web3Auth
- `isSocialLogin()` check determines signing method
- No Wagmi integration
- Simpler flow

### Current
- **Two connection paths**: Web3Auth (social) + Wagmi (wallets)
- `connectionSource` tracks which path: `'web3auth' | 'wagmi'`
- Full Wagmi hooks: `useAccount`, `useSignMessage`, `useDisconnect`, `useConnect`
- `completeDeHubAuth(provider)` — for Web3Auth social logins
- `completeDeHubAuthWagmi(address)` — for Wagmi wallet connections
- `completeDeHubAuthAfterRedirect(provider)` — for mobile redirect flow
- Auto-connect logic for mobile in-app browsers
- `wagmiAuthIntentRef` to prevent unwanted auto-connect

---

## 6. Username Enforcement Flow

### Both codebases — SAME flow:
```typescript
const authResponse = await authenticateWallet(address, signature, timestamp, chainId);
const normalizedUser = normalizeUser(authResponse.user, authAddress);

if (!normalizedUser.username) {
  setRequiresUsername(true);  // Shows username setup modal
}
```

The username enforcement modal works the same way in both versions. If `/api/web/auth` returns a user without a username, the app forces the user to set one before continuing.

---

## 7. Edge Function: `get-web3auth-config`

### Original
Returns:
```json
{ "clientId": "BERcmK50vSCtHWg..." }
```

### Current
Returns:
```json
{
  "clientId": "BERcmK50vSCtHWg...",
  "aggregateVerifier": "...",      // optional
  "googleSubVerifier": "...",       // optional
  "emailSubVerifier": "...",        // optional
  "googleClientId": "..."           // optional
}
```

The aggregate verifier fields are only returned if the env vars are set. Currently they appear to NOT be set (logs show `aggregateVerifier: "web3auth-auth0-email-passwordless-sapphire"` which is the Web3Auth default, not a custom one).

---

## 8. Chain Config

### Original
```typescript
rpcTarget: "https://mainnet.base.org"  // Returns 403 errors
```

### Current
```typescript
rpcTarget: "https://base-rpc.publicnode.com"  // Works
```

---

## 9. Vite Config

### Current (added)
```typescript
resolve: {
  dedupe: [
    "@web3auth/no-modal",
    "@toruslabs/base-controllers",
    "@toruslabs/ethereum-controllers",
    "permissionless",
    "viem",
    "@wagmi/core",
    "@wagmi/connectors",
  ]
}
```
Prevents duplicate module instances which cause Web3Auth initialization failures.

---

## 10. What Could Cause Different Addresses for Same Email

### Factors that change the generated wallet address:

1. **Web3Auth clientId** — Different clientId = different key = different address
2. **Web3Auth network** — `SAPPHIRE_MAINNET` vs `SAPPHIRE_DEVNET` vs `CYAN` etc.
3. **Verifier** — Default (`web3auth`) vs Custom aggregate verifier
4. **verifierSubIdentifier** — Changes the key derivation path
5. **SDK version** — v8 EOA vs v10 AA derive different addresses from same key
6. **`loginConfig`** — Custom login config in OpenloginAdapter changes verifier routing

### If the client reports different addresses for same email:
- Check if `clientId` is the same across web and mobile
- Check if `web3AuthNetwork` matches
- Check if one uses aggregate verifier and other doesn't
- Check if mobile uses v10 (AA address) vs web uses v8 (EOA address)

---

## 11. Login Flow Diagram

```
                    ┌─────────────────┐
                    │   User clicks   │
                    │    "Login"      │
                    └────────┬────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
          Social/Email/SMS          External Wallet
                 │                       │
        ┌────────┴────────┐      ┌───────┴───────┐
        │  Web3Auth v8    │      │    Wagmi +     │
        │  No-Modal SDK   │      │  Reown AppKit  │
        │  (OpenloginAdapter)    │  (injected/WC) │
        └────────┬────────┘      └───────┬───────┘
                 │                       │
        eth_private_key           eth_accounts
                 │                       │
        ethers.Wallet             signMessageAsync
        .signMessage()            (wagmi hook)
                 │                       │
        ECDSA signature           ECDSA signature
        (~132 chars)              (~132 chars)
                 │                       │
                 └───────────┬───────────┘
                             │
                  ┌──────────┴──────────┐
                  │  POST /api/web/auth │
                  │  { address, sig,    │
                  │    timestamp,       │
                  │    chainId: 8453 }  │
                  └──────────┬──────────┘
                             │
                  ┌──────────┴──────────┐
                  │  DeHub Backend      │
                  │  - New addr? Create │
                  │  - Existing? Login  │
                  │  Returns: token +   │
                  │           user obj  │
                  └──────────┬──────────┘
                             │
                  ┌──────────┴──────────┐
                  │  Username check     │
                  │  user.username?     │
                  │  - Yes → Dashboard  │
                  │  - No → Setup Modal │
                  └─────────────────────┘
```





Haan, humne SDK version change kiya hai — yahi root cause hai. Let me exact comparison dikhata hoon.
                                                                                                       ● Searched for 1 pattern, read 1 file (ctrl+o to expand)                                                  
● Now let me check the original AuthContext:                                                             
● Searched for 1 pattern, read 1 file (ctrl+o to expand)                                                 
● Ab clear picture hai. Yeh raha exact answer:                                                                                                                                                                
  Kya change kiya humne? — Haan, SDK version badla hai                                                   
  Original code (jo pehle kaam karta tha):                                                               Web3Auth Modal v10 + Account Abstraction (Pimlico Smart Accounts)                                    
  - Address derive hota tha: eth_accounts → Smart Account address (Safe AA)
  - Signature: personal_sign → EIP-1271 (Smart Contract signature)

  Current code (jo ab chal rha hai):
  Web3Auth No-Modal v8 + Direct Private Key
  - Address derive hota hai: eth_private_key → ethers.Wallet → EOA address
  - Signature: wallet.signMessage() → Standard ECDSA (~132 chars)

  Yeh kyu kiya tha?

  Kyunki v10 ki EIP-1271 signatures (2000+ chars) ko DeHub backend reject karta tha. DeHub ko standard 
  ECDSA signatures chahiye. Toh v8 pe move kiya taaki direct private key access mil sake.

  Isse kya hua?

  Same email + same clientId se dono SDK versions ALAG address generate karte hain:
  - v10: eth_accounts → Smart Account address (AA-derived, contract address)
  - v8: eth_private_key → EOA address (key-derived, regular wallet)

  Isliye:
  - Mobile app (agar v10 use karta hai) → generates address A
  - Web app (ab v8 use karta hai) → generates address B
  - Address A ≠ Address B → DeHub creates new account

  Actual Fix Required

  Mobile app bhi v10 use karti hogi. Dono pe same address aane ke liye, ya toh dono v8 pe ho ya dono   
  v10 pe ho. Lekin v10 ka signature DeHub reject karta hai, toh either:

  1. DeHub backend ko EIP-1271 signatures accept karne chahiye (backend change)
  2. Ya mobile app bhi v8 pe move karna padega (mobile team ka kaam)
  3. Ya v10 mein AA disable karke EOA address use karo — lekin v10 mein eth_private_key blocked hai    

  Client ko yeh batao: "Web SDK version v10 se v8 pe move kiya gaya tha kyunki v10 ki signatures       
  backend reject karta tha. Isse address generation method badal gaya. Mobile app agar abhi bhi v10 pe 
  hai, toh same email se alag address banega. Fix ke liye mobile aur web dono ko same SDK version pe   
  hona chahiye."