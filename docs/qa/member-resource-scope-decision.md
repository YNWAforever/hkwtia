# T-MP08 — member resources scope decision

Status: decision prepared; product selection and end-to-end acceptance outstanding. Neither option has been selected on behalf of WTIA. Original UC-MP59 remains untested, not passed.

## Verified implementation evidence

- `lib/portal/content.ts`: the default `documents.listApproved` adapter returns an empty array. There is no registered resource source behind that interface.
- `lib/db/repos/media.ts`, `lib/media/image-upload.ts`: reusable staff/member image ownership, validated image types, object metadata, checksums and audit records. Upload/delivery accepts PNG, JPEG and WebP; this is not a general document ingestion contract.
- `app/api/media/[id]/route.ts`, `lib/media/media-delivery-route.ts`: the bucket is private, but the application image delivery endpoint is anonymous and uses **public CDN caching for 300 seconds**. An object's private bucket location does not make its download member-only. Do not use this endpoint for confidential member documents.
- `media.ts`: archive checks and reference checks exist. They are not a draft/published/withdrawn/versioned member-resource lifecycle. Existing publicly cached images may remain readable for five minutes after archive, as explicitly recorded in that feature.
- `lib/db/repos/posts.ts`, `admin-posts.ts`, `public-posts.ts`: publication authoring patterns are reusable, but public posts do not grant access to private document bytes.
- `lib/portal/billing-summary.ts`, `lib/billing/checkout-service.ts`, `receipt-service.ts`: own billing uses billing ownership authorization independently of the paid-benefit gate. Existing expired/cancelled subscriptions can still reach eligible provider billing history; a regular company seat does not become the billing owner.

## Reviewable alternatives

| | A — member resource library | B — billing only in this phase |
|---|---|---|
| Member experience | Published, currently valid resources plus separate own-billing access | Clear statement that member resources are not yet provided; prominent own-billing link |
| Data contract | Resource ID; bilingual title/description; immutable file version/checksum; private object key; draft/published/withdrawn state; effective/expiry times; publisher and audit | No resource rows or fabricated examples; preserve historical billing records and receipt authorization |
| Staff workflow | Upload validated document → preview → publish → withdraw; explicit replacement creates a new version | No new staff resource workflow promised |
| Download | New actor-resolving protected route; recheck current membership, current grant/seat, publication and expiry on every request; `Cache-Control: private, no-store`; bounded streaming with safe content disposition | Existing authorized billing flow only; never reuse anonymous image delivery for private files |
| Migration | Additive resource/version/audit relationships; review next migration number against main at implementation | None required for scope copy |
| Acceptance | Draft unavailable; publish visible; withdrawal/expiry rejects old URL; expired member denied resource but retains own billing; cross-member billing denied; actual staff→member round trip | Both languages explain scope accurately; billing login destination preserved; actual expired/cancelled billing authorization verified |
| Limit | Already downloaded copies cannot be recalled; upload limits/types and retention need owner agreement | UC-MP59 remains untested or formally rescoped, never converted to pass |

## Decision record to complete

Required fields: selected option; product owner; decision reference/date; eligible document types and audience; initial content owner; acceptance owner; release target. If A is selected, approve the document size/type/retention limits and version/withdrawal semantics before adding a schema. The current branch preserves existing resource and independent billing behavior and adds no resource claims.

For either option, test identities and an isolated provider/DB environment are required for actual billing/resource acceptance. Mocked rendering is not that acceptance.
