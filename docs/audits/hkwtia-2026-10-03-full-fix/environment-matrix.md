# Environment and capability matrix

| Target | Positive evidence | Capability / gate | Owner |
|---|---|---|---|
| Native unit/build | Windows, locked npm ci exit0, baseline36eb | Full gates running; no provider calls | Engineering |
| Isolated DB/Auth | Neon br-lingering-unit; nonprimary/default/protected; sentinel1; ledger56; 5932 reserved test-domain profiles, zero outside; expiry Oct4 12:00UTC | Existing local credentials only; recheck before effects; same Auth host as isolated branch | Platform |
| Stripe TEST | Dedicated STRIPE_TEST variables previously authorized; recheck livemode before new effects | TEST only, live keys and payments excluded | Finance/platform |
| Preview | Prior stable acceptance alias served a1ab933 Git deployment and owned marker; historical only | New branch Preview must prove runtime DB via new owned marker; default Preview DB is not isolated | Platform |
| Production | Same audit36eb/dpl9j readback, READY | Metadata only; no new secrets export, migrations, flags or release performed | Release owner |
| Worker | Existing17-job health registry/schema0052 | Cloud service identity, binding, version, two real windows not yet proven; unknown is not zero/failure | Platform |
| Sender | Local sink only for contract verification | Real provider receipt needs approved test recipient/provider access; no real-member sends | Communications |
| AI provider | Existing approved architecture retained | Explicit approved model/data policy/cost cap receipt required for live eval; Go admin adapter off | Data/service owner |
| Policy | D01-D06 original owners/wording preserved | No newly approved policy version; blocks only corresponding activation | Association owners |

Flags remain per-capability. RUN_LIVE_WOZTELL=0 selects a mock; it is not a real sender pause. Browser protection credentials never serve as worker identity. No complete Production env export.
