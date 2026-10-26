# Chartopia trading audit — 25 October 2026

Chartopia's browser game is also the engine loaded by the native mobile WebView. Its real-money chain configuration is Base (8453), Robinhood Chain (4663), and Solana. Market data on other chains does not imply trading support. The weekly competition is separate paper trading.

## Corrected defects

- Robinhood v4 pool discovery requested logs from genesis. The live node rejected the 97.9-million-block range with a 10-million-block maximum. Discovery now searches bounded, contiguous windows and caches keys by chain and pool.
- Failed or unconfirmed EVM approvals could be followed by a swap attempt. Both connected-wallet and DeHub-account paths now require successful approval receipts.
- Cached network IDs could bypass a required switch; adding a network did not explicitly switch to it. Read the provider's actual chain, explicitly switch after adding, and check account/network again before submission.
- Account changes during quotes, simulation, approval, or Solana transaction construction could change the signer. Bind execution to the reviewed wallet and reject changed identities.
- Editing the ticket during a slow quote could arm the old quote against the new screen. Discard results when the ticket or wallet revision changes.
- Tiny amounts formatted by JavaScript as scientific notation failed conversion. Convert them to base units without floating-point multiplication; reject sub-unit and invalid amounts.
- Zero-decimal tokens were treated as 18-decimal tokens. Preserve zero decimals in holdings and formatting.
- Holdings disappeared from the sell interface when market pricing was unavailable or liquidity fell below $1,000. Keep balances visible, with zero valuation when unpriced.
- The v3 quote search omitted the 0.01% fee tier. Include all four standard tiers.
- Buy reviews omitted readable minimum output amounts. Resolve token decimals and display the quoted floor with the token symbol. Reject a zero minimum.
- The Solana endpoint used the retiring `lite-api.jup.ag` hostname. Use `api.jup.ag`, bound requests, and reject reported simulation errors.
- Saved pending transactions could remain SENT after a mobile reload. Reconcile up to ten saved pending/unknown hashes once per load without resubmitting them.
- Native Android focus loss can happen without an AppState change. The companion mobile change locks the vault on Android blur and navigation blur.

## Verification evidence

Read-only production endpoint checks on 25 October 2026:

| Path | Result |
| --- | --- |
| Base RPC | HTTP 200; chain ID `0x2105`; production-origin CORS accepted |
| Robinhood RPC | HTTP 200; chain ID `0x1237`; CORS accepted |
| Solana RPC | HTTP 200; `getHealth` returned `ok`; CORS accepted |
| Jupiter current API | Keyless SOL → USDC quote returned positive output and minimum output; production-origin CORS accepted |
| Base v3 | WETH → USDC quotes returned positive outputs at fees 100, 500, 3000 and 10000 |
| Robinhood v4 | Paginated Initialize lookup recovered GIGATENEV's native-ETH pool; buy and reverse sell quotes both returned positive outputs |

The production arcade page loaded, displayed live markets, and exposed the trading-wallet and trade-ticket controls. These observations do not prove signed transaction execution. No funded transactions were submitted, and physical-device interaction was not verified in this audit.

Regression coverage exercises numeric conversion, zero-decimal formatting, failed and timed-out approvals, successful simulation/submission ordering, changed wallets, wrong networks, network addition/switching, Solana wallet changes, stale quote rejection, and bounded pool discovery. GitHub CI is the execution record for tests and TypeScript checks; a passing source test is distinct from production publication.

## Remaining limitations and improvement priorities

1. **Broader Base routing.** Base v4-only pools still lack pool-key discovery; v3 fallback cannot serve every token. Add indexed pool discovery and a supported multi-hop route source. Robinhood pools quoted in tokens other than native ETH also need multi-hop routing rather than a direct gas-token assumption.
2. **Mobile account-wallet parity.** Mobile currently provides the local trading-wallet flow; the web host's sponsored account-wallet trading bridge is not implemented by the native game host. Add an explicit native review/signing bridge with the same chain/account validation before presenting account trading as available there.
3. **Transaction recovery UI.** Persist approval hashes and every submission stage before waiting. Add a visible Check status action and distinguish RPC outage, pending transaction, reverted transaction, and expired Solana blockhash. A reload currently reconciles a bounded set of saved swap hashes only.
4. **Better preflight information.** Show estimated network fees, available gas, routing limitations, and price impact for EVM trades as well as Solana. Offer a Max amount that reserves gas. Avoid implying that liquidity/age checks establish token safety.
5. **Wallet clarity.** Show signing address and network beside the confirmation button; add wallet choice when several browser wallets announce themselves. Keep paper practice and funded trading visually distinct.
6. **Portfolio completeness.** EVM holdings discovery is limited to watched tokens and prior fills, capped at forty tokens per chain. Add indexed holdings discovery and a clear partial-data indicator when a chain read fails; do not silently interpret failed reads as an empty portfolio.
7. **Funded acceptance matrix.** Verify small buys and sells on each supported route, approval rejection, account/network switching, insufficient gas, slippage rejection, background/resume, and pending-status recovery on desktop, iOS and Android. This remains necessary before claiming end-to-end trading reliability on every supported chain.

References: [Robinhood network documentation](https://docs.robinhood.com/chain/connecting/), [Jupiter API setup](https://developers.jup.ag/docs/portal/setup), [Jupiter developer announcements](https://t.me/s/jup_dev).
