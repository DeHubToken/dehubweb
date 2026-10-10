# Maboroshi

Video subject replacement for DeHub Creator at `/creator/maboroshi`. The web
page and native app share the same hosted interface and private job store.

Adapted from [Genjustsu Open Source Workflow](https://github.com/sirioberati/Genjustsu-Open-Source-Workflow)
at `40fd6615c2b7d940d4d7060e82de522292eefe99`. The upstream MIT notice is retained
in `LICENSE`; see `THIRD-PARTY.md` for dependencies. Processing modules retain
depth/SAM, face mesh, combined preparation, image/video references, draft-first
Seedance submission, an explicit 1080p approval and complete source audio.

## Hosted operation

Run one process on the existing backend host, behind the checked-in nginx
location, using `dehub-maboroshi.service`. It binds to loopback, is capped at
one CPU and 3 GB RAM, and stores private jobs in `/var/lib/dehub-maboroshi`.
The durable SQLite ledger owns every job by the wallet returned from DeHub's
session verification endpoint. Client wallet headers are never authority.

Install requirements into `/srv/dehub-maboroshi/venv` using Python 3.12, and
install `rubberband-cli`. Use a separate Python 3.12 mesh environment with
`mediapipe==0.10.21`, `av==17.0.0`, `numpy<2`, and Pillow. Set
`MABOROSHI_MESH_PYTHON` to its interpreter. Pre-download Google's official
Face Landmarker model to the release's `models/face_landmarker.task`; releases
are read-only to the service user. No weights or processing run on clients.

The root-owned `/etc/dehub-maboroshi.env` needs these variables:

- `MABOROSHI_MEDIA_SECRET`: random secret of at least 32 characters.
- `INTERNAL_SERVICE_SECRET`: existing backend credit-service credential.
- `MABOROSHI_PREPARE_MICROS`: price per preparation, in USD millionths.
- `MABOROSHI_DRAFT_MICROS_PER_SECOND`: price per billable draft second.
- `MABOROSHI_HD_MICROS_PER_SECOND`: price per billable final second.
- `MABOROSHI_MESH_PYTHON`: isolated mesh interpreter.

Initial retail tariffs are $1 per preparation, $0.50 per billable draft second
and $1 per billable final second. These are DeHub retail prices, not claims
about provider costs. Billable seconds include the source (minimum four
seconds) and any video identity reference, rounded up. Every stage requires
the displayed quote to match the server's current quote before credit debit.
Review actual provider costs before changing these configurable prices.

Connect `REPLICATE_API_TOKEN` and `ENHANCOR_API_KEY` through environment secrets
or the one-use `/maboroshi/setup#TOKEN` form. To provision that form, create a
random `MABOROSHI_SETUP_TOKEN` and a short Unix-time `MABOROSHI_SETUP_EXPIRES`.
The browser strips the fragment immediately, submits it only in a header,
and stores the keys in a mode-0600 server file. The setup capability is consumed
after one successful submission. No credentials go into the repository or apps.

The service refuses processing until provider keys, media signing and pricing
are configured. Its unauthenticated health endpoint reports configuration
readiness only; it does not claim a paid render has been verified.

## Recovery and privacy

Ten source uploads per wallet per day; up to four pending jobs, with one
processing at a time. Uploads are capped at 100 MB per file and 30 seconds.
Media stays on DeHub, with expiring signed links for previews and provider
inputs. The temporary public upload hosts in the upstream package are removed.
Replicate and Enhancor receive the media required to process the requested job.

Payments have an idempotent key per job and stage. Completed submissions are
collected on restart using their saved provider IDs; paid preparation is never
automatically repeated. A submission marker is written before calling the
provider. An uncertain submission or collection failure becomes `attention`,
preserving payment and provider records for reconciliation. Failures before a
generation submission request a keyed credit refund; failed refunds remain
explicitly visible. Never reset an attention job for a blind retry.

Job media remains private and durable on the host. Include the data directory
in the existing server backup and account-erasure procedure before broad rollout.
This service currently provides its own project list; outputs can be downloaded
and uploaded into the editor. They are not silently inserted into the separate
Creator generation library. iOS respects the existing purchase flag and only
offers saved-project viewing and downloads.

## Verification

The Maboroshi GitHub workflow runs source audio packet preservation, composite
alignment, review invalidation, signed-file isolation, account ownership,
duplicate payment/submission protection, and the hosted endpoints with synthetic
fixtures. It performs no paid inference. Verify a real complete preparation,
draft and approved HD export on production after connecting funded providers.
