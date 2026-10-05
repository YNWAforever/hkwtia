# 完整修復實作與驗收索引（2026-10-05）

本包是本輪程式與實際測試證據。不是正式發布完成證明。原始 ZIP／40 個 UC 結果保留；新結果另列於 acceptance.csv。22 個 task、28 個 finding、64 個 case 的逐項狀態由 CSV 台帳管理。

## 本輪提交與實際結果

- `586fd6e`：補齊 T04 已記錄工作分母、CMS 草稿與 AI 計時引用；166 focused、5 真 PG16、9 隔離 Neon、5 真瀏覽器 PASS。沒有真人 ROI 結论。
- `e42f323d`：T16 真遷移／dump-restore／歷史 web 相容驗收與可重跑工具；3 PG16 recovery、3 歷史 web PASS。
- T15 PR #140 已合併，6771 pass /590 guarded skip；10 條原 Lighthouse 門檻全通過。原失敗與 before/after 保留於 evidence/t15。
- 本機 lint 0 error /97 warnings、typecheck、strings（324 TSX）、Next16.3.6 build PASS。最終946bad06 source CI：6771 pass、596 guarded skip、0 fail、worker57；真隔離 Preview2 native＋10smoke PASS。

## 正式環境與邊界

正式只讀回執：`36ebae1`／`dpl_9jPwBRj3Cy5Wcan9N76mgRRXKkvN`，Git production branch 是 `release`。本輪沒有正式 migrations、flags、付款、退款、會員訊息或 AI provider 呼叫。`RATE_LIMIT_KEY_SECRET` 已有 Production 配置；值／運作未由 presence 證明。`CONCIERGE_COOKIE_SECRET` 仍缺。

舊 Preview 已隔離驗證 `145443b6`。T04 最終946bad06 Preview已驗證：dpl_CaFyCEuC6pewkfG2Bg3Z6hr277FR，見 evidence/t16。正式 candidate deployment 尚未建立；不可直接把測試 DB/Auth Preview 提升為正式。

## Task 狀態

| Task | 已實施與證據狀態 | 必需外部門檻 |
|---|---|---|
| T00 | ENGINEERING_BASELINE_COMPLETE | 見 tasks.csv 的 owner/blocker |
| T01 | CODE_AND_NATIVE_FAILURE_RECOVERY_VERIFIED | 見 tasks.csv 的 owner/blocker |
| T02 | CODE_AND_ISOLATED_REPOSITORY_VERIFIED | 見 tasks.csv 的 owner/blocker |
| T03 | ACTUAL_SQL_FIXED100_AND_24_SCALE_CASES_VERIFIED | 見 tasks.csv 的 owner/blocker |
| T04 | RECORDED_POPULATION_SQL5_NATIVE5_CI6771_PASS_HUMAN_BASELINE_GATE | 見 tasks.csv 的 owner/blocker |
| T05 | SOURCE_AND_MOCK_SDK_CONTRACT_FULL_GATES_PASS_ADOPTION_CLOSED | 見 tasks.csv 的 owner/blocker |
| T06 | SOURCE_FULL_GATES_PG_AND_PREVIEW17_PASS_PROVIDER_GATE | 見 tasks.csv 的 owner/blocker |
| T07 | SOURCE_FULL_CI6520_PG31_NATIVE29_PASS_PROVIDER_POLICY_GATES | 見 tasks.csv 的 owner/blocker |
| T08 | SOURCE_CI6567_PG30_NATIVE29_PASS_REAL_MODEL_BUSINESS_GATES | 見 tasks.csv 的 owner/blocker |
| T09 | SOURCE_CI6618_PG43_NATIVE30_PASS_REAL_MODEL_GATE | 見 tasks.csv 的 owner/blocker |
| T10 | SOURCE_CI6683_PG21_NATIVE2_PREVIEW19_PASS_REAL_MODEL_GATE | 見 tasks.csv 的 owner/blocker |
| T11 | CODE_SQL61_NATIVE2_PREVIEW19_CI6698_PASS_PROVIDER_WORKER_GATES | 見 tasks.csv 的 owner/blocker |
| T12 | CODE_PG68_NATIVE2_PREVIEW23_CI6719_PASS_PROVIDER_GATE | 見 tasks.csv 的 owner/blocker |
| T13 | ENGINEERING_DONE_PROVIDER_AND_HUMAN_GATES | 見 tasks.csv 的 owner/blocker |
| T14A | SOURCE_CONTINUATION_IMPLEMENTED | 見 tasks.csv 的 owner/blocker |
| T14B | SOURCE_PG13_NATIVE4_STRIPE_TEST_GREEN_G5_PARTIAL | 見 tasks.csv 的 owner/blocker |
| T14C | PARTIAL_CODE_PG_NATIVE_STRIPE_TEST_VERIFIED | 見 tasks.csv 的 owner/blocker |
| T14D | CODE_AND_ISOLATED_SQL48_NATIVE6_PASS_PROVIDER_WORKER_GATES | 見 tasks.csv 的 owner/blocker |
| T15 | CODE_SQL38_NATIVE12_LH10_CI6771_PASS_HUMAN_REGION_GATED | 見 tasks.csv 的 owner/blocker |
| T16 | ENGINEERING_RELEASE_RECOVERY_AND_PREVIEW_VERIFIED_EXTERNAL_GATES | 見 tasks.csv 的 owner/blocker |
| T17 | ENGINEERING_PG14_FOCUSED73_NATIVE8_CI_GREEN_CONTENT_SIGNOFF_PENDING | 見 tasks.csv 的 owner/blocker |
| T18 | ENGINEERING_PG20_FOCUSED174_NATIVE9_CI_GREEN_PILOT_BLOCKED | 見 tasks.csv 的 owner/blocker |

