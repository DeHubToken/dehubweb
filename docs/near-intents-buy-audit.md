# NEAR Intents buy audit — 17 September 2026

## Payment path and timing

### Revised product flow

The only customer-facing choice is **Pay with crypto**. Base ETH is selected
by default. Configured native coins and supported ERC20 contracts on Base,
Ethereum, BNB Chain and Polygon go directly to the dpay treasury. Routing is
based on network and contract identity. Base USDC is included in this direct
catalogue. Other supported assets use the swap route automatically, without
provider branding or a routing selector. The separate ETH/USDC card-purchase
panel has been removed from web and mobile.

Direct payments use a wallet confirmation. Regular wallets send native funds
directly. Smart wallets wrap native funds and transfer the wrapper atomically,
so a verified ERC20 transfer receipt proves treasury receipt without a tracing
service. ERC20 payments are verified against the configured contract, payer,
recipient and actual received amount. Chain-specific receipt keys prevent
duplicate credit while allowing different buyers in one bundler transaction.
Submitted transaction hashes are saved for recovery and reconciled server-side.
Direct transfer avoids the swap, but still requires chain confirmation and DHB
delivery; the UI does not promise instant finality.

### Other supported assets

The buyer sends the exact token amount on the selected origin network to the
1Click deposit address, including its memo/tag when supplied. 1Click confirms
the deposit, executes the swap, and settles USDC on Base to the dpay treasury.
The dpay monitor then queues DHB delivery and an ETH gas transfer to the buyer's
Base wallet. This purchase path depends on dpay for DHB delivery.

Live dry quotes for 50,000 DHB returned swap estimates of 22 seconds for SOL,
47 seconds for ETH, 129 seconds for DOGE/LTC and 807 seconds for BTC. These are
observations, not promises. The provider defines its estimate as execution
after deposit confirmation. Source-network confirmation and dpay delivery add
time. The UI rounds up to minutes and does not present a completion countdown.

Provider schema: https://1click.chaindefuser.com/docs/v0/openapi.yaml

## Findings addressed

- Load the provider's asset catalogue instead of a short handpicked list.
  Network and contract distinguish assets with the same ticker. Provider
  availability and route liquidity still determine which quotes succeed.
- Persist origin amounts, networks, memos, timing and refund/delivery addresses
  with the purchase. Authenticated history restores receipts across devices.
- Bind dry quotes to account, asset, amount and refund address; discard stale
  responses and expire displayed quotes after 60 seconds.
- Prevent duplicate clicks, use account-scoped idempotency keys for retries,
  and reload receipts after an uncertain creation response.
- Scope purchase lookup to its owner. Pass memo/tag to provider status requests
  and distinguish shared-address sessions by memo.
- Show confirmation, swap, DHB delivery and gas delivery separately. Failed
  swaps are not described as refunded unless the provider says REFUNDED.
- Stop inviting payment after the deposit deadline; keep following known
  deposits beyond it. Unpaid expired rows remain recoverable for seven days.
- Pause client polling when hidden/unfocused. Retry status without telling
  buyers to pay again. Poll sequentially with slower intervals for slow assets.
- Show estimated net DHB after the settlement gas reserve; apply badge pricing
  consistently to dry and executable quotes. Hide the card price summary on
  the crypto tab.
- Keep copy errors, missing receipt data, history errors and status failures
  visible. Block another payment while purchase recovery is unavailable.

## Verification and limits

Web: TypeScript passed; 12 targeted lifecycle and request-race tests passed.
Mobile: nine matching lifecycle tests and localization gates passed.
Backend: TypeScript and six account-isolation, memo, settlement and pricing
tests passed. CI additionally runs repository-wide gates.

No funded purchase or refund was performed during this audit. Dry quotes and
mocked regression tests do not prove treasury delivery on the live chain.
Staging UI, backend deployment and mobile publication are separate release
checks; a merged PR alone does not prove them.

Base USDC uses the direct route. The swap catalogue does not promise every
token on every supported chain; liquidity and provider support still apply.
New interface strings currently use English fallback values in locale files;
this is coverage, not completed translation.

Network congestion, withdrawal delays, provider liquidity and dpay treasury
availability can extend completion. The existing dpay transfer retry process
runs every five minutes and has a finite retry count. A delivery that exhausts
retries needs operational recovery; the receipt remains visible and does not
ask the buyer to repay. The seven-day unpaid-deposit recovery window is finite.
