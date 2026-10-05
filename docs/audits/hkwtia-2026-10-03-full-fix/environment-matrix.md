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


## T14D verified candidate — 2026-10-04

PR135 source9603519; Previewdpl_F7owZgh31gWmE2Ecr4kBQ2jtzacD / hkwtia-delivery-recovery-20261003.vercel.app. Existing approved isolated43branch env values only. Positive DB marker/all59ledger/actual staff Auth; Preview17/native6/SQL48. Full6657PASS519SKIP0FAIL; sourceCI37181949858 all7/worker57. No new migration. Neither test-sink acceptance nor synthetic callbacks proves Resend/Woztell delivery. Required external receipts and worker service binding/two cloud windows remain blocked; Production stays36ebae1/release. Final docs+harness CI is a separate gate.

## T10 candidate — 2026-10-04

Source/harnessd060f423, PR136; isolated branchbr-lingering-unit-azxl75s5 reverifiedready/nonprimary/nondefault/unprotected, expiry2026-10-04T12:00Z. Existing approved test DB/Auth/rate-limit/StripeTEST/R2 names provided only to this Git Preview branch. R2 is shared existing partner storage and was not used for T10 isolation evidence. Review and synthetic protected compose enabled only in Preview; support generation/provider approvalfalse, agentsfalse, caps0, all new effectful business flagsfalse. No provider calls or real member data. Production readonly2026-10-04T08:42:17Z remains36ebae1/dpl9j READY; Production branchrelease.

T10 exact Preview19 includes actual bilingual review/adoption with0outbound and private recovery; pinned dpl_ELFx9FrAXc4JA6sJq2Ra2MXimC4E/source d060. No Production change.

## T11 — verified isolated capability (2026-10-04)

- App source894e923b / Preview dpl_f7V6G4UVuDGLyXrJhYd1Wu6E6u55, exactbranch `codex/bounded-retention-drafts-20261003`; marker proves isolated DB.
- Neon nonprimary/defaultfalse/protectedfalse `br-lingering-unit-azxl75s5`, sentinel1, reserved fixture domains, ledger60; expiry2026-10-05T12:00Z. Auth same isolated endpoint and read-back trusted Preview origin.
- Existing user-authorized test credentials configured only branch-scoped Preview; dedicated protection/Cron/Concierge values independent. Retention generation/agents/send flags false, budgets0.
- 0060 verified on loopback and isolated Neon; Production unchanged. Actual model, worker identity/two windows and release authority remain gates. See evidence/t11.

## 2026-10-05 最新正式環境讀回（取代先前36eb的當前狀態）

- 正式 alias 已指向 ed550b96 / dpl_7kPgC4PcwHcP6Q9fWFaVTYgkvVFV，READY、main ref、source=redeploy。這是本次檢查前已有的部署；本 execution 沒有發布、migration、flags 或 provider mutation。
- 配置及 runtime 分開：CONCIERGE_COOKIE_SECRET 未配置；AGENTS_ENABLED 未在該部署 env 名稱清單。正式 API 實際回安全503 AI_DISABLED，並非 AI 正常回答成功。獨立 cookie secret、provider/budget/purpose批准仍是啟用門檻。
- 新 native receipt 見 evidence/t16/production-20261005/browser-final.json：4個EN/HK1440/390安全降級＋10匿名頁面＋2fresh locale context admin guard，共16項。沒有使用會員登入 cookie、沒有建 fixtures、沒有請求登入連結、沒有付款／退款／訊息／AI provider。
- Production DATABASE_URL 在指定部署 API 被遮罩。只讀 ledger checker 以 BLOCKED 停止，0 SQL query；沒有讀完整Production env、沒有以測試 DB 代替、沒有執行 migrations。解除條件：Release/DB owner 提供 provenance 已核對、只讀連線／既有secret-store路徑，或提交当前 ledger hashes。
- 隔離 branch br-lingering-unit-azxl75s5 新讀回仍 ready/nonprimary/nondefault/unprotected，2026-10-05T12:00Z（香港20:00）到期；Google／允許測試mailbox、worker服務身份／兩窗口、provider receipts、人工／政策／区域／pilot仍需原各owner。
- 原始40UC、舊Production與測試回執保持其歷史時間。部署已觀察到不等於新能力已批准／啟用／operational；fullFixComplete仍false。

## 2026-10-05 剩餘整合門檻實際核對

- main4da4bc59 的 worker focused57/57（0skip）與typecheck、native10.80KiB acceptance bundle dry-run通過。未部署／未上傳secret／未觸發job；private reviewed配置只指向既有隔離Preview且allowlist=none。
- 現有隔離DB/Auth重新正向證明：ready/nonprimary/nondefault/unprotected、sentinel1、ledger61、保留合成網域外profiles0/contacts0；READ ONLY，0fixtures。expiry仍香港2026-10-05 20:00。
- 真callback access blocker已定位：隔離Preview登入／Stripe webhook／jobs的anonymous GET回302 Vercel Authentication。不能把CLI/browser已登入的200當外部provider可達。只提出單一Preview domain exception的具體待批准範圍；沒有關閉project protection／應用authorization或傳project-wide bypass secret到provider。
- 單一Production DATABASE_URL官方API也遮罩value，已確認唯一Production-scoped配置type=sensitive；0SQL/0migrations。需DB owner提供provenance已核對的只讀來源，不另選Neon branch或匯出全部Production env。
- Existing cloud worker67abdfce的bounded passive tail沒有兩個已驗證排程窗口；沒有觸發或修改它。未觀察到事件不代表所有jobs故障，仍不能宣稱T02 operational。
- 原40UC／24AC、source-map及過去回執未改。新receipt在evidence/t16/operational-readiness-20261005；待批准操作及分開資源來源見operational-acceptance-approval.zh-HK.md。三項具體資源／授權要求已提出且仍pending；elapsed time／「完整修復」不能填作具體provider費用、憑證傳送或安全配置批准。
