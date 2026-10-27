# Comment interaction audit — 27 October 2026

## Reported incident

The likely thread is `/post/6014?c=2229`, “Trance classics #009 by nickrookie”. Comment 2229, posted on 24 October, reads “Had this on repeat today while working, had to tip.” It belongs to maldoteth, remains visible in production, and has no replies. The post has comments enabled and no restricted reply policy. This identifies a likely match, not a confirmed reproduction of the reporter's failed attempt.

Production client logs for nickrookie contain no comment/reply failure in the preceding 30 days. His recent sessions include Android and web. Absence of a logged failure does not prove that a submission reached the server. His exact device, attempted reply format and failure stage remain unknown. No comment was published or account impersonated during this audit.

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

## Further evidence requiring diagnosis

The last seven days of production logs contain eight governance comment failures across two accounts, including `42501 / Authentication required`. These are a separate Supabase discussion flow. They are not evidence that nickrookie's API-backed post reply was rejected. The native preflight error feedback above does not repair those database refusals.

This audit covers post comments, nested replies, drafts, text/GIF/image/voice request contracts, reply policy, delivery state and related production error logs. It is not proof that every DeHub feature is free of user experience bugs. Merge, publication and production verification must be recorded separately; this file does not claim those steps have completed.
