# Provider costs from April 2026

The public finance endpoint stops its historical operations estimate on
2026-04-01. Earlier days retain the existing estimate; later days contain
recorded usage and configured subscriptions only. Both web and mobile read
https://dehub.io/api/finance-stats.

DigitalOcean invoices and month-to-date usage, metered generation and text
usage, payment fees and the existing fixed subscription bills remain included.
Metered text usage is valued at the model's configured list price; generation
costs are reconstructed from the recorded price and markup. These are usage
records, not a complete reconciliation to every provider invoice.

Cloudflare billing uses its documented account billing history endpoint:
https://developers.cloudflare.com/api/resources/billing/subresources/history/methods/list/

Configure a Worker secret named `CLOUDFLARE_BILLING_READ_TOKEN` with Billing Read
access to the account in `CLOUDFLARE_BILLING_ACCOUNT_ID`. Never use the production
deployment token for this binding. Charges are booked on their billing date,
refunds and credits reduce them, and payment settlements are excluded to avoid
double counting. Only USD records are supported. A failed, unpriced or incomplete
read marks the source unavailable and excludes its totals. No invoice identifiers,
payment details or billing credentials enter the public response.

The source covers the configured Cloudflare account, including Workers, R2,
Images and Stream charges. It does not infer daily usage costs from request counts
or spread invoices over an assumed billing period. Unbilled usage appears after
the provider reports charges. The endpoint and both clients refresh on a
five-minute cadence; provider reporting delays still apply.

An unavailable source is missing from the total, not free. Other unconnected
provider bills, including Lovable Cloud runtime usage, remain outside this feed.
Do not describe the total as a complete company expense ledger until those
sources are connected and reconciled.
