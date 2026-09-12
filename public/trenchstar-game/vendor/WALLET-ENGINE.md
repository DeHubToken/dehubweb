# Trading wallet engine

Built from `scripts/trenchstar-wallet-engine.mjs` with `node scripts/build-trenchstar-wallets.cjs` after installing the repository dependencies. The optional first argument supplies a dependency directory. The generated module is served locally with the game; wallet creation and signing do not load executable code from a remote CDN.

Uses the repository's ethers, @solana/web3.js, bs58, buffer, and qrcode-generator dependencies. Bundled license notices are in wallet-engine.js.LEGAL.txt. The source, artifact, and encryption/signing tests must be updated together.

Wallet records contain public metadata and AES-GCM ciphertext only. Password-derived encryption uses PBKDF2-SHA256 with 600,000 iterations, random 16-byte salts and 12-byte IVs, and authenticated wallet identity metadata. Private keys are not sent to the host bridge, backend, analytics, or RPC. RPC endpoints receive public reads and signed transactions.

Wallets are device-local and require an exported private-key backup for recovery or another device. Reloading preserves the selected address in a locked state. Changing networks does not change wallet identity. Locking never falls back to account-wallet signing. The native app dispatches `trenchstar:wallet-lock` when losing focus; the game also locks on visibility loss and inactivity.
