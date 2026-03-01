

## Will this break other login systems? No.

The fix changes the relative-path branch from **reconstructing** the URL to **preserving** the API-provided path:

```text
BEFORE:  CDN + "avatars/" + {passed address} + ".jpg"
AFTER:   CDN + {apiAvatarPath as-is}
```

**Why it's safe for all existing logins:**

The API already returns the correct address in the avatar path (e.g. `avatars/0xABC.jpg`). For every working user today — MetaMask, Trust, Phantom, Email/SMS via Web3Auth, @early's AA account — the API path already contains the right address. The current code just happens to reconstruct the same URL, so the output is identical.

The only case where it differs is @discordbro, where the `minter` (AA address) doesn't match the EOA address embedded in the filename. The current code overwrites the correct filename with the wrong address. The fix simply stops overwriting it.

**In short:** For all working accounts, `CDN + apiPath` produces the exact same URL as `CDN + avatars/{address}.{ext}` because the API path already contains that address. The fix only changes the result for the broken case.

