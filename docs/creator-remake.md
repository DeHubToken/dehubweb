# Remake

Open `/creator/remake` on production or in the native application. Both clients
use the existing private hosted Maboroshi service, session verification, media
signatures and per-stage payment ledger. No new provider credentials or database
migration are required.

Upload a 3–15 second MP4/MOV with audio, at least 720 pixels per side. Save one
or two character/product images and the replacement direction, then review the
original. Detect its cuts or enter up to seven cut times manually. Saving the
plan creates at most eight independent Kling jobs without starting generation.
Each shot has its own server quote and payment confirmation. The quoted duration
includes the provider's three-second minimum and frame-rate rounding. Short shots
hold their final reference frame to reach that minimum; the generated padding is
removed before assembly.

Each completed shot can have up to five versions. A revision copies only that
shot's input and references; the previous completed result stays available.
Uncertain submissions cannot be regenerated. A confirmed saved provider request
can be collected without another payment or submission. A failed pre-submission
job requires a confirmed keyed refund before creating its replacement.

Assembly uses the selected completed shots in source frame order, then remuxes
the original compressed audio packets unchanged. It runs in the existing bounded
hosted processing queue and has no additional generation charge. The parent and
shot manifests survive restarts. An interrupted plan resumes its saved cut list;
an interrupted assembly can resume without repeating inference. Inputs, outputs,
payment records and revision history stay private to the verified wallet.

This release recreates footage shot by shot. Automatic cut detection is heuristic;
creators can correct it before planning. The model can change motion, fine product
details and text. It does not extract editable typography or promise exact visual
equivalence. Results download from the hosted project; automatic insertion into
the separate timeline/library is not part of this release. iOS retains the existing
storefront purchase restrictions.

The Maboroshi CI workflow tests actual encoded cuts, short-shot padding, frame
counts, original audio packets, ownership, isolated revisions, interrupted plans
and submission/payment recovery. Deploy the exact merged `services/maboroshi`
release to the existing backend host, then deploy web and publish the mobile
JavaScript update. The existing provider bridge is unchanged.
