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

- T07 refreshed02:21HKT: sourcea49e6629/dpl_3roUp1uVnxwpNQehBSvqCHVhxToW has29native and fresh fullCI6520pass386skip0fail/worker57, all repository gates successful. Shared public HTTPS policy now guards source inputs; public query URLs retained. Source/approver/provider/Production gates unchanged.

## T08 isolated review candidate

- Source `b5e93ce985d529560847b340b873d2eaf404a454` in three focused commits; main base4904e287 (PR128 merged).
- Fresh nonprimary/default/protected isolated branch proof; expires2026-10-04T12:00Z. Exact DB/Auth hosts, synthetic sentinel1/outside reserved-domain profiles0; additive0059 ledger58→59, profiles5932 unchanged, provider0.
- `ADMIN_AI_DRAFTS_ENABLED` defaultfalse; only confirmed isolated Preview may settrue. AI caps0/agentsfalse/live sendingclosed. Source review and approve do not send.
- Final focused89 inclactual PG30 passed0skip; exact-source full CI/native pending. Actual model/Google/magic-link/cloud-worker/provider receipts remain blocked individually.
- No Production0057/58/59 or new capabilities released. Production revision must be reread before any specific release approval.


## T09 application case candidate — 2026-10-04

- PR129 merged main `abad08d4`; source/tree equivalence and final T08 CI/native receipts in evidence/t08/merge.json. Old pending notes above are historical runs, superseded by their final receipts.
- T09 PR130 has source commits70649149/7c4adaaf and browser-discovered save-feedback fixcdd7872a. Initial7c exact CI6617pass429skip/worker57/all7checks passed, entry/native17 passed; first case run11pass2fail on EN/HK Saved feedback. These are retained as RED/partial receipts, not successful acceptance.
- Dedicated branch `codex/application-triage-20261003` and `hkwtia-application-triage-20261003.vercel.app`; existing authorized isolated/test credentials only. Fresh same-origin CLI protection access, positive owned DB marker and actual trusted Auth user mapping precede fixtures; no email-based identity merge. Nonprimary/default/protected branch `br-lingering-unit-azxl75s5`, expires2026-10-04T12:00Z, ledger59/sentinel1/outside-reserved-domain0.
- Review=true only in confirmed isolated Preview. New application generation=false, agents=false and budget caps0 intentionally close dispatch; the application registry remains administratively unapproved. Configuring a key/flag alone does not establish approved data use.
- No new migration. Production0057/0058/0059 and new capabilities remain unapproved/unreleased in this round. Production read at22:19UTC still36eb/dpl9j READY. main merge is separate from Production release.
- Sender operational pause is not inferred from RUN_LIVE_WOZTELL=0 (test adapter selection). This case acceptance does not call sender/provider, and verifies unchanged message/membership/billing/budget counts; real cloud-worker/sender readiness still has its own credential/allowlist/window/recipient gates.
- Platform/data/AI/finance owner must approve the versioned application route/data purpose, controlled administrative test credential and run/day/month caps; T13 real model/usage/invoice receipts follow. Controlled Google/test mailbox and cloud service binding/two real windows remain independently unresolved.

- T09 finalcdd: deploymentdpl_HKFD3MBFZDveZhEbhRv3qoLheMSZ, exactCI6618pass429skip/worker57/all7, actualNative17入口＋13cases all-green full run. 原7c儲存提示消失是真productRED；cdd導航立即URLassert是test timing，改等待目標URL後两項通過，不增加timeout。所有cases消息／會籍／付款／budget delta0；Google/magic-link/realmodel/worker窗口未由此驗證。


## T18 workspace candidate — 2026-10-04

- PR130 final059 exact CI6618pass429skip/worker57/all7 checks; merged a7d7abda. Final tree equals source059 and app bytes equal native-testedcdd. Final receipts `evidence/t09/ci-checks-final.json` and `merge.json` supersede pending CI/merge notes.
- Fresh Production read2026-10-03T23:27:30Z remains36eb/dpl9j READY; project Production branch release. No Production0057/58/59/new flags/config published.
- New branch codex/administrative-workspace-20261003, dedicated Preview alias hkwtia-admin-workspace-20261003.vercel.app. Existing user-approved isolated/test credentials reused only on this branch. Source generation/review, agents and budget dispatch remain closed; sender test adapter is not real-provider readiness proof.
- Fresh Neon metadata: br-lingering-unit-azxl75s5 ready/nonprimary/default/protected; exact isolated DB/Auth pair/sentinel/outside-reserved-domain proof; expiry2026-10-04T12:00Z. Add only this exact Preview origin to isolated better_auth trust; no Production Auth origins modified.
- T18 existing daily-work/source denominators/owner/due/history/six navigation groups retained and actualPG7 regression passed. New global search actualPG13 and focused174 passed; new role/scope reads do not write membership, billing, grants, messages or budgets. No migration required.
- First full had8 route owner/count failures plus1 Auth-tree process timeout under concurrent build. Owner/count fixed and route/Auth focused46 passed without increasing timeout. Final full/native/CI are pending here, never claimed pass. Initial native test discovery JSON import-attribute error is harness setup, not product RED; corrected with typed file reads.
- Pending owner: platform/provider/policy gates from other tasks, and3–5 human staff pilots with actual completion/rework/irreversible-error observations. Operations handbook provides concrete entries/recovery and leaves uncollected pilot results empty.

- T18 final source28322fd3: local full6632pass442skip0fail, exact CI37164254853 all7/worker57; focused174 inclPG20; lint0errors/91warnings, typecheck/build/strings0. Exact Previewdpl_E9M78kznkuc8SWq5DccGNt7nZt6N verified17entry+final single full9native cases with actualNeonPasswordAuth, EN/HK390/keyboard/axe0, five entities and51/101workspace keysets,0effect delta. First native7pass2fail reflects fixture prefix collision; minimal seed labels made disjoint, all product limits/scope retained. Final receipts supersede earlier pending native/CI notes. Human G5/true provider/business dependencies remain unresolved; source-only fixture correction is not a Production mutation.

## T14B membership candidate — 2026-10-04

Source1e9709ce, Previewdpl_9m5BHcTshdDpN1jwcuzwLaWDwbDw / hkwtia-membership-lifecycle-20261003.vercel.app.43branch-only authorized test env values; positively proven isolated DB/Auth all59ledger;17entry +4native cases. StripeactualTESThostedCheckout/real event controlled signed replay passed; oneattempt/entitlement; ownedsubscription canceled and reconciled. No real sends/refunds/Production. Existing caps/flags stay separately gated. Approllback by focused commitrevert; no migration/data/history cleanup. SourceCI37167576351 all7 green/6637pass455skip/worker57; docs-only finalHEADCI pending. Google/magic/no-profile/recurring provider/automatic remote callback/G5 worker+human gates remain.
