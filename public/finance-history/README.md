# Marketplace history

The production shop wallet is `0x2226ab7ff45d9a241e8986163ffb0176fabf5613`.
The checkout at `0xe0263cdb7ed38580a4cd857eda8c73f11d83598b` returns that
address from `shopWallet()` on BNB Chain.

The audit covered all fetched branches and history of `DeHubToken/dehub-nx`
(main `3b5630885545430cc6f91026bd43bd28f0fa757e`) and the checkout contract
repository (main `a73a8d733c763bd1bfafd4cea25ef195ef923adc`). The production
wallet entered the checkout configuration in commit
`ff732fff382d4f3931b8fe77f6c600fbf292ae30`, on 7 July 2022.

Successful incoming recognised-currency transactions were checked for the
checkout's `Purchased` event. There were 685 checkout transactions, including
one shop-wallet purchase of its own inventory. That internal purchase is a
wallet movement, not fresh revenue. The 684 external sales span 7 July 2022
through 23 October 2024 and total $181,396.67 under the valuation below.
No additional Purchased events appeared outside the known purchase methods.

`marketplace.json` also retains 1,717 successful recognised-currency wallet
movements, each marked `counted: false`. Token names were not trusted: only
the actual BUSD, USDT, original DeHub and current DHB contracts were accepted,
along with native BNB. Failed transactions and spoof tokens were excluded.
Log/trace identities preserve distinct transfers in the same transaction.
Neither incoming transfers nor outgoing movements imply sales or refunds.

BUSD and USDT receipts use $1 face value. Native BNB movements use Binance's
BNBUSDT close for their UTC date. The two original DeHub purchases use the
DeHub/WBNB pool reserves at their purchase blocks and that date's BNB close.
Other DeHub/DHB movements retain original amounts with `priced: false`;
their USD value is unavailable. Every line links to its transaction.

Marketing and developer wages are a combined, owner-reported reinvestment
allocation, spread by month after recorded costs. They are not separately
verified invoice totals. Actual holder/staker rewards remain in the rewards
ledger and are not subtracted again from retained operating revenue.
