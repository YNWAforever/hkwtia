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

## T06 新run（2026-10-03）

- T05 PR126已合併main c7257ed1；其Preview c4ed／dpl_D9eXE5esoTCf7ncQZ8ZBNCDXWjMn有17native checks pass，Google／magic-link／provider未驗。
- T06完整gate6490 pass355skip；隔離PG16 pass0skip；新Neon ledger57是13:59UTC套用0057的run，原ledger56 receipts仍有效於其歷史時間。
- T06分支Preview37個test配置及APP_URL、獨立service/cookie secret、exactAuth origin已配置；AI及effects closed，budget cap=0屬故意無效／停用配置，並非協會財務預設。候選部署／native receipt仍待寫入。
- 正式13:57UTC仍36eb／dpl9j，沒有0057 migration／新flags／provider請求。

## T07 新run（2026-10-03／04）

- T06 PR127 已於14:47UTC合併main973a0fec；exact head e4c72c64 的17 native Preview checks及5張screenshots已存入 evidence/t06。Google、magic-link、provider、scheduled worker windows仍未驗。
- T07 原有KB沿用，0058隔離Neon ledger57→58，profiles仍5932／reserved-domain外0／sentinel1；零provider request。Production未執行0057/0058。
- T07 focused207／實際PG31 pass0skip；完整gate及候選Preview正在進行，必須以最終receipt結案。
- 新Preview branch `codex/ai-knowledge-20261003`，獨立alias `hkwtia-ai-knowledge-20261003.vercel.app`；38個branch-scoped test配置及APP_URL已寫入，保留舊10個Auth origins並新增精確同源。管理僅合成資料；approval profile尚待從本次新same-origin實際session映射auth_user_id；不按相同email連結身份，不任選9個synthetic superadmin。
- 自动審批拒绝用較舊T06 storage state查本次reviewer；尚未執行被拒动作。使用当前T07 exact-source部署及全新同源官方CLI access／隔離DB正向marker再登入。browser cookie不作worker凭证。
- Production最後只讀15:45UTC仍36eb／dpl9j READY，release branch；新main merge不等於Production。


## T07 final refreshed evidence — 2026-10-04 01:58 HKT

- Exact source7c6b0844 local full6514pass386skip0fail; CI37137557588 green including worker57. Final typecheck/build/strings exit0 and lint0errors.
- Isolated Preview dpl_6XKCHM3VhF8bskXb7rb7g8Pa6gFT has17 baseline+12 knowledge native checks; fresh same-origin CLI protection access and positive owned DB marker preceded synthetic Neon password sign-in. Configured reviewer maps that fresh trusted auth user ID, with separate synthetic source owner.
- This supersedes earlier pending reviewer/native/local-gate notes. Source/approver policy, real embedding credential/spend/caps/invoice, Google/magic-link and worker windows remain unresolved task-specific gates. Production0057/0058 remains unapplied by this work.