## Finding 狀態

| Finding | 程式狀態 | 對應任務 |
|---|---|---|
| F-AI01 | SAFE_FAILURE_FIXED | T01;T16 |
| F-AI02 | REASON_AND_COUNTER_BOUNDARIES_FIXED | T02;T14D;T16 |
| F-AI03 | LINKED_SOURCE_IMPLEMENTED_REGRESSION_VERIFIED_EXTERNAL_GATES | T03;T11;T14D;T18;T16 |
| F-AI04 | REGISTRY_AND_DISABLED_ADOPTION_GUARD_IMPLEMENTED | T05;T16 |
| F-AI05 | REGISTRY_AND_DISABLED_ADOPTION_GUARD_IMPLEMENTED | T05 |
| F-AI06 | FIXED_FULL_GATES_PASS | T06;T13 |
| F-AI07 | LINKED_SOURCE_IMPLEMENTED_REGRESSION_VERIFIED_EXTERNAL_GATES | T07;T08;T13 |
| F-AI08 | GOVERNED_KNOWLEDGE_SOURCE_IMPLEMENTED | T07 |
| F-AI09 | LINKED_SOURCE_IMPLEMENTED_REGRESSION_VERIFIED_EXTERNAL_GATES | T08;T11;T12;T13 |
| F-AI10 | FIXED_BOUNDED_DURABLE_T11 | T11;T15 |
| F-AI11 | LINKED_SOURCE_IMPLEMENTED_REGRESSION_VERIFIED_EXTERNAL_GATES | T08;T09;T10;T11;T12;T18;T15 |
| F-AI12 | GRADER_AND_EVAL_TOOL_IMPLEMENTED_REAL_MODEL_GATE | T13 |
| F-AI13 | RECORDED_POPULATION_IMMUTABLE_TIMING_IMPLEMENTED | T04;T18;T16 |
| F-AI14 | PARTIAL_ENGINEERING_VERIFIED_EXISTING_POLICY_PRESERVED | T14A;T14B;T14C;T14D;T15;T17;T16 |
| O01 | T17_REMAINING_SOURCE_FIXED_EXISTING_CMS_AND_CLAIMS_PRESERVED | T17;T15 |
| O02 | LINKED_SOURCE_IMPLEMENTED_REGRESSION_VERIFIED_EXTERNAL_GATES | T03;T18 |
| O03 | PARTIAL_ENGINEERING_VERIFIED_EXISTING_POLICY_PRESERVED | T14B |
| O04 | AUTH_ENTRY_CONTINUATION_AND_ACTOR_BOUNDARIES_IMPLEMENTED | T14A |
| O05 | REASON_AND_COUNTER_BOUNDARIES_FIXED | T02;T14D |
| O06 | T17_REMAINING_SOURCE_FIXED_EXISTING_CMS_AND_CLAIMS_PRESERVED | T00;T07;T14B;T17;T16 |
| O07 | LINKED_SOURCE_IMPLEMENTED_REGRESSION_VERIFIED_EXTERNAL_GATES | T09;T14B;T18 |
| O08 | T17_REMAINING_SOURCE_FIXED_EXISTING_CMS_AND_CLAIMS_PRESERVED | T17 |
| O09 | LINKED_SOURCE_IMPLEMENTED_REGRESSION_VERIFIED_EXTERNAL_GATES | T14A;T18;T15 |
| O10 | LINKED_SOURCE_IMPLEMENTED_REGRESSION_VERIFIED_EXTERNAL_GATES | T18;T15 |
| O11 | LINKED_SOURCE_IMPLEMENTED_REGRESSION_VERIFIED_EXTERNAL_GATES | T08;T14D |
| O12 | PARTIAL_ENGINEERING_VERIFIED_EXISTING_POLICY_PRESERVED | T14B |
| O13 | PARTIAL_ENGINEERING_VERIFIED_EXISTING_POLICY_PRESERVED | T14B;T11;T15 |
| O14 | T17_REMAINING_SOURCE_FIXED_EXISTING_CMS_AND_CLAIMS_PRESERVED | T17;T18 |

