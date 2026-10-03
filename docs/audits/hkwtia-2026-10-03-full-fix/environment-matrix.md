# Environment and capability matrix

| Target | Positive evidence | Capability / gate | Owner |
|---|---|---|---|
| Native unit/build | Windows, locked npm ci exit0, baseline36eb | T05 full6464 pass339 skip; lint/types/strings/build exit0; skips retain environment reasons | Engineering |
| Isolated DB/Auth | Neon br-lingering-unit; nonprimary/default/protected; sentinel1; ledger56; 5932 reserved test-domain profiles, zero outside; expiry Oct4 12:00UTC | Existing local credentials only; recheck before effects; same Auth host as isolated branch | Platform |
| Stripe TEST | Dedicated STRIPE_TEST variables previously authorized; recheck livemode before new effects | TEST only, live keys and payments excluded | Finance/platform |
| Preview | New full-fix alias -> dpl6L/a601 READY; test-only branch env added; isolated Auth origin registered; anonymous browser redirected to Vercel protection | 17 native checks PASS on a601: owned marker proves runtime DB; real synthetic Neon password staff/superadmin login and member denial; private headers; bilingual/mobile. Fresh official CLI same-origin access; Google/magic-link not verified. | Platform |
| Production | Post-merge readback 2026-10-03 12:04UTC remains36eb/dpl9j READY; PR125 merged main4867d50e; configured Production Git branch release | Metadata only; no new secrets export, migrations, flags or release performed | Release owner |
| Worker | Existing17-job health registry/schema0052 | Cloud service identity, binding, version, two real windows not yet proven; unknown is not zero/failure | Platform |
| Sender | Local sink only for contract verification | Real provider receipt needs approved test recipient/provider access; no real-member sends | Communications |
| AI provider | Existing approved architecture retained | Explicit approved model/data policy/cost cap receipt required for live eval; Go admin adapter off | Data/service owner |
| Policy | D01-D06 original owners/wording preserved | No newly approved policy version; blocks only corresponding activation | Association owners |

Flags remain per-capability. RUN_LIVE_WOZTELL=0 selects a mock; it is not a real sender pause. Browser protection credentials never serve as worker identity. No complete Production env export.
