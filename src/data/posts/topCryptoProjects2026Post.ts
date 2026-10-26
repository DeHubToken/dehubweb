import { BlogPost as BlogPostType } from '@/types/blog';

export const topCryptoProjects2026Post: BlogPostType = {
  id: 'top-100-crypto-projects-2026',
  slug: 'top-100-crypto-projects-2026',
  title: 'Top 100 Crypto Projects 2026, Ranked by GitHub Activity',
  seoTitle: 'Top 100 Most Active Crypto Projects 2026 by GitHub Activity | DeHub',
  seoDescription: 'The 100 most active crypto projects of 2026, ranked by real GitHub commits and developers over 90 days. ElizaOS, DefiLlama, MetaMask, Ledger, Solana, Ethereum and more.',
  excerpt: 'We counted every commit and every active developer across more than 370 public GitHub repos behind 270 crypto projects over 90 days, then ranked the 100 most active. An AI agent framework leads, wallets are the busiest corner, and about 1 in 6 commits now credit AI.',
  content: `Which crypto projects are actually being built right now? Prices move every day, but code is much harder to fake. We counted every commit and every active developer across more than 370 public GitHub repositories behind 270 crypto projects over the last 90 days, then ranked the **100 most active crypto projects by GitHub activity**. Blockchains, wallets, DeFi, Bitcoin and Lightning, developer tools and AI are all in one list, and every number comes from the projects' own public code.

![How we scored the top 100 crypto projects by GitHub activity](/media/fig-crypto-method.jpg)

## How we scored the top 100 crypto projects

- **What we counted:** commits on the default branch of each project's main public repositories (up to three repos per project) between 28 July and 26 October 2026.
- **Commits (50 points):** non-merge commits. Bots such as Dependabot, Renovate, release bots and translation bots are filtered out, and so are commits written entirely by AI coding agents, so only work a person signed off on counts.
- **Developers (50 points):** unique human commit authors in the same window.
- **Scale:** both parts use a log scale against the leader, so the busiest project on commits gets 50 and the biggest team gets 50. A project needs both a lot of code and a lot of people to reach the top.
- **Forks:** where a project runs a fork of another codebase (for example a Geth or Reth fork), we removed the upstream commits it pulled in, so only its own work counts.
- **What is in scope:** anything crypto. Layer 1s and Layer 2s, Ethereum and Bitcoin clients, wallets, DeFi apps, bridges, oracles, zero-knowledge tools, developer libraries and AI agent frameworks.

GitHub activity is not the same as price, users or security. Some teams build in private, some ship in big batches, and some projects are simply finished. Treat this as a picture of who is building in public right now, not as investment advice.

## The top 10 most active crypto projects

![The top 10 most active crypto projects on GitHub in 2026, by activity score](/media/fig-crypto-top10.jpg)

### #1 ElizaOS: 90/100

- **Activity:** 17,062 commits from 147 developers, the most commits of any crypto project we measured, by a wide margin.
- **Repo:** elizaOS/eliza.
- **What they are building:** an open source framework for AI agents that can hold wallets, post, trade and talk across Slack, WhatsApp, X and more, plus Eliza Cloud to host them. It grew out of the ai16z crypto community, and it is the clearest example on this list of a community building with AI at full speed.
- **Website:** [elizaos.ai](https://elizaos.ai)

### #2 DefiLlama: 87/100

- **Activity:** 1,346 commits from 512 developers, the biggest crowd of any crypto project.
- **Repo:** DefiLlama/DefiLlama-Adapters.
- **What they are building:** the open dataset behind DefiLlama's TVL numbers. Almost 9 in 10 contributors landed three commits or fewer, because each new DeFi protocol writes its own adapter. It is a whole industry maintaining one shared public good.
- **Website:** [defillama.com](https://defillama.com)

### #3 MetaMask: 84/100

- **Activity:** 4,704 commits from 163 developers.
- **Repos:** MetaMask/metamask-extension, metamask-mobile and core.
- **What they are building:** perpetuals trading inside the wallet, rewards, Bitcoin and Stellar support, cross-chain swaps and a faster mobile app.
- **Website:** [metamask.io](https://metamask.io)

### #4 Ledger Live: 80/100

- **Activity:** 5,915 commits from 80 developers, the second most commits on the list.
- **Repo:** LedgerHQ/ledger-live.
- **What they are building:** the desktop and mobile app for Ledger hardware wallets, with new coin integrations such as Tron, Stacks, Kaspa and Internet Computer.
- **Website:** [ledger.com](https://www.ledger.com)

### #5 Solana: 79/100

- **Activity:** 2,618 commits from 117 developers, the busiest blockchain of all.
- **Repos:** anza-xyz/agave and firedancer-io/firedancer.
- **What they are building:** Alpenglow, Solana's new consensus design, plus faster accounts and snapshots, across two independent validator teams.
- **Website:** [solana.com](https://solana.com)

### #6 Trezor: 77/100

- **Activity:** 3,872 commits from 76 developers.
- **Repos:** trezor/trezor-suite and trezor/trezor-firmware.
- **What they are building:** the Trezor Suite app on desktop and mobile, and fully open firmware for its newest hardware, including Bluetooth and clear signing for smart contract calls.
- **Website:** [trezor.io](https://trezor.io)

### #7 Ethereum: 72/100

- **Activity:** 697 commits from 126 developers in Geth and the protocol specs alone.
- **Repos:** ethereum/go-ethereum, consensus-specs and execution-specs.
- **What they are building:** the Glamsterdam network upgrade. Ethereum's other clients are ranked separately below, and together they make Ethereum by far the biggest ecosystem on this list.
- **Website:** [ethereum.org](https://ethereum.org)

### #8 Foundry: 72/100

- **Activity:** 1,340 commits from 75 developers.
- **Repo:** foundry-rs/foundry.
- **What they are building:** Forge, Anvil and Cast, the tools most Solidity developers now use to write, test and deploy smart contracts.
- **Website:** [getfoundry.sh](https://getfoundry.sh)

### #9 Nethermind: 70/100

- **Activity:** 1,765 commits from 54 developers.
- **Repo:** NethermindEth/nethermind.
- **What they are building:** Ethereum's C# execution client, with work on block-level access lists for the next upgrade and big speed-ups to the EVM and RPC.
- **Website:** [nethermind.io](https://www.nethermind.io)

### #10 Reth: 69/100

- **Activity:** 813 commits from 75 developers.
- **Repo:** paradigmxyz/reth.
- **What they are building:** Paradigm's Rust Ethereum client. Base, Tempo and many other chains build their own nodes on top of it, so its code reaches far beyond Ethereum.
- **Website:** [reth.rs](https://reth.rs)

## The full top 100 at a glance

1. **ElizaOS**: 90/100. AI agents. 17,062 commits, 147 developers. Open source framework for AI agents that can hold wallets and act on chain, started by the ai16z crypto community (elizaOS/eliza).
2. **DefiLlama**: 87/100. Data. 1,346 commits, 512 developers. The open data site that tracks money locked in DeFi, with adapters written by the protocols themselves (DefiLlama/DefiLlama-Adapters).
3. **MetaMask**: 84/100. Wallet. 4,704 commits, 163 developers. The most used Ethereum wallet, on desktop and mobile (MetaMask/metamask-extension, MetaMask/metamask-mobile, MetaMask/core).
4. **Ledger Live**: 80/100. Wallet. 5,915 commits, 80 developers. The app behind Ledger hardware wallets (LedgerHQ/ledger-live).
5. **Solana**: 79/100. Layer 1. 2,618 commits, 117 developers. Fast Layer 1 with two independent validator clients, Agave and Firedancer (anza-xyz/agave, firedancer-io/firedancer).
6. **Trezor**: 77/100. Hardware wallet. 3,872 commits, 76 developers. Open source hardware wallet, firmware and the Trezor Suite app (trezor/trezor-suite, trezor/trezor-firmware).
7. **Ethereum**: 72/100. Layer 1. 697 commits, 126 developers. The biggest smart contract chain: Geth plus the protocol specs (ethereum/go-ethereum, ethereum/consensus-specs, ethereum/execution-specs).
8. **Foundry**: 72/100. Developer tools. 1,340 commits, 75 developers. The most popular toolkit for writing and testing smart contracts (foundry-rs/foundry).
9. **Nethermind**: 70/100. Ethereum client. 1,765 commits, 54 developers. Ethereum execution client written in C# (NethermindEth/nethermind).
10. **Reth**: 69/100. Ethereum client. 813 commits, 75 developers. Paradigm's Rust Ethereum client, also used by Base and Tempo (paradigmxyz/reth).
11. **Erigon**: 69/100. Ethereum client. 1,413 commits, 49 developers. Ethereum client built for archive nodes and speed (erigontech/erigon).
12. **Bitcoin**: 68/100. Layer 1. 699 commits, 76 developers. Bitcoin Core, the reference Bitcoin node (bitcoin/bitcoin).
13. **Zcash**: 68/100. Privacy coin. 1,042 commits, 55 developers. Privacy coin, building the Zebra node and shared Rust libraries (ZcashFoundation/zebra, zcash/librustzcash).
14. **CCXT**: 67/100. Exchange library. 1,009 commits, 53 developers. Open source library that connects trading code to more than 100 exchanges (ccxt/ccxt).
15. **Miden**: 67/100. ZK rollup. 769 commits, 59 developers. Zero-knowledge rollup with private accounts, spun out of Polygon (0xMiden/miden-vm, 0xMiden/miden-node, 0xMiden/miden-client).
16. **Tempo**: 66/100. Payments chain. 1,025 commits, 44 developers. Payments-first blockchain from Stripe and Paradigm (tempoxyz/tempo).
17. **Cardano**: 65/100. Layer 1. 1,147 commits, 37 developers. Proof-of-stake Layer 1 built in Haskell (IntersectMBO/cardano-node, IntersectMBO/cardano-ledger, IntersectMBO/ouroboros-consensus).
18. **Chainlink**: 65/100. Oracle network. 462 commits, 63 developers. Oracle network that brings outside data on chain (smartcontractkit/chainlink).
19. **Optimism**: 64/100. Layer 2. 549 commits, 51 developers. The OP Stack behind Optimism, Base and many other Layer 2s (ethereum-optimism/optimism, ethereum-optimism/op-geth).
20. **Base**: 64/100. Layer 2. 1,185 commits, 29 developers. Coinbase's Layer 2, now running its own Rust node (base/node-reth, base/node).
21. **Zama**: 63/100. FHE. 598 commits, 45 developers. Fully homomorphic encryption, so smart contracts can compute on encrypted data (zama-ai/fhevm, zama-ai/tfhe-rs).
22. **Polkadot**: 63/100. Layer 0. 286 commits, 72 developers. Polkadot SDK for the relay chain and its parachains (paritytech/polkadot-sdk).
23. **Status**: 63/100. Messenger and wallet. 1,627 commits, 22 developers. Private messenger, crypto wallet and browser in one app (status-im/status-desktop, status-im/status-go).
24. **Sui**: 63/100. Layer 1. 468 commits, 50 developers. Layer 1 built on the Move language (MystenLabs/sui).
25. **Besu**: 63/100. Ethereum client. 398 commits, 54 developers. Java Ethereum client from the Hyperledger community (hyperledger/besu).
26. **CoW Protocol**: 62/100. DEX. 822 commits, 32 developers. DEX aggregator that protects traders from MEV (cowprotocol/cowswap, cowprotocol/services).
27. **viem and wagmi**: 62/100. Developer tools. 233 commits, 70 developers. The TypeScript libraries most Ethereum apps use to talk to the chain (wevm/viem, wevm/wagmi).
28. **Starknet**: 62/100. Layer 2. 403 commits, 47 developers. ZK rollup on Ethereum, with the Cairo language and Pathfinder node (starkware-libs/sequencer, starkware-libs/cairo, eqlabs/pathfinder).
29. **Alloy**: 61/100. Developer tools. 307 commits, 53 developers. Rust libraries for Ethereum, used by Reth and Foundry (alloy-rs/alloy, alloy-rs/core).
30. **Safe**: 61/100. Smart wallet. 690 commits, 30 developers. Smart account wallet that secures billions in team and DAO funds (safe-global/safe-wallet-monorepo, safe-global/safe-smart-account, safe-global/safe-transaction-service).
31. **Zashi (Zcash wallet)**: 61/100. Wallet. 1,934 commits, 14 developers. The Zcash wallet for Android and iOS (Electric-Coin-Company/zashi-android, Electric-Coin-Company/zashi-ios).
32. **OneKey**: 60/100. Hardware wallet. 1,004 commits, 21 developers. Open source hardware and software wallet (OneKeyHQ/app-monorepo, OneKeyHQ/firmware-pro).
33. **Hedera**: 60/100. Layer 1. 482 commits, 34 developers. Hashgraph Layer 1, now developed in the open as Hiero (hiero-ledger/hiero-consensus-node).
34. **Internet Computer**: 60/100. Layer 1. 703 commits, 26 developers. Layer 1 that hosts full apps on chain (dfinity/ic).
35. **Bisq**: 60/100. Bitcoin DEX. 1,410 commits, 16 developers. Peer-to-peer Bitcoin exchange with no sign-up (bisq-network/bisq, bisq-network/bisq2).
36. **XRP Ledger**: 60/100. Layer 1. 367 commits, 38 developers. Payments Layer 1 and its JavaScript library (XRPLF/rippled, XRPLF/xrpl.js).
37. **Arbitrum**: 60/100. Layer 2. 784 commits, 23 developers. The largest optimistic rollup on Ethereum (OffchainLabs/nitro, OffchainLabs/nitro-contracts).
38. **Hardhat**: 59/100. Developer tools. 527 commits, 29 developers. Ethereum development environment from the Nomic Foundation (NomicFoundation/hardhat).
39. **LDK**: 59/100. Bitcoin Layer 2. 409 commits, 34 developers. Lightning Dev Kit, the toolkit many Lightning wallets are built on (lightningdevkit/rust-lightning, lightningdevkit/ldk-node).
40. **Celestia**: 59/100. Data availability. 443 commits, 32 developers. Data availability layer for rollups (celestiaorg/celestia-app, celestiaorg/celestia-node).
41. **Monero**: 59/100. Privacy coin. 362 commits, 36 developers. Privacy coin with private-by-default payments (monero-project/monero).
42. **Cashu**: 59/100. Bitcoin ecash. 404 commits, 33 developers. Bitcoin ecash protocol for private payments (cashubtc/cdk, cashubtc/nutshell).
43. **Blockstream Green**: 58/100. Bitcoin wallet. 449 commits, 28 developers. Bitcoin and Liquid wallet plus the Jade hardware wallet (Blockstream/green_android, Blockstream/green_ios, Blockstream/Jade).
44. **Curve**: 58/100. DEX. 1,756 commits, 11 developers. Stablecoin DEX and the crvUSD stablecoin (curvefi/curve-frontend, curvefi/curve-stablecoin).
45. **Plonky3**: 58/100. ZK proving. 487 commits, 25 developers. Toolkit for building fast zero-knowledge provers (Plonky3/Plonky3).
46. **IOTA**: 58/100. Layer 1. 454 commits, 26 developers. Layer 1 now running a Move-based network (iotaledger/iota).
47. **Core Lightning**: 58/100. Bitcoin Layer 2. 377 commits, 29 developers. Lightning Network node from Blockstream (ElementsProject/lightning).
48. **Rotki**: 58/100. Portfolio tracker. 979 commits, 15 developers. Open source, self-hosted crypto portfolio tracker (rotki/rotki).
49. **Ambire**: 57/100. Smart wallet. 1,514 commits, 11 developers. Smart account wallet for Ethereum chains (AmbireTech/extension).
50. **Lighthouse**: 57/100. Ethereum client. 230 commits, 37 developers. Rust Ethereum consensus client from Sigma Prime (sigp/lighthouse).
51. **Monad**: 57/100. Layer 1. 296 commits, 31 developers. Parallel EVM Layer 1 (category-labs/monad-bft, category-labs/monad).
52. **Aleo**: 57/100. Privacy Layer 1. 668 commits, 17 developers. Privacy Layer 1 for zero-knowledge apps (ProvableHQ/snarkOS, ProvableHQ/snarkVM).
53. **Morpho**: 56/100. Lending. 723 commits, 16 developers. Lending protocol and vaults (morpho-org/morpho-blue, morpho-org/vault-v2, morpho-org/sdks).
54. **Linea**: 56/100. Layer 2. 331 commits, 27 developers. Consensys' ZK rollup on Ethereum (Consensys/linea-monorepo).
55. **Aztec**: 56/100. Privacy Layer 2. 331 commits, 27 developers. Privacy-first ZK rollup on Ethereum (AztecProtocol/aztec-packages).
56. **BitBox**: 56/100. Hardware wallet. 454 commits, 21 developers. Swiss hardware wallet and its app (BitBoxSwiss/bitbox-wallet-app, BitBoxSwiss/bitbox02-firmware).
57. **Lodestar**: 56/100. Ethereum client. 458 commits, 20 developers. TypeScript Ethereum consensus client (ChainSafe/lodestar).
58. **Fedimint**: 56/100. Bitcoin custody. 493 commits, 19 developers. Community-run Bitcoin custody with ecash (fedimint/fedimint).
59. **Dash**: 56/100. Payments coin. 733 commits, 14 developers. Payments coin forked from Bitcoin (dashpay/dash).
60. **Prysm**: 55/100. Ethereum client. 328 commits, 23 developers. Go Ethereum consensus client (OffchainLabs/prysm).
61. **Zeus**: 55/100. Bitcoin wallet. 1,276 commits, 9 developers. Bitcoin and Lightning wallet (ZeusLN/zeus).
62. **Aptos**: 55/100. Layer 1. 324 commits, 23 developers. Move-based Layer 1 (aptos-labs/aptos-core).
63. **Nimbus**: 55/100. Ethereum client. 302 commits, 24 developers. Lightweight Ethereum consensus client from Status (status-im/nimbus-eth2).
64. **Sei**: 55/100. Layer 1. 515 commits, 16 developers. Parallel EVM Layer 1 (sei-protocol/sei-chain).
65. **Akash**: 54/100. Compute network. 942 commits, 10 developers. Decentralized cloud compute marketplace (akash-network/node, akash-network/provider, akash-network/console).
66. **Solidity**: 54/100. Language. 225 commits, 26 developers. The main smart contract language on Ethereum (ethereum/solidity).
67. **Lightning (LND)**: 54/100. Bitcoin Layer 2. 388 commits, 18 developers. The most used Lightning Network node (lightningnetwork/lnd).
68. **Breez**: 54/100. Bitcoin Layer 2. 532 commits, 14 developers. SDKs that let any app send Bitcoin over Lightning, Liquid and Spark (breez/spark-sdk).
69. **XMTP**: 54/100. Messaging. 662 commits, 12 developers. Wallet-to-wallet messaging protocol (xmtp/libxmtp, xmtp/xmtp-js).
70. **NEAR**: 54/100. Layer 1. 283 commits, 21 developers. Sharded Layer 1 (near/nearcore).
71. **Mina**: 54/100. ZK Layer 1. 821 commits, 10 developers. Lightweight ZK Layer 1 (MinaProtocol/mina, o1-labs/proof-systems).
72. **Electrum**: 54/100. Bitcoin wallet. 445 commits, 15 developers. One of the oldest Bitcoin wallets (spesmilo/electrum).
73. **Anchor**: 53/100. Developer tools. 114 commits, 37 developers. The framework most Solana programs are written with (solana-foundation/anchor).
74. **BTCPay Server**: 53/100. Bitcoin payments. 255 commits, 21 developers. Self-hosted Bitcoin payment processor (btcpayserver/btcpayserver).
75. **Hyperlane**: 53/100. Messaging. 483 commits, 13 developers. Permissionless cross-chain messaging (hyperlane-xyz/hyperlane-monorepo).
76. **GMX**: 53/100. Perps DEX. 937 commits, 8 developers. Perpetuals exchange on Arbitrum and Avalanche (gmx-io/gmx-synthetics, gmx-io/gmx-interface).
77. **Bittensor**: 53/100. AI network. 512 commits, 12 developers. Network that pays for useful AI work (opentensor/subtensor).
78. **Filecoin**: 52/100. Storage network. 142 commits, 28 developers. Decentralized storage network (filecoin-project/lotus, filecoin-project/builtin-actors).
79. **Polygon**: 52/100. Sidechain. 237 commits, 19 developers. Polygon PoS chain and the AggLayer (0xPolygon/bor, 0xPolygon/heimdall-v2, agglayer/agglayer).
80. **Freqtrade**: 52/100. Trading bots. 527 commits, 11 developers. Open source crypto trading bot (freqtrade/freqtrade).
81. **Teku**: 52/100. Ethereum client. 295 commits, 16 developers. Consensys' Java Ethereum consensus client (Consensys/teku).
82. **Unstoppable Wallet**: 52/100. Wallet. 753 commits, 8 developers. Multi-chain non-custodial wallet (horizontalsystems/unstoppable-wallet-android, horizontalsystems/unstoppable-wallet-ios).
83. **ethPandaOps**: 51/100. Ethereum testing. 346 commits, 13 developers. The Ethereum Foundation team that tests every network upgrade (ethpandaops/ethereum-package, ethpandaops/dora, ethpandaops/assertoor).
84. **Rocket Pool**: 51/100. Liquid staking. 334 commits, 13 developers. Decentralized Ethereum liquid staking (rocket-pool/smartnode).
85. **Avalanche**: 51/100. Layer 1. 223 commits, 17 developers. Layer 1 with custom subnets (ava-labs/avalanchego).
86. **Grandine**: 51/100. Ethereum client. 329 commits, 13 developers. Fast Rust Ethereum consensus client (grandinetech/grandine).
87. **Jolt**: 51/100. ZK proving. 202 commits, 18 developers. a16z's zkVM for proving any program (a16z/jolt).
88. **LI.FI**: 51/100. Bridge aggregator. 473 commits, 10 developers. Bridge and DEX aggregator API (lifinance/contracts, lifinance/sdk).
89. **Stacks**: 51/100. Bitcoin Layer 2. 208 commits, 17 developers. Smart contract Layer 2 for Bitcoin (stacks-network/stacks-core).
90. **TON**: 50/100. Layer 1. 330 commits, 12 developers. Layer 1 linked to Telegram (ton-blockchain/ton).
91. **Bitcoin Dev Kit**: 50/100. Bitcoin tools. 93 commits, 27 developers. Library for building Bitcoin wallets (bitcoindevkit/bdk, bitcoindevkit/bdk-ffi).
92. **Blockscout**: 50/100. Block explorer. 344 commits, 11 developers. Open source block explorer used by hundreds of chains (blockscout/blockscout, blockscout/frontend).
93. **Cake Wallet**: 50/100. Wallet. 205 commits, 15 developers. Monero, Bitcoin and multi-coin wallet (cake-tech/cake_wallet).
94. **Rabby**: 50/100. Wallet. 427 commits, 9 developers. Ethereum wallet for DeFi users (RabbyHub/Rabby, RabbyHub/rabby-mobile).
95. **Euler**: 49/100. Lending. 562 commits, 7 developers. Modular lending protocol (euler-xyz/euler-vault-kit, euler-xyz/evk-periphery, euler-xyz/euler-lite).
96. **Kaia**: 49/100. Layer 1. 220 commits, 13 developers. Asian Layer 1 formed from Klaytn and Finschia (kaiachain/kaia).
97. **Flow**: 49/100. Layer 1. 351 commits, 9 developers. Layer 1 for consumer apps and NFTs (onflow/flow-go, onflow/cadence).
98. **Espresso**: 48/100. Shared sequencer. 294 commits, 10 developers. Shared sequencing and fast confirmations for rollups (EspressoSystems/espresso-network).
99. **Wasabi**: 48/100. Bitcoin wallet. 156 commits, 14 developers. Privacy-focused Bitcoin wallet (WalletWasabi/WalletWasabi).
100. **Haveno**: 48/100. Monero DEX. 652 commits, 5 developers. Peer-to-peer Monero exchange (haveno-dex/haveno).

## Why crypto communities win when anyone can build with AI

![About 1 in 6 commits in the top 100 crypto projects credit an AI coding assistant](/media/fig-crypto-ai.jpg)

AI has changed who gets to build. A designer, a moderator, a trader with an idea or a long-time community member can now describe what they want and ship working code the same day. Code is no longer the scarce part. What is scarce is people who care enough to keep showing up, and who all push in the same direction.

That is exactly what crypto communities have. Every holder, node runner, validator and power user owns a piece of the network and wins when it wins. When each of those people has an AI coding assistant, a community of thousands stops being an audience and becomes a development team. No company can hire that many aligned builders, not even the biggest companies in the world.

The data already shows it happening:

- **About 1 in 6 commits credit AI.** More than 16,000 commits in the top 100 openly name an AI coding assistant as the author or a co-author, and 87 of the 100 projects have at least one. Most AI-assisted code is not labelled at all, so the real share is higher.
- **In some projects AI already does most of the typing.** 81% of LI.FI's commits and 72% of the Zcash wallet Zashi's credit an AI assistant, and Mina, Internet Computer, Aleo, Celestia and Plonky3 are all above half.
- **The busiest project in crypto is an AI project built by a crypto community.** ElizaOS started in the ai16z community and shipped 17,062 commits in 90 days, more than Ledger Live and MetaMask combined.
- **The biggest crowd is a community, not a company.** 512 people improved DefiLlama in 90 days, and almost 9 in 10 of them were drive-by contributors adding their own protocol. No single team could cover that much ground.
- **The top 100 together had 3,216 different developers in 90 days.** That is close to Linux (3,544), the largest open source project in the world, as measured in our [Top 50 Most Active Open Source Projects 2026](/guides/top-50-most-active-open-source-projects-2026).

A company hires a team. A crypto network grows a crowd, gives it ownership, and pays it in the network's own token, bounties and grants. In a world where AI turns ideas into code, the projects with the most aligned people will ship the most, and crypto is built for exactly that.

## Who ships the most code

Commits show how much code lands each day. ElizaOS is in a league of its own, and wallets fill three of the next four spots. Solana is the busiest blockchain, and the Zcash wallet Zashi shipped more code than Ethereum's Geth.

![Most commits in the last 90 days: ElizaOS 17,062, Ledger Live 5,915, MetaMask 4,704, Trezor 3,872, Solana 2,618](/media/fig-crypto-commits.jpg)

## The biggest developer crowds

Developers show how many people are behind the code. DefiLlama's open adapter repo has the biggest crowd by far. MetaMask, ElizaOS, Ethereum and Solana each had more than 100 people landing code in 90 days.

![Most active developers in the last 90 days: DefiLlama 512, MetaMask 163, ElizaOS 147, Ethereum 126, Solana 117](/media/fig-crypto-devs.jpg)

## What kind of projects make the top 100

![The top 100 crypto projects by type: 36 blockchains, 17 wallets, 16 developer tools, 11 Ethereum clients, 9 DeFi, 9 Bitcoin and Lightning, 2 AI](/media/fig-crypto-categories.jpg)

- **Blockchains (36):** Solana, Ethereum, Bitcoin, Zcash, Miden, Tempo and Cardano lead. Layer 2s Optimism, Base, Starknet, Arbitrum, Linea and Aztec all make it.
- **Wallets (17):** the surprise of this ranking. MetaMask, Ledger Live and Trezor are all top 6, and OneKey, Safe, Status, BitBox, Rabby and others follow. Wallets are where crypto meets users, and that is where the most code is going.
- **Developer tools, data and infra (16):** DefiLlama, Foundry, CCXT, Chainlink, Zama, viem and wagmi, Alloy and Hardhat.
- **Ethereum clients (11):** see below.
- **DeFi and trading (9):** CoW Protocol, Curve, Morpho, GMX, Rocket Pool, LI.FI, Euler, Freqtrade and Haveno.
- **Bitcoin and Lightning (9):** Bisq, LDK, Cashu, Core Lightning, Fedimint, LND, Breez, BTCPay Server and Stacks, on top of Bitcoin Core itself at #12.
- **AI (2):** ElizaOS and Bittensor.

## Ethereum's client army

![Ethereum clients in the top 100: Nethermind, Reth, Erigon, Besu, Lighthouse, Lodestar, Prysm, Nimbus, Teku and Grandine](/media/fig-crypto-eth.jpg)

Ethereum is built by many independent teams on purpose, so that a bug in one client cannot take the network down. Ten of them made the top 100 on their own: Nethermind (#9), Reth (#10), Erigon (#11), Besu (#25), Lighthouse (#50), Lodestar (#57), Prysm (#60), Nimbus (#63), Teku (#81) and Grandine (#86), plus ethPandaOps (#83), the team that tests every upgrade. Add Geth and the specs and Ethereum's core clients shipped more than 7,000 commits in 90 days.

## Big names, little public code

Market value and public code do not always match. Uniswap's public repos had 34 commits in 90 days because most of its app is now built in private. Aave (45), Pendle (13), The Graph (4), EigenLayer (1) and Zora (1) were also quiet in public, and Hyperliquid's core code is closed. Among older coins, Litecoin (20 commits), TRON (12) and Dogecoin (8) fall well outside the top 100. Low public activity does not mean a project has stopped working, but it does mean the community cannot see or help with the work.

## For scale: DeHub

DeHub is a social and streaming app, so it is not ranked here. But for scale, its public web and mobile apps took 5,525 commits in the same 90 days. On commits alone that would place it #3 of all 270 crypto projects we measured, behind only ElizaOS and Ledger Live. On DeHub, anyone can request a feature on [dehub.io/features](https://dehub.io/features) and watch it get built, which is the community-plus-AI model this article is about.

![For scale: DeHub 5,525 commits in 90 days, ElizaOS 17,062, Ledger Live 5,915, MetaMask 4,704](/media/fig-crypto-dehub.jpg)

> Disclosure: DeHub publishes this index. DeHub is not included in the ranking.

## Frequently asked questions

### What is the most active crypto project on GitHub in 2026?

ElizaOS, the open source AI agent framework, with 17,062 commits from 147 developers in the 90 days to 26 October 2026. DefiLlama is second and MetaMask third.

### What is the most active blockchain on GitHub?

Solana, at #5 overall, with 2,618 commits from 117 developers across its two validator clients, Agave and Firedancer. Ethereum is #7, but counting its ten independent clients it is the biggest ecosystem by far.

### Which crypto project has the most developers?

DefiLlama, with 512 people landing code in 90 days, most of them protocol teams adding their own data adapter. MetaMask is second with 163.

### Why does AI help crypto communities more than companies?

AI makes writing code cheap, so the limit becomes how many motivated people you have. Crypto networks give thousands of people ownership and a reason to build, and with AI each of them can now ship real code. About 1 in 6 commits in the top 100 already credit an AI assistant.

### Does GitHub activity predict a coin's price?

No. It shows who is building in public right now. Price depends on many other things, and some strong projects build in private or ship in big batches.

### How was GitHub activity measured?

We cloned each project's main public repositories and counted non-merge commits and unique human authors on the default branch between 28 July and 26 October 2026, with bots, AI-agent-only commits and upstream fork commits removed. Each project gets up to 50 points for commits and 50 for developers, on a log scale against the leader.

### Where can I see other rankings?

See our sister ranking, the [Top 50 Blockchain Projects 2026](/guides/top-50-blockchain-projects-2026). For social apps, see the [Top 50 Decentralized Social Apps 2026](/guides/top-50-decentralized-social-apps-2026), and for software beyond crypto, the [Top 50 Most Active Open Source Projects 2026](/guides/top-50-most-active-open-source-projects-2026).

## Sources

- [elizaOS/eliza](https://github.com/elizaOS/eliza)
- [DefiLlama/DefiLlama-Adapters](https://github.com/DefiLlama/DefiLlama-Adapters)
- [MetaMask/metamask-extension](https://github.com/MetaMask/metamask-extension) and [MetaMask/metamask-mobile](https://github.com/MetaMask/metamask-mobile)
- [LedgerHQ/ledger-live](https://github.com/LedgerHQ/ledger-live)
- [anza-xyz/agave](https://github.com/anza-xyz/agave) and [firedancer-io/firedancer](https://github.com/firedancer-io/firedancer)
- [trezor/trezor-suite](https://github.com/trezor/trezor-suite) and [trezor/trezor-firmware](https://github.com/trezor/trezor-firmware)
- [ethereum/go-ethereum](https://github.com/ethereum/go-ethereum)
- [foundry-rs/foundry](https://github.com/foundry-rs/foundry)
- [NethermindEth/nethermind](https://github.com/NethermindEth/nethermind)
- [paradigmxyz/reth](https://github.com/paradigmxyz/reth)

## Build with DeHub

Open [dehub.io](https://dehub.io) to watch, stream and post, or get the app on [Google Play](https://play.google.com/store/apps/details?id=io.dehub.mobile).`,
  bannerImage: '/media/top-100-crypto-projects-2026-banner.png',
  bannerImageAlt: 'Top 100 crypto projects 2026 ranked by GitHub activity, by DeHub',
  author: { name: 'DeHub Team' },
  publishedAt: '2026-10-26T23:30:00.000Z',
  tags: ['crypto', 'top 100', 'GitHub activity', 'crypto developers', 'AI', 'wallets', 'DeFi', 'Ethereum', 'Solana', 'Bitcoin', 'open source', 'DeHub'],
  readingTime: 15,
  featured: true,
  status: 'published',
};
