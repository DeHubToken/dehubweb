# Comment interaction audit — 27 October 2026

## Reported incident

The confirmed thread is `/post/6014?c=2229`, “Trance classics #009 by nickrookie”. Comment 2229, posted on 24 October, reads “Had this on repeat today while working, had to tip.” Nickrookie successfully replied at 19:53 UTC on 27 October, before the first audit fixes deployed. The post has comments enabled and no restricted reply policy.

Production client logs for nickrookie contain no comment/reply failure in the preceding 30 days. His screenshot identifies the speech-bubble Reply button beneath maldoteth's comment: tapping it appeared ineffective, while the post-level Comment button worked. His exact platform remains unknown. No comment was published during this audit.

The web and Android fixes in PRs #3361 and #2525 published successfully. Production desktop verification confirmed that the comment-level Reply button opens the correct target, focuses the composer, and preserves an existing draft. On a physical Samsung SM-S926B running native version 1.18.6/build 90, an ADB-driven tap on that same comment's Reply button displayed “Replying to mal”, focused the reply field, and reported `mInputShown=true`. The empty reply was cancelled after the check.

The same physical phone also passed in Samsung Internet on production: tapping the comment's speech bubble directly displayed “Replying to @maldoteth”, placed the caret after the mention, and opened the Android keyboard (`mInputShown=true`). No post-level Comment-button workaround was needed. The unsent mention was cleared after verification.

## Confirmed defects addressed

| Surface | Trigger and failure | Correction |
| --- | --- | --- |
| Web | Type a draft, then press Reply on a comment. The entire draft becomes `@username `. Reproduced on production. | Preserve existing text when changing the reply target. |
| Mobile web | Reply reveals a hidden composer but focuses it from a timer, outside the original gesture. | Reveal synchronously and focus during the tap, matching the existing post Comment control. Real phone keyboard verification remains required. |
| Web | A GIF response is `{ result: true, commentId }`; the client returns only `true`. The optimistic row cannot reconcile its ID if refresh is delayed or fails. | Preserve the response and its accepted ID. |
| Native mobile | The voice-comment endpoint returns HTTP 200 with `result: false`. The client treats it as delivered and clears the attachment. | Throw the refusal so delivery keeps the recording and reports the reason. |
| Native mobile | Long-press a nested reply on the post detail screen. Reply is missing although the server and ordinary row tap support it. | Offer Reply at every depth, consistent with the comments drawer. |
| Native mobile | Session refresh fails before a protected action starts. Only a log is emitted, so tapping Post appears ineffective. | Display the failure; also await asynchronous actions so their rejections reach the handler. |

Regression coverage exercises accepted GIF/voice IDs, parent IDs and HTTP-200 refusals. TypeScript and test execution run in hosted CI. Changes span dehubweb and dehub-mobile; the shared API's policy enforcement is unchanged.

## Governance authentication follow-up

The last seven days of production logs contain eight governance comment failures across two accounts, including `42501 / Authentication required`. These are a separate Supabase discussion flow, not evidence that nickrookie's API-backed post reply was rejected.

A rollback-only production test reproduced the refusal with a valid signed wallet session. RLS authenticated that session, but the badge trigger separately required an API JWT. Older clients omit that redundant header, and the two credentials have different lifetimes. The new migration verifies the signed session directly, retains wallet ownership and the existing live badge/banned-account checks, and removes the second token requirement. Both clients now use their shared signed-session fetch for governance writes. SQL regression coverage checks root comments, replies, edits, a stale redundant JWT, forged/expired/missing sessions, author mismatch, and badge refusal. Publication of this follow-up remains separate from its test results.

This audit covers post comments, nested replies, drafts, text/GIF/image/voice request contracts, reply policy, delivery state and related production error logs. It is not proof that every DeHub feature is free of user experience bugs. Merge, publication and production verification must be recorded separately; this file does not claim those steps have completed.
