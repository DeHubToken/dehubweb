# Feature board: 9 October 2026

Source: https://dehub.io/features. The board has five requests, two Shipping items and 196 Shipped items. This inventory includes bugs reported under New Feature and follow-up comments. Production is the verification target for web; mobile changes require the matching native implementation, cloud CI and OTA publication.

## Shipping

### Ad-Supported Creator Tipping

Request: `6ee38412-5013-4288-aa0d-03f07a4dea1b`.

- Web PR 2185 and mobile PR 1567 are merged. The tip drawer offers advertiser-funded video support. Campaigns must explicitly opt in and supply an approved video lasting at least 30 seconds.
- Production has the watch-session table and billing function. The deployed `ads-creator-support` route responds correctly to an unsupported method.
- The existing rollback-only SQL suite passed against production on 9 October: wrong-wallet access, instant seeking, unfinished playback, completed billing, creator attribution, duplicate retries, empty budgets and expiration. Every fixture and billing entry was rolled back.
- There are no active sponsor campaigns and no recorded support sessions. The feature must show its empty-inventory state. Do not create paid campaigns or fake revenue for verification.
- The implementation credits USD ad revenue, with token settlement pending. It does not promise 100 DHB per view. This limit is already disclosed in the merged implementation.
- Remaining release evidence: verify the production tip drawer and no-inventory response, confirm mobile publication contains PR 1567, and reconcile the missing `20261004093000` migration-ledger entry against the installed schema before closing the card. Actual sponsor playback and token settlement remain unverified without an eligible campaign and a settlement route.

### Bridge

Request: `c29db5ba-c014-4960-8ef6-f8bbb2f621ba`.

- The report concerns a 38,009-token BNB deposit, not a missing transaction on the source chain. The public relay history contains transaction `0x82fea315f4216e223204af7e7451b4348e23b909484fd38dbead28a631266081`.
- Both clients still send to the manual relay. The web queue correctly calls the deposit Received; it does not prove destination payment. Web PR 2144 already removed the instant-payout promise. Current copy says usually 1–5 business days.
- The follow-up says an automated replacement is planned. No automated bridge implementation was found in the current web or mobile main branches. Its location and deployment must be established before switching routes.
- This change corrects a related display defect: the mobile wallet parsed the API's `38,009` as NaN and displayed zero. Both clients now format the same API representation and show unavailable values as a dash instead of zero.
- Remaining: verify the destination-chain payout or prepare the outstanding manual payout for its authorized signer; then verify the automated implementation and its deployment separately. Do not mark the report shipped based only on a source-chain receipt or a formatting fix.

## Requests, in fix order

| Priority | Request | Diagnosis and implementation plan | Acceptance |
| --- | --- | --- | --- |
| 1 | Bounty payment fails after expiry (`d2a36483-f822-40b9-a429-91dc56c7a239`) | The screenshot shows a reserved payment, and production has a signing intent with no hash for bounty 5. `work_claim_payment` already permits expired bounties. Web PR 2304 fixed release after preparation failures; check its mobile counterpart and publication. Keep ambiguous reservations until the payer confirms no transaction was broadcast. Make the recovery action explicit on web/mobile and show the original preparation error. | The payer can recover an existing hash or release a rejected, unbroadcast signature; expired approved work remains payable; retries never send twice. No payment or reservation was changed during this audit. |
| 2 | Communities (`89816781-2b0b-42b8-9a8e-2341dbecb766`) | The reporter confirmed finding chat and posting. Follow-ups report duplicate post metrics when sharing a link, a request to invite followers, and account creation failing. Separate these cases. Reuse the original post through the community share/repost path, keep its original engagement, and expose the action in both clients. Investigate registration separately: `dehub-mcp` creates a fresh wallet then calls ordinary wallet signup; the API applies an on-chain-history gate. Implement verified-owner registration without weakening the public signup gate or per-owner limits. | Existing-post community shares retain the original post identity and metrics. Chat remains discoverable. Registration succeeds for an authenticated eligible owner and rejects spoofed ownership. Bulk follower invitations require a bounded, opt-in flow. |
| 3 | Make Feedback More Discoverable (`b6b28de6-a560-4c66-9c69-5baaf8916363`) | Reuse the existing feedback form from a visible navigation entry near Requests/Settings on web and mobile. Add a lightweight feedback action to converter and migration completion screens, preserving optional anonymity and promotional-consent choices. | Every entry opens the same form; completed-tool context is prefilled; no unsolicited modal or changed consent defaults. |
| 4 | Sub-Referral Tracking for Affiliate Links (`91043fb0-041f-4dbb-a678-0ed05212eec3`) | Add a bounded optional `sub` identifier across redirect, signup attribution and affiliate reporting. Keep the parent affiliate's ownership and reward attribution unchanged. Add a versioned backend migration and matching web/mobile dashboard filters. | Two identifiers under one affiliate remain separately reportable without changing attribution; missing/invalid identifiers fall back safely; private referral data remains owner-only. |
| 5 | Autonomous creator (`40f5a38b-812d-4493-8b6e-64a3530fa955`) | This is a new capability, not a launch bug. First fix account creation above. Define supported tasks, explicit funding limits, pause/revoke controls, transaction authorization and outcome history before enabling autonomous funded execution. Start with a preview of intended actions. | A single prompt produces an inspectable plan; actions respect permitted scope, funding limits and revocation on both clients. No guarantee of revenue. |

## Release discipline

Each code change ships through a PR with GitHub-hosted checks. Refresh the base before merging, publish the merged revision and verify production. Board status should describe the observed user outcome; merged code, an empty-inventory state and completed financial settlement are different facts.