## 證據與重跑命令

所有命令在本 worktree 執行；`.env.local` 是已確認隔離目標，不能用 Production 值代替。原始跑次、失敗與界限都保留。

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/ai-operations-metrics.test.ts tests/unit/operations-baseline.test.ts tests/unit/operations-metrics-action.test.ts tests/unit/operations-timing-form.test.tsx tests/unit/aiops-dashboard.test.ts tests/unit/aiops-components.test.tsx tests/unit/aiops-page.test.tsx tests/unit/server-action-actor-boundary.test.ts --maxWorkers=2
$env:RUN_POSTGRES_INTEGRATION="1"
node node_modules/vitest/vitest.mjs run tests/integration/operations-population.test.ts tests/integration/audit-full-migration-recovery.test.ts --maxWorkers=1
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/integration/operations-baseline.test.ts tests/integration/ai-operations-metrics.test.ts --maxWorkers=1
node --env-file=.env.local scripts/verify-full-rollback-web.mjs --reuse-build
node scripts/verify-full-release-package.mjs
npm.cmd run typecheck
npm.cmd run audit:strings
npm.cmd run lint
npm.cmd run build
```

`--reuse-build` 需要工具已核對過的精確歷史 build；沒有時先不加參數建置。PG16 helper 只建立自己擁有的 loopback 容器，不讀外部 DB URL。歷史 web 使用正向確認隔離 Neon/Auth；拒絕覆蓋任何既有私人 CMS 草稿。

`npm test` 的最終程式版本946bad06完整6771pass／596guardedskip／0fail；最後文件 checkpoint 的 exact-head CI 另外讀回。guarded skip 分開列出；沒有 provider receipt、沒有 cloud cron 窗口、沒有真人 baseline 的項目不能被 PASS 覆蓋。

## 發布與回退

- release-manifest.json：source／部署／schema／provider／flags／capability 狀態。
- rollout.md：先 schema、closed web、scoped worker，再逐能力 flags；AI 兩名職員、每日50宗、draft-only 一週。
- rollback.md：先停 writer／dequeue／AI，保留 ledger、付款、historical grant、unknown effect、outbox 與audit；provider unknown先對帳。
- runbook.md、operations-handbook.md 及各繁中 SOP：每日操作／支援／維護。
- evidence/t16：restore、歷史 web、本機 build/native、Production presence、traceability guard、發布包安全檢查。

## 仍待解鎖

Auth owner：可控制的 Google challenge／mailbox；worker owner：精確 cloud service binding＋每 job 兩個真正窗口；provider/data/finance：核准用途、資料、測試 credential、額度、現行定價及真回執；QA／協會：3–5真人、screen reader、HK/SG probes／RUM、兩星期 baseline／content／D01–D06／一週試點；release owner：指定正式版本、配置、migration 與能力批准。

自動審批先前在執行前拒絕 T13 paid/data-export live CLI，沒有 workaround。OpenCode Go 行政 adapter 保持 off。


## 最終工程回執

- 946bad06：修正 legacy board/retention 對話分類，真PG RED16→GREEN14；5PG16、9Neon、166focused、最新build／5native及隔離Preview2native＋10smokePASS。
- 程式 source CI37234145326全7green，完整6771pass／596guardedskip／0fail、worker57。完整skip檔案／environment guard清單見 evidence/t16/guarded-skip-inventory.json。
- 發布 package 是準備與隔離回復證明；正式部署、能力啟用、真provider／Google／magic、cloud windows、human/region/policy／pilot沒有被宣稱完成。

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
## 2026-10-05 19:51 香港時間 — 隔離環境續期及最新門檻

- Owned synthetic branch `br-lingering-unit-azxl75s5`／`codex-audit-20260927` 在到期前只延長 expiration 24 小時：新期限 `2026-10-06T12:00Z`（香港10月6日20:00）。官方 CLI `branches set-expiration` 後另做 branch list readback；nonprimary/nondefault/unprotected/ready 保持。沒有修改 compute、schema、資料、Auth、憑證或正式環境。
- 續期前後均 READ ONLY 正向核對原 DB/Auth host、sentinel1、ledger61及保留合成網域外 profile/contact0；0fixture writes／provider calls。先前03:54Z回執與舊ZIP的10月5日期限是歷史觀察，沒有覆寫。
- Fresh anonymous Preview三個入口仍302 Vercel Authentication；fresh單一Production DATABASE_URL仍敏感值遮罩，0SQL。實際Production source仍ed550b96。沒有把exit0 diagnostic寫成integration pass。
- Actual maintenance、isolation及blocked receipts：`evidence/t16/environment-refresh-20261005/`。遠端Preview／Cloudflare服務secret傳送的具體批准仍pending；AI專用key／data-purpose-spend、受控Google／允許mailbox、provider／worker兩窗口及真人政策門檻均保留。
