# HKWTIA Full Remediation Implementation Plan — Codex GPT-6.1 Sol

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 如使用者另行選擇委派方式，才使用 superpowers:subagent-driven-development。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成證據包涵蓋的可靠性、會員生命週期、批次維護、SaaS 後台、內容維護及 AI 行政改造，逐項取得新版本驗收證據，讓協會職員可獨立操作。

**Architecture:** 保留 Next.js／Neon／現有 actor、AI runtime、approval、outbox 及 batch services。先用規則和資料庫準備事實，模型只提出建議；校驗後供職員覆核，再經既有服務執行。OpenCode Go 作 coding 工具；行政 runtime 的 Go adapter 預設關閉，服務用途獲確認後才可啟用。

**Tech Stack:** repo 鎖定版本：Next.js App Router、TypeScript、next-intl、AI SDK 7.0.37、Zod、Drizzle／Neon、Vercel／Cloudflare Worker、Vitest／Playwright。以 lockfile 為準，不為這個計劃順便升級框架。

**Spec:** `input/HKWTIA_AI_Admin_Audit_Evidence_2026-10-03.zip` 解壓後的 `HKWTIA_AI_Admin_Audit_2026-10-03_zhHK.md`、`user_cases.csv`、`operations.csv`、`tasks.csv`、E01–E20。基線 SHA `36ebae1dac68a7e0e420870cf0df68fa166b7874`。

## Global Constraints

- 開始先讀 repo `AGENTS.md`，核對當前 main／正式部署與本包差異；既有修正不重做。本包不是 production 部署授權。
- 所有中文以繁體香港用語，`messages/en.json`、`messages/zh-HK.json` 同步；實際 locale 路由沿用 `/zh`。
- DB／credentials／integration 只在 server；actor 從 session／服務身份取得，不能信任 client 提交 role、profileId 或 permission。
- 不取得或輸出全份正式環境值；readiness 只回 presence、穩定錯誤碼及相關 run ID。
- 會員審批、收款、會籍權益分開；模型不能決定身份合併、核准會籍、退款或金額。
- 保留 batch snapshot、previewDigest、capability flags、逐筆回執、consent、provider 冪等鍵及 unknown-effect 對帳。取消不是撤回已發訊息。
- API provider 的用途及資料政策未確認，先用合成資料、mock／隔離環境完成其他任務。不得偽裝 coding-agent UA。
- 不將正式會員資料輸入未批准模型；最小 fact pack 優先，姓名／email／電話由應用模板替換。不要把 operational-summary regex 誤當整體 DLP。
- 僅允許固定 provider origin 白名單；endpoint/model 不由 client 輸入。所有 AI endpoint 保持角色授權、輸入上限及安全降級。
- 本次未驗新 Google／magic link、金流／sender／mobile，後續必須實際驗收；不把 CI 綠燈當作全部完成。
- 下述新檔、function、欄位、flags 是**提議實作介面**，不是已存在 API。migration 0057–0059 是本基線後的建議位置；若開始時被占用，依 repo generator 重新排序並更新計劃，不覆寫既有 migrations。

## Review Focus

1. 審批後資料／同意／角色改變：送出前重驗 facts hash、consent、權限；T08／T11 測試。
2. Provider 已接受但回應超時：維持 unknown，對帳後才重送；T03／T06／T14D 測試。
3. 一個高相關來源混入過期政策或惡意指令：不以相似度直接放行；T07／T08／T13 測試。
4. 多職員同時批准與大量同時生成：一次 commit、無超預算、逐筆結果可追蹤；T03／T06／T08 測試。
5. 港英雙語、香港時間月界、0 分母／缺比較期：不編造趨勢或錯誤截止時間；T07／T12／T13 測試。


## 使用方式與完成定義

本文件是依 2026-10-03 證據包制定的**待實作計劃**，未在本輪修改或部署產品。這是同包舊 16 任務計劃的整合加強版；T01–T13、T15–T16 保留 ID，原 T14 拆成 T14A–T14D，另加 T00、T17、T18。執行時以本文件為計劃、原始 ZIP 為不可改寫的證據。

- 輸入 ZIP SHA-256：`e3ee89685af39ea46bc20550e4cb6c43ff90cdb4fd1a71e3649fb9a36680ae62`；92 個檔案。原 manifest 的 91 項均核對通過。
- 基線 repo／正式部署 SHA：`36ebae1dac68a7e0e420870cf0df68fa166b7874`；部署 `dpl_9jPwBRj3Cy5Wcan9N76mgRRXKkvN`。包內 10 月 1 日文件有較早版本，只作歷史回歸，不能蓋過 E01。
- 已確認：Concierge 缺 cookie secret 兩次 500；batch 明示停用；17 類 worker 中 13 unknown、4 disabled。Unknown 不等於故障；disabled 不等於 checkbox 壞掉。
- 已改善：後台六組導航、footer 職員入口、申請跟進欄位、profile／membership／seat 數字區分。保留並驗收，不從零重做。
- 未驗：新 Google／電郵登入連結、完整付款／退款／續會、實際 sender、手機／鍵盤、地區效能及真模型答案。未驗項是驗收工作，不先宣稱漏洞。
- 已排除：main 與正式部署落差；demo 活動公開外洩；AI SDK 7 `usage` 只算最後一步。不得把已排除的假設寫成修復成果。

每 finding 分開記錄 `code_state`、`isolated_verification`、`configuration_state`、`deployment_state`、`operational_state`。程式通過不代表已配置；部署 READY 不代表 runtime 正確；mock 通過不代表真 provider 通過。狀態使用 PLANNED / IN_PROGRESS / PASS / FAIL / BLOCKED / NOT_TESTED / NOT_DEPLOYED / NOT_APPLICABLE，並附環境、SHA、時間及 receipt。受控未啟用的選配 Go 可記 NOT_APPLICABLE（保留採用決策），不得記為已驗正式可用。

**Full fix 關閉條件：** 所有已確認必修問題有修正後證據；40 個原 UC 與本包新增 24 個 AC 逐一有處置；O01–O14 有回歸結果；必要 Auth、付款、sender、worker 與 staff SOP 門檻通過；剩餘未批准選配能力清楚停用。仍有必需流程 BLOCKED 時，交付只能稱「程式修復完成／營運驗收未完成」。

**建議放入 repo：** `docs/superpowers/plans/2026-10-03-hkwtia-full-remediation.md`；執行紀錄放 `docs/audits/hkwtia-2026-10-03-full-fix/`。使用單一 Codex GPT-6.1 Sol session 逐任務執行；續接 session 先讀 status 和最後 receipt。小 PR／小 commit，無需為每個可逆程式修正反覆詢問。正式部署、真會員發送或收退款須依當時已有授權處理；本次請求僅授權撰寫計劃。

## 分階段交付及依賴

| 階段 | 任務 | 可交付成果／出關條件 |
|---|---|---|
| G0：鎖定現況 | T00 | 當前 SHA 差異、精確路徑圖、隔離環境正向證明、測試基線 |
| G1：可靠的日常主流程 | T01、T02、T04；T14A 優先 | 客服安全降級；worker 狀態可信；登入入口／新身份可驗；開始工時基線 |
| G2：會員與維護能力 | T03、T14B–D、T17、T18 | 批次逐項驗收；入會續會／活動付款／送達／內容及工作台可操作 |
| G3：受控 AI 基礎 | T05–T08 | 核准路由、預算、版本知識、事實校驗及可追溯覆核；不受 Go 決策阻塞 |
| G4：職員 AI 工作 | T09–T12 | 補件、客服、續會、報告及內容草稿整合原頁；保留人工操作 |
| G5：整體驗收 | T13、T15；重跑 T14A–D/T17/T18 | 真模型與完整旅程、手機鍵盤、HK/SG 效能、職員任務證據 |
| G6：可審閱發佈 | T16 | 版本／migration／flag 清單、preview、回退演練；按授權小量上線 |

T00 後可先做 T01/T02/T04/T05/T07/T14A/T17/T18。T03 依 T02；T06 依 T05；T08 依 T06/T07；T09/T10/T12 依 T08，T10 另依 T18；T11 依 T03/T08；T14B/C 的主流程開發依 T14A；T14D 依 T02/T03/T14A；涉及 worker/batch 的 G5 連接驗收另依 T02/T03；T13 依 T09–T12；T15 依功能及核心回歸；T16 必須收齊所有必要任務。沒有外部憑證時繼續可獨立完成的程式／mock contract，不虛構外部驗收。

依賴表示技術先後，不是要求啟動多代理。T14 不應等新 AI 全寫完才發現核心付款失敗；先驗人工主流程，G5 再驗 AI 併入後的同一完整旅程。

## 必須保留的產品與資料界線

1. 入會申請、付款 attempt、membership entitlement 是不同實體；免費／付費／審批先後依已批准政策決定，不能假定每個 tier 都先收款。
2. 截至本包 D01–D06 尚無新批准。T00 讀 repo 的原決策台帳並逐條引用；禁止自行把編號重新命名或推定費用、會籍年期、退款、通訊同意已獲批准。
3. 有限期 grant 必須有明確終止時間，不能因 UI 編輯變永久、改寫已付款交易或自動增加公司席位。身份連結不能只憑相似姓名或未核實 email。
4. 所有新的 `use server` 入口自行取得 session actor；內部 service 可接受型別化 actor，但不能將 actor-taking helper 直接匯出為 server action。維持現有 discovery regression。
5. 原 batch summary 只有 pending/running/succeeded/skipped/failed 五個 counters；unknown-effect／conflict 先從 item reason/effect state 顯示。要擴 schema 必須連 migration、worker、API、UI 一起改，不能只新增 UI enum。
6. 「批准草稿」、「採用到回覆框」、「發送／發布／更新權益」各有獨立授權。AI 草稿 ID 不是執行權限；主管多選覆核只改草稿狀態，不能變成無預覽群發。
7. Preview 名字不代表隔離。DB/Auth hostname摘要＋migration ledger＋owned synthetic marker 才是正向證據；禁止對 primary DB seed、匯出所有 secrets，或用 browser protection cookie 冒充 worker 服務身份。
8. 保留對外整合 in-flight receipts。`RUN_LIVE_WOZTELL=0` 會進 mock，不是停機開關；正式停止使用明確 pause/deny writer 與 sender dequeue，unknown 留待對帳。

## 輸入、批准與阻礙處理

| 前置項 | 負責角色 | 工程先完成 | 只阻擋哪一項 |
|---|---|---|---|
| 隔離 DB/Auth、callback、測試 Google 身份／信箱 | 平台／身份負責人 | guards、fixtures、UI、測試 harness | 真登入／隔離 E2E，不阻擋 unit |
| worker APP_URL、服務 scope、版本、排程 | 平台負責人 | health 判斷、dry-run、receipt UI | 兩真窗口及相關作業啟用 |
| D01–D06 原決策與有效政策文字 | 協會／會籍／財務／通訊負責人 | policy registry、未配置狀態、模擬資料 | 對應政策生效與正式效果 |
| Stripe TEST、核准 test recipient／sender | 財務／通訊負責人 | webhook/冪等測試、sink、unknown recovery | provider 實際回執驗收 |
| 允許的 AI provider/model、資料政策及成本上限 | 服務／資料負責人 | disabled adapter、contracts、合成 eval | 真模型調用；不阻礙人工流程 |
| Go 行政用途確認 | 服務負責人 | provider registry＋mock adapter | 僅 Go runtime；可先用核准現有 provider |
| preview 與具體 release scope | release owner | 全部程式、migration、證據、回退準備 | 正式發佈最終一步 |

記錄 blocker 時附「缺甚麼、已做甚麼、負責角色、最小解除證據、受影響任務」；不能用籠統的『待確認』停止整個工程。

**依賴的精確含義：** dependency指需要的程式介面與測試fixture，不要求所有外部營運gate先通過。T00缺provider憑證仍可完成source-map及unit環境；T02未取得兩真窗口時，T03可做隔離batch測試但不能正式啟用。T14B/C人工核心旅程可先於batch/sender完成；G5再收齊outbox/receipt連接證據。不要讓一個營運blocker把整條可獨立開發路線停掉。


## 檔案和責任分界

| 工作 | 現有位置 | 新增單一責任檔案（提議） |
|---|---|---|
| 配置與降級 | `lib/api/concierge-route.ts`, `lib/config/env.ts`, `components/ai/concierge-widget.tsx` | `lib/ai/readiness.ts` |
| 模型 registry | `lib/ai/model.ts`, `lib/ai/provider.ts`, `lib/ai/runtime.ts`, `lib/ai/providers/ai-sdk.ts` | `lib/ai/providers/registry.ts`, `lib/ai/providers/opencode.ts` |
| 預算及帳單 | `lib/ai/pricing.ts`, `config/ai-pricing.ts`, `lib/db/repos/agent-runs.ts` | `lib/ai/budget.ts`, `lib/db/repos/ai-budget.ts` |
| 知識來源 | `lib/db/repos/kb-documents.ts`, `lib/ai/tools/kb-search.ts` | `lib/ai/knowledge/policy.ts`, `lib/admin/knowledge-actions.ts` |
| 草稿校驗及審批 | 現有 approvals 與 case/batch services | `lib/ai/drafts/contracts.ts`, `validation.ts`, `service.ts`, `lib/db/repos/ai-drafts.ts` |
| 職員工作畫面 | 原申請、inbox、reports 路由及 components | `components/admin/ai-review-panel.tsx`, `app/[locale]/(admin)/admin/ai-review/page.tsx` |
| 試點成效 | `lib/aiops/*`, `lib/db/repos/aiops-metrics.ts` | `lib/ai/operations-metrics.ts`, `evals/admin-ai.golden.jsonl`, `evals/admin-ai-runner.ts` |


上述 source 路徑按已讀快照列出；未含在 58 檔快照的 auth、membership、CMS、worker 詳細實作由 T00 在完整 checkout 解析。**只把新檔列為 Create；既有路徑若不符 current HEAD，先更新 source-map 再修改，不憑計劃新建一套平行 service。**

共用新型別（提議介面；T05/T07/T08 分別擁有）如下，實作以同一 exported type 復用：

- T05 `lib/ai/providers/registry.ts`：`AdminAiTask = 'concierge'|'writer'|'application'|'support'|'renewal'|'board'|'content'`。保留 member Writer 自己的 actor/quota，再加全局 budget。
- T07 `lib/ai/knowledge/policy.ts`：`KnowledgeRef` 按 T07；`ApprovedFactPack = {caseId:string;locale:'en'|'zh-HK';versionHash:string;asOf:string;values:Readonly<Record<string,{value:string|number|boolean|null;sourceId:string}>>;sourceRefs:KnowledgeRef[]}`。hash 由 server 對 canonical facts、source versions 及業務 eligibility 算出。
- T08 `lib/ai/drafts/contracts.ts`：`DraftKind = Exclude<AdminAiTask,'concierge'|'writer'>`；`AdminAiDraft` 按 T08；草稿 factsHash 必須等於 fact pack versionHash。不要另造相同 task union。
- Actor / AdminActor 沿用 `lib/membership/lifecycle`。`AiReadiness` 只在 server 有 missing key 名；公開介面沒有設定內容。

所有 schema 變更採 additive migration；基線到 0056，0057–0059 是規劃位置，不是可直接指定的最終 ledger。T00/各 schema task 經 repo generator 寫 migration＋journal＋schema；先 migrate 再新 writer，舊 app/worker 要能讀新 schema。不得改已套用 migration 或以 DROP 修回退。

T08另擁有共用 `lib/ai/drafts/work.ts` 的durable generation claim，T11/T12只接入，不各自實作一套鎖。T08的facts/claims validator同時用於public Concierge；只有草稿受保護而public stream仍可先送錯答案，不算關閉F-AI07。


## T00 — 鎖定證據、current HEAD 及可安全執行環境

**Findings:** 全部（準備）；**依賴:** 無；**估計:** 1–2 人日。

**Files:** Read `AGENTS.md`、`.github/workflows/ci.yml`、`package.json`、lockfiles、包內 audit/plan/UC/operations/E01–E20。Create `docs/audits/hkwtia-2026-10-03-full-fix/{source-map.json,status.csv,environment-matrix.md,decision-register.md,baseline.md}`。不改 app。

**Interfaces:** `source-map.json` 每項 `{taskId,symbol,path,headSha,evidenceBasis:'snapshot'|'current-checkout'}`；`status.csv` 每 finding 至少含 task/case/owner/blocker/五種完成狀態/evidence_path/verified_sha。新作業狀態不得覆寫原 audit result。

- [x] 驗 ZIP hash 及原 manifest；記 current branch/status/HEAD/main SHA，對比 `36ebae1…`。dirty tree 不重置，按 repo 規則建立隔離 worktree。先讀適用 AGENTS；只有需要 Next API 時讀所安裝版本 `node_modules/next/dist/docs/`。
- [x] 解析 auth login/callback、membership lifecycle/grants、billing/webhook/refund、event registration/tickets、worker health、CMS drafts/publish 的實際 file + symbol；以 `rg`/repo 提供的 discovery 工具及測試交叉核對，記 source-map。找不到即記精確 discovery gap，不創造重複路由。
- [x] 從原政策台帳抄錄 D01–D06 的文字／owner／批准狀態；從原 status 匯入 O01–O14 作歷史 index。已 fixed 的部分以 regression 驗收，不重做。
- [x] 建環境矩陣：local/unit、確認隔離 DB/Auth、Stripe TEST、sender sink、approved provider、preview app/worker SHA、ledger、flags。只記非秘密摘要；正向 marker 限 owned isolated fixture。
- [x] Run `npm ci`，按本計劃「測試命令」跑基線；保留 command/exit code/原始失敗/skip 理由。若缺外部設定，不替換真流程為 mock 來製造 PASS。
- [x] Commit `docs: establish full remediation execution baseline`。完成後每個未知既有路徑已有 source-map，後續才可改該子系統。


## T01 — 恢復 Concierge 配置檢查和錯誤 UX

**Findings:** F-AI01。**估計:** 1–2 工程人日；部署設定由營運者處理。

**Files:** Modify `lib/api/concierge-route.ts`, `lib/config/env.ts`, `components/ai/concierge-widget.tsx`, 兩個 messages；Create `lib/ai/readiness.ts`; Test `tests/unit/concierge-readiness.test.ts`, `tests/e2e/concierge-unavailable.spec.ts`。

**Interfaces:** `getAiReadiness(env:Readonly<Record<string,string|undefined>>):{state:'ready'|'disabled'|'misconfigured';code:'READY'|'DISABLED'|'CONFIG_MISSING'|'CONFIG_INVALID';missingKeys:readonly string[]}` 為 server-only；公開回應僅 `{error:'AI_CONFIGURATION_UNAVAILABLE', requestId:string}`，不包含 missingKeys／secret。內部 log 記 key 名，不記值。

- [ ] 寫 `missing_cookie_secret_returns_503_without_provider_or_database_calls`：production 缺 secret 時 status=503、code 正確、providerCalls=0、businessDBWrites=0（不排除必要的既有 rate-limit 儲存）；測 31 bytes、UTF-8 byte 長度、與 Auth secret 相同、有效獨立 secret 四組；disabled 與 misconfigured 必須分別測。readiness 不發模型探測請求。
- [ ] Run `npx vitest run tests/unit/concierge-readiness.test.ts`；先確認缺失配置測試失敗，再修改 boundary。保留 env 的嚴格檢查，catch 只做安全降級。關閉 AI 的路徑先判定開關，不因未啟用能力的缺 key 使人工入口掛掉；不得把 misconfigured 偽裝為 disabled。
- [ ] UI 對配置失敗顯示「智能助理暫停服務。你可查看申請指引或聯絡職員。」；保留原問題、request ID 與可點的既有聯絡路由；網絡／429／timeout 用不同文案。
- [ ] 由部署者使用既有 secret 管理機制配置獨立 ≥32 bytes 值；不把值寫入 PR／log。先驗配置，再驗成功／disabled handoff，不能只憑 build READY 關閉問題。
- [ ] Run unit 和 `npx playwright test tests/e2e/concierge-unavailable.spec.ts`；記 E10/E11 新回歸，提交 `fix: make concierge configuration failure actionable`。


## T02 — 建立可以信任的 worker readiness

**Findings:** F-AI02。**估計:** 2–3 人日加兩個排程窗口。

**Files:** 先讀現有 `lib/jobs/*`, `workers/src/*` 和 migration `0052_verified_worker_health.sql`；修改現有 health 展示與 collector，不新建第二個 scheduler。Test `tests/integration/ai-worker-readiness.test.ts`。

**Interfaces:** 沿用現有健康記錄；新增展示層 `AiWorkerReadiness = {jobKind:string; state:'disabled'|'unknown'|'healthy'|'degraded'; deploymentSha:string|null; lastVerifiedAt:string|null; reasonCode:string|null}`。read-only readiness 不 invoke 真工作。

- [ ] 寫 `no_receipt_is_unknown_not_zero` 與 `wrong_version_or_missing_window_is_degraded`；verified receipt 必須匹配 job、deployment、成功完成，不以 HTTP 200 或空數字當健康。
- [ ] Run `npx vitest run tests/integration/ai-worker-readiness.test.ts`；隔離 DB 以 repository 要求的 guard 執行；先得明確失敗。
- [ ] 核實非 primary DB/Auth、ledger、worker APP_URL／服務 token、每項旗標及 provider mode，只保留摘要；修正有問題的 binding 路徑。
- [ ] 隔離環境執行 empty queue 和 owned fixture，收兩個實際窗口；Retention／Board 先用既有 `?dryRun=1`，dry-run 不生成或發送。
- [ ] 列出 17 類工作各自 receipt、未知原因及下次預期；run root/worker focused tests，提交 `fix: verify scheduled admin work readiness`。沒有服務存取的項目保留 blocked，其他程式照完成。


## T03 — 逐項啟用既有批次維護

**Findings:** F-AI03。**估計:** 2–4 人日；依 T02。

**Files:** `lib/admin/batches/{service,capabilities,types}.ts`, `lib/admin/batches/handlers/*`, `components/admin/{batch-preview,batch-progress}.tsx`；Test `tests/e2e/ai-admin-batch-readiness.spec.ts`。優先補 regression，不任意重寫已有 handler。

**Interfaces:** 保留 `prepareBatch(actor,input) → {batchId}`, `getBatchPreview`, `commitBatch(actor,{batchId,previewDigest})`。AI 只能建議 request，server 決定 capability 和 selection。

- [ ] 寫「100 筆中 80 有效、10 已退訂、5 已續會、5 版本衝突」驗收；對象 snapshot 後改篩選，目標不得漂移；雙擊 commit 只執行一次；snapshot 後撤回 consent／已付款須在執行前重驗。衝突與結果不明是逐筆 reason/effect state，不能假定現有 summary 已有該 counters。
- [ ] Run `npx playwright test tests/e2e/ai-admin-batch-readiness.spec.ts`；用 sender sink、合成會員，保留 skipped reason 和真正未完成筆。
- [ ] 修正發現的缺口；先完成 export/profile_patch 的隔離驗收，再 import；正式開關只在 T16 按授權開啟。communication/ticket/grant flags 各自通過驗收才交付啟用清單。
- [ ] 驗取消只停 pending、重試只針對可安全重試失敗項；provider accepted-timeout 必须 unknown/reconcile，不能重發全部。
- [ ] 完成 screenshot／逐筆 receipt／rollback：停新 batch 和 sender，保留歷史；提交 `feat: make membership batch operations ready for rollout`。


**附加 AC-06–AC-08：** 目前頁／全部篩選有不同顯式選取；預覽顯示 snapshot 時間、總數、適用數、略過理由及 sample diff。CSV 先驗 byte/row 上限、encoding、嚴格欄位 allowlist，避免 role/email/consent 注入；同檔重送冪等，相似姓名只列衝突，會員權益不得由匯入悄悄更改。匯出按 actor/scope、私有短效下載、完整 count，消除 CSV formula injection。批次 supervisor approval 若納入，仍用 previewDigest＋逐筆版本檢查；不發送 AI 未通過校驗稿。


## T04 — 設定人工基線及完整營運分母

**Findings:** F-AI13。**估計:** 1–2 人日，另需兩星期收集。

**Files:** Create `lib/ai/operations-metrics.ts`; Modify `lib/aiops/contracts.ts`, `lib/aiops/dashboard.ts`, 原 reports UI；Test `tests/unit/ai-operations-metrics.test.ts`。

**Interfaces:** `calculateAdminImpact(input:{baselineMinutes:number;humanMinutes:number;reviewMinutes:number;reworkMinutes:number;caseCount:number;sampleCount:number}):{netMinutes:number|null;caseCount:number;sampleCount:number}`。计数按唯一 case ID；wait time 獨立，不混入人手工時。

- [x] 寫 `includes_handoffs_and_reopened_cases`：bot 成功、轉交、重開均進總案件分母；沒有時間樣本回 unknown，不套六分鐘變實測。
- [x] Run `npx vitest run tests/unit/ai-operations-metrics.test.ts`，確認初始缺功能失敗。
- [x] 設定最小資料收集：case kind、start/end、review、rework、採用／編輯／拒絕，不記原始對話正文；先使用現有 audit/run IDs。
- [x] 報表並列「估算」及「實測」，顯示樣本數、期間與缺失率；開試點前固定人工比較組。
- [x] focused test PASS，提交 `feat: measure verified administrative time savings`；營運樣本不足保留待收集，不虛構 ROI。


**計算契約：** baselineMinutes 是同類工作按樣本加權後的總基線，不是每件6分鐘常數；humanMinutes、reviewMinutes、reworkMinutes 互斥計時。無 sample 回 null；net = baseline − human − review − rework，可以為負值，不 clamp 成0。重開是同一 case 的額外工時；首次完成率和處理次數另列。兩星期基線可在工程進行時收集，試點前凍結比較口徑。


**本輪工程提交：** `2c992618c5c737b98d911c086195db312a21de6f`。154 focused、9 真隔離 DB、5 真瀏覽器通過；不可變比較組與樣本加權已實作。兩星期真實人工基線、完整非客服流程分母及 T16 發布尚未完成。

## T05 — Provider registry 和可選 OpenCode adapter

**Findings:** F-AI04、05。**估計:** 2–3 人日。

**Files:** Create `lib/ai/providers/{registry,opencode}.ts`; Modify model/provider/runtime/env、`config/agents/*`；Test `tests/unit/ai-provider-registry.test.ts`。

**Interfaces:** `ModelRoute = {key:string;provider:'openai'|'anthropic'|'opencode';protocol:'responses'|'chat-completions'|'messages';modelId:string;approvedForAdmin:boolean;supportsTools:boolean;supportsJson:boolean;pricingVersion:string;maxInputTokens:number;maxOutputTokens:number;timeoutMs:number}`；`resolveAdminModel(task:AdminAiTask,registry:Readonly<Record<AdminAiTask,ModelRoute>>):ModelRoute` 只能解析 server 白名單。不要改變外層 AgentProvider 的 guarded tool contract。

- [x] 寫 `unapproved_route_rejected_before_network`、`protocol_matches_model_route`、`client_base_url_and_model_are_rejected`；tool/JSON 不支援時不得靜默降級成不受控文字。
- [x] Run `npx vitest run tests/unit/ai-provider-registry.test.ts`，先失敗。
- [x] 用 repo 現有 SDK adapters 實作對應 protocol；如必需加入 compatible adapter，核對鎖定 SDK 相容版本。正式 Go base 固定 `https://opencode.ai/zen/go/v1`，只有用途批准時可開；Go credentials 使用獨立 server env 名稱。
- [x] 合法啟用時採真實應用 UA 與不含個資的穩定 opaque session ID；禁止改 UA 偽裝用途。所有 scheduled agents 也使用同一 registry，不再散落模型選擇。
- [x] 用 mock endpoint contract 驗 stream、JSON、tool call、429、timeout；未核准 OpenCode 行政用途保持 disabled。T05 code `d1d40fb2`：209 focused、6464 full pass／339 skip；lint/typecheck/strings/build exit0（見 `docs/audits/hkwtia-2026-10-03-full-fix/evidence/t05/verification.json`）。沒有 live provider receipt。。


**界線：** OpenCode Go adapter 是選配。文件以證據日的官方資訊為依據，實作者启用前重新查官方服務用途、protocol、model capability、資料政策與價格；不能因 API 可連通就視為批准。client 不能傳 baseURL/model/provider。fallback 也必須是已批准模型、同一資料 scope 且預算允許；不得在 timeout 可能已收費時默默再呼叫。保留 Concierge、Writer、Retention、Board 四類舊 agent 的 guards。


## T06 — 原子預算與完整用量結算

**Findings:** F-AI06。**估計:** 2–3 人日；依 T05。

**Files:** Create `lib/ai/budget.ts`, `lib/db/repos/ai-budget.ts`, `drizzle/0057_ai_budget.sql`; Modify agent-runs、runtime、pricing 及 schema-core/server-schema（依 AGENTS 分界）；Test `tests/integration/ai-budget-concurrency.test.ts`, `tests/unit/ai-usage-contract.test.ts`。

**Interfaces:** `AiBudgetRequest = {runKey:string;scope:string;maxCostMicrousd:number;expiresAt:string}`；`reserveAiBudget(input:AiBudgetRequest):Promise<{ok:true;reservationId:string}|{ok:false;reason:'BUDGET_EXCEEDED'|'CONFIG_MISSING'}>`；`AiSettlement = {reservationId:string;usageState:'known';actualMicrousd:number}|{reservationId:string;usageState:'unknown';actualMicrousd:null}`；`settleAiBudget(input:AiSettlement):Promise<void>` 冪等。金額以整數 micro-USD、DB bigint 計，JSON 邊界使用安全整数檢查；每 run/day/month 在同一 transaction 預留。

- [ ] 寫 20 concurrent reservations 不超 cap、同 runKey 只有一份預留、失敗退款／unknown 保守保留、settle 重送不重扣的 DB 測試。
- [ ] Run `npx vitest run tests/integration/ai-budget-concurrency.test.ts tests/unit/ai-usage-contract.test.ts`；隔離 DB，先明確失敗。
- [ ] provider 前按已限制的 input/output、最多8 steps 與可能重試的上限預留，不能只用平均估計就聲稱 cap 不超。每步工具回傳也算上下文上限，無足夠額度拒下一步；完成後結算。互動 deadline 20 秒，初始 output caps：concierge/support/renewal 800、application/writer 1200、board/content 1600 tokens（新設計初值；由 T13 實測調整需留紀錄）；低額度切人工／queue，不自動切未核准模型。
- [ ] AI SDK 7 `usage` 保留累計語义；加 cache/read/write、reasoning details 及 pricingVersion，避免 double-count reasoning。provider 未報 usage 記 unknown，不能成本=0就當免費。不同模型用官方計費語义對帳。
- [ ] 測并發、重試、abort、部分輸出及四種 token 明細；提交 `feat: reserve and reconcile AI operating budgets`。rollback 停新 AI 工作，不刪 budget ledger。


**AC-09/AC-10：** HTTP request abort 不等於 provider 取消；usage 未知的 reservation 不可只因 TTL 到就退款。記 accepted/providerRequestId/usage_state，對帳成功後才 settle/release；只在證明未送出請求時釋放。若 actual 超 max，完整記超支、觸發告警／停新工作，不能截斷帳目假裝未超 cap。排程、Writer、評測、embeddings/額外 judge 各自標類別及預算，不漏算背景開支。未知使用量不記免費。UTC 帳務期間與 Asia/Hong_Kong 營運報表期間明確分開。


## T07 — 版本化行政知識與檢索範圍

**Findings:** F-AI07、08。**估計:** 3–4 人日。

**Files:** Create `lib/ai/knowledge/policy.ts`, `lib/admin/knowledge-actions.ts`, `drizzle/0058_ai_knowledge_versions.sql`; Modify kb-documents／kb-search；Test `tests/unit/ai-knowledge-policy.test.ts`, `tests/integration/ai-knowledge-retrieval.test.ts`。

**Interfaces:** `KnowledgeRef = {sourceId:string;version:string;locale:'en'|'zh-HK';audience:'public'|'staff';effectiveFrom:string;effectiveTo:string|null;contentHash:string}`；`selectApprovedKnowledge({actor,locale,asOf,query}):{excerpt:string;retrievalScore:number;ref:KnowledgeRef}[]`。

- [ ] 寫過期、撤回、未批准、職員專用、跨語言矛盾、同 URL 新版本六組；public actor 不得讀 staff 政策，生效日按香港時間。
- [ ] Run focused unit/integration tests；先失敗。
- [ ] 對現有 kb_documents 添加版本／approval／audience metadata及索引；保存來源原文hash與範圍，approved→indexed；撤回即失效。舊資料先列 unverified，不默認全已批准。
- [ ] chunk 按語義段落及可追溯 offset；不盲取每塊前400字。會員費／退款等關鍵 facts 同時提供結構化欄位，保留現有公開 event 可見性規則。
- [ ] 以 12 組港英 query 證明過期與惡意來源不放行，提交 `feat: version and approve administrative knowledge`。


**AC-12：** AI runtime 檢索先以 audience／批准／effective time／locale 篩選再做向量搜尋，不能搜尋全部後只在 UI 隱藏。知識管理頁列 owner、approver、review due、superseded version、索引狀態；public 尚未補齊政策時明確 handoff。撤回或新版本生效應令依賴該來源的 draft stale，即使 query embedding 相同也不能沿用舊 cache。`retrievalScore` 只叫相關度，不作準確率。


**Focused verification:** 分別執行 `npx vitest run tests/unit/ai-knowledge-policy.test.ts tests/integration/ai-knowledge-retrieval.test.ts`；預期所有適用assertions PASS，外部guard缺失列BLOCKED。


## T08 — 共用草稿、事實校驗與人工覆核契約

**Findings:** F-AI07、09、11。**估計:** 3–4 人日；依 T06、T07。

**Files:** Create `lib/ai/drafts/{contracts,validation,service,work}.ts`, `lib/db/repos/ai-drafts.ts`, `drizzle/0059_ai_review_drafts.sql`, `components/admin/ai-review-panel.tsx`; Test `tests/unit/ai-draft-validation.test.ts`, `tests/integration/ai-draft-review.test.ts`。

**Interfaces:** `AdminAiDraft = {id:string;version:number;kind:'application'|'support'|'renewal'|'board'|'content';caseId:string;factsHash:string;ownerId:string|null;dueAt:string|null;sourceRefs:KnowledgeRef[];claims:{field:string;value:string|number|boolean|null;sourceId:string}[];body:string;state:'proposed'|'needs_review'|'approved'|'rejected'|'stale';modelRoute:string;promptVersion:string;runId:string}`。`validateDraft(draft:AdminAiDraft,facts:ApprovedFactPack):{valid:boolean;violations:{field:string;code:string}[]}`；`reviewDraft(actor:AdminActor,input:{draftId:string;expectedVersion:number;decision:'approve'|'reject';reason?:string}):Promise<{draft:AdminAiDraft;reviewId:string}>` 保存 decision，**不發送**。

- [x] 寫 wrong amount/date、unknown source、expired source、禁止模板變數、惡意 URL、缺比較期卻寫增長、XSS/MDX 字串測試；禁止關鍵事實放行。
- [x] Run unit/integration tests；寫第二位職員同時批准与 factsHash 變更測試：一個成功，另一個 conflict；失效草稿不可發送。
- [x] schema／validator 先 deterministic，必要 semantic check 只能補強、不得推翻硬性 guard；不因第二個模型說「可以」就改金額。
- [x] panel 顯示來源、facts、草稿 diff、風險、state、版本、成本；空白有原因；role 再核實；錯誤草稿提供修改／轉交。
- [x] 驗 server action 不接受 forged actor，提交 `feat: add traceable AI draft review`。rollback 停生成和新採用，既有 audit不刪。


**不得只驗模型自報 claims：** 固定金額、日期、權益、票價、容量、政策連結以 allowlisted placeholders 由應用 render；再驗最終可見正文，不允許正文另藏與 claims 不符的數字或承諾。保留必要 free text，但不提供任意 HTML/MDX/URL 執行。valid 只代表校驗通過，仍需人工 review。

**狀態契約：** proposed → needs_review（校驗通過）→ approved/rejected；source/facts/eligibility 變更 → stale。invalid 留 proposed 並附 violations，不能 approved。人工編輯增加 version、重驗、清除既有 approval；兩位覆核用 expectedVersion CAS。批准不發送；採用時及最終 effect 前再驗 actor/facts/consent/policy。以 AC-13/AC-14 驗「claims 正確而 body 错」及舊批准內容被替換的 TOCTOU。所有 decision＋audit 必須同一 transaction。


**公共 Concierge 同樣要校驗：** Modify `lib/ai/agents/concierge.ts`、`lib/ai/runtime.ts`、`lib/api/concierge-route.ts`，並維持guarded tools/來源URL白名單。Create `tests/unit/ai-concierge-grounding.test.ts`、`tests/e2e/ai-concierge-grounding.spec.ts`。抽出 `GroundedContent = Pick<AdminAiDraft,'body'|'claims'|'sourceRefs'>` 與 `validateGroundedContent(content:GroundedContent,facts:ApprovedFactPack):{valid:boolean;violations:{field:string;code:string}[]}`；`validateDraft`委派同一validator。會員費/日期等關鍵答案用應用facts渲染；server先收完整受控結果再驗，通過後才顯示正文。等待中可顯示progress，不能將未校驗token先串流給公眾再撤回。無來源/衝突/錯關鍵facts以明確handoff回應。

- [ ] 寫 `unsupported_fee_never_reaches_browser`：score=.99、claims fee=100但body=90；browser可見答案不得含90，不因高score放行；provider異常有handoff，錯字句不先stream。Run `npx vitest run tests/unit/ai-concierge-grounding.test.ts` 觀察原行為fail，再改boundary，重跑unit及 `npx playwright test tests/e2e/ai-concierge-grounding.spec.ts`。
- [ ] 在 `lib/ai/drafts/work.ts` 定義 `claimDraftWork(input:{caseId:string;factsHash:string;agentVersion:string;idempotencyKey:string}):Promise<{runId:string;disposition:'claimed'|'busy'|'reuse'|'unknown';claimToken:string|null}>`，以及 `markDraftRequestStarted(input:{runId:string;claimToken:string}):Promise<void>`、`finishDraftWork(input:{runId:string;claimToken:string;state:'succeeded'|'unknown'|'failed_before_request';draftId:string|null;providerRequestId:string|null}):Promise<void>`。重用現有durable work store或0059同一遷移加入唯一key/狀態；唯一key包含task與fact版本，狀態CAS需fencing/owner token，防舊worker覆蓋新結果。T11/T12對requesting crash驗unknown，不使用lease自動重送。


**Focused verification:** 分別執行 `npx vitest run tests/unit/ai-draft-validation.test.ts tests/integration/ai-draft-review.test.ts tests/unit/ai-concierge-grounding.test.ts`；預期所有適用assertions PASS，外部guard缺失列BLOCKED。


## T09 — 入會補件助理

**Findings:** F-AI11。**估計:** 2 人日；依 T08。

**Files:** Create `lib/ai/application-triage.ts`; Modify `lib/admin/application-case-service.ts`, `components/admin/application-case-form.tsx`；Test `tests/unit/ai-application-triage.test.ts`, `tests/e2e/ai-application-triage.spec.ts`。

**Interfaces:** `prepareApplicationDraft(actor:AdminActor,applicationId:string):Promise<AdminAiDraft>`；facts 使用現有 case reader，missingFields 由已核准表單規則決定。AI 只起草說明及建議下一步。

- [x] 寫 draft／pending_payment／pending_review 三個情境；已填欄位不可列缺件；付款處理中不可要求再次付款；不更新 membership status。
- [x] Run focused unit 先失敗，再接 T08。
- [x] case頁加「整理案件／起草補件通知」，顯示原資料與缺件 checkbox 建議；職員採用時只存跟進decision或建立既有approval。
- [x] E2E 驗修改、拒絕、facts更新使草稿stale、雙語及回頁不丟篩選；providerCalls 可stub，另以 T13真模型驗字句。
- [x] 保存前後證據，提交 `feat: assist membership application follow-up`。


**AC-05/AC-15：** 欠文件、付款 pending、審批 pending 以現有狀態規則區分，未核准政策時不能 AI 補完規則。負責人與期限變更有 audit、版本衝突；催補只建立草稿。no-profile 登入者必須能建立/恢復自己的申請而不成為 staff；已有申請重進不產生第二份（完整身份驗收由 T14A/B）。


**Focused verification:** 分別執行 `npx vitest run tests/unit/ai-application-triage.test.ts` 及 `npx playwright test tests/e2e/ai-application-triage.spec.ts`；預期所有適用assertions PASS，外部guard缺失列BLOCKED。



**本輪證據：** PR130 sourcecdd7872a；實際PG43（UI修正前，核心blobs不變）、exactCI6618pass429skip/worker57/all7、Native17入口＋13不同案件assertions（全輪13通過，原product/timing failures保留）。真模型T13／配置與其他journey gates仍未結案。

## T10 — 收件匣摘要及來源回覆

**Findings:** F-AI11。**估計:** 2–3 人日；依 T08、T18。

**Files:** Create `lib/ai/support-drafts.ts`; Modify inbox detail route、`components/admin/inbox-composer.tsx`；Create `app/[locale]/(admin)/admin/ai-review/page.tsx`; Test `tests/e2e/ai-inbox-review.spec.ts`。

**Interfaces:** `prepareSupportDraft(actor:AdminActor,conversationId:string):Promise<AdminAiDraft>`；server 為資料選擇、最小化、角色／owner篩選負責；composer 的 draft text 由職員採用後填入，不自動submit。

- [ ] 寫租戶／會員越權、要求退款、查別人 email、policy注入、舊對話變更五組；保留既有 takeover 與渠道發送限制。
- [ ] Run focused E2E 先驗功能缺失；fixtures 放隔離DB。
- [ ] 加摘要、分類、待辦、建議稿、來源及過往處理；「採用到回覆框」與「發送」是兩步，發送沿既有 action檢查consent/window/template。
- [ ] AI-review隊列用keyset分頁，按負責人／狀態／種類篩選；無生成記錄時說明 readiness，不顯示假成功；頂部顯示核准模型、預算剩餘及worker狀態，只顯示readiness而非secret。
- [ ] 接入 T18 的 `lib/admin/workspace-search.ts`，其介面為 `searchWorkspace(actor:AdminActor,input:{query:string;cursor?:string;limit:20}):Promise<{items:{kind:'member'|'company'|'application'|'event'|'conversation';id:string;label:string;href:string}[];nextCursor:string|null}>`；頂部按分類顯示結果，先授權後查詢。測跨角色對話不可被搜尋結果或計數洩露；空查詢不掃全表。
- [ ] 驗職員編輯、部分失敗、轉交、reopen及有作用域及登出清除的草稿保留（優先既有私有 server draft；未加保護不得把會員對話持久放 browser storage），提交 `feat: add grounded inbox reply assistance`。


**AC-16/AC-17：** 對話正文包含 email/電話/附件/付款片段時，server 先 allowlist 最小 facts、去識別再送核准模型，附件不得自動外傳。數字與稱呼由應用代入。統一 review queue 有 owner/due/kind/state filters、keyset、empty/error/permission states；多選覆核只接受同 kind、valid、未 stale、有權且 matching version 的草稿，逐筆回傳衝突，不假裝全成功。


**Focused verification:** 分別執行 `npx playwright test tests/e2e/ai-inbox-review.spec.ts`；預期所有適用assertions PASS，外部guard缺失列BLOCKED。


## T11 — 續會草稿及批次效能

**Findings:** F-AI03、10、11。**估計:** 3 人日；依 T03、T08。

**Files:** Modify `lib/db/repos/retention-analyst.ts`, `lib/ai/retention-analyst/service.ts`, 既有 retention approval 及 renewal batch handler；Test `tests/integration/ai-retention-batch.test.ts`。

**Interfaces:** `listCandidatePage(actor,{asOf,cursor,limit:100}) → {items,nextCursor}`；`claimDraftWork(input:{caseId:string;factsHash:string;agentVersion:string;idempotencyKey:string}):Promise<{runId:string;disposition:'claimed'|'busy'|'reuse'|'unknown';claimToken:string|null}>` 由 T08 的 `lib/ai/drafts/work.ts` 提供；這個任務只接入和驗復原，不增第二套 sender。

- [ ] 寫 1k/10k fixture、2個workers重啟、跨日重跑、已pending、已續費、撤回consent案例；同資料競爭 claim 只允許一個 caller；已完成結果重用，已開始但結果未知不自動重試（不宣稱網絡具 exactly-once 能力）。
- [ ] Run integration，記 query count／EXPLAIN；先確認目前全量掃描／重跑缺口。
- [ ] SQL 下推風險篩選、keyset100、批讀pending和claim；並發起始3、可配置但budget先限制；不能任意增加parallelism掩盖瓶頸。
- [ ] UI顯示到期原因和適用facts，核准後走現有renewal batch；send前重讀payment／entitlement／consent。
- [ ] 測試全部候選不丟／不重、按owner顯示，提交 `perf: bound and deduplicate retention drafting`。


**AC-10/AC-11：** durable work states queued/claimed/requesting/succeeded/unknown/failed_before_request；lease 到期只可重領未發請求的工作。provider 接受至保存之間 crash 不能以新 key 盲生稿；先 receipt 對帳，不能對帳則轉人工明確授權再生成並記 potential duplicate cost。1k/10k keyset 以穩定複合鍵與 asOf cutoff 驗完整集合，禁止無 LIMIT 全量 join；批查 pending，避免每候選查一次。原 membership renewal runner 與 AI retention 是兩條路徑，T14B/T15 需各量度一次。


**Focused verification:** 分別執行 `npx vitest run tests/integration/ai-retention-batch.test.ts`；預期所有適用assertions PASS，外部guard缺失列BLOCKED。


## T12 — 報告、活動及內容的雙語草稿

**Findings:** F-AI09、11。**估計:** 2–3 人日；依 T08。

**Files:** Modify `lib/ai/board-reporter/{contracts,service,render}.ts`, `lib/ai/writers/generate.ts`, reports草稿頁；Test `tests/unit/ai-admin-content-facts.test.ts`。

**Interfaces:** Board narrative 與 KPI 仍分開；透過 T08 傳 sourceRefs／claims；`prepareContentDraft(actor:AdminActor,input:{kind:'event'|'news';sourceFacts:ApprovedFactPack}):Promise<AdminAiDraft>` 只用已有核准 facts。為 staff 新增授權路徑，不繞過原 member Writer actor/quota。

- [ ] 寫0分母、無比較期、HK月界、票價HKD100不得寫90、時間／場地中英一致、中文標題不得仍自動填英文的測試。
- [ ] Run focused unit先失敗；生成的MDX按現有安全literal render，不執行模型程式碼。
- [ ] report sourceKey 的provider前claim重用已完成結果；雙語摘要由各自schema校驗；沿現有staff預覽及發布權限。
- [ ] 活動editor提供由facts起稿／翻譯，不改價格、容量、報名方式、發布checkbox；保留草稿和preview。
- [ ] 記錄正確facts／字句評測，提交 `feat: review bilingual administrative content drafts`。


**AC-18/AC-19：** event date/venue/price/capacity/registration mode 保持 typed facts；AI 翻譯不更新業務欄位。雙語各可保留草稿，公開只讀 published version；不能用 AI 生成正式機構中文名、歷史獎項或新的權益承諾。發布仍走 T17 的 preview＋CAS＋audit。


**Focused verification:** 分別執行 `npx vitest run tests/unit/ai-admin-content-facts.test.ts`；預期所有適用assertions PASS，外部guard缺失列BLOCKED。


## T13 — 模型選型、準確度及注入評測

**Findings:** F-AI12。**估計:** 2–3 人日；依 T09–T12。

**Files:** Create `evals/admin-ai.golden.jsonl`, `evals/admin-ai-runner.ts`, `tests/unit/admin-ai-grader.test.ts`; Modify `evals/grader.ts` 僅抽可重用能力，不破壞25條舊cases。

**Interfaces:** `AdminEvalCase = {id:string;task:AdminAiTask;locale:'en'|'zh-HK';facts:ApprovedFactPack;input:string;expectedClaims:AdminAiDraft['claims'];forbiddenEffects:string[];expectedDisposition:'answer'|'draft'|'handoff'|'refuse'}`；`runAdminEval(input:{routes:ModelRoute[];repeats:3;cases:AdminEvalCase[];mode:'offline'|'live';maxCostMicrousd:number}):Promise<AdminEvalReport>`；`AdminEvalReport = {results:{caseId:string;routeKey:string;repeat:number;passed:boolean;violations:string[];latencyMs:number;costMicrousd:number|null}[];startedAt:string;sourceSha:string}`，分布統計由results計算。provider可mock；live另用既有guard與明确總budget。

- [ ] 寫 grader 對錯誤金額、越權、虛構source、invalid JSON、過期政策、人工作用missing 六種必定fail；LLM judge不能覆蓋硬性fail。
- [ ] 擴到至少60條，涵蓋港英、缺失、衝突、拒答、注入、handoff；保留25舊Concierge cases獨立報告。
- [ ] 在核准模型與合成／最小化資料上，baseline＋最多2候選、每題3次；live key不存在時標blocked，不用mock成績冒充。
- [ ] 人工盲評grounding與語言；输出sample count、agreement、95% interval、p50/p95、實際cost／completed case、重試率；依下述門檻決定各 task 的 model，分 task/locale 提供樣本，不能只以總平均掩盖差子群。
- [ ] Run `npx vitest run tests/unit/admin-ai-grader.test.ts` 和新runner；保存原始去識別結果，提交 `test: evaluate administrative AI with grounded cases`。


**AC-22 與放行門檻（設計目標，不是目前成績）：** 至少60個 gold cases，每個核准候選重複3次；舊25題另報。嚴重越權／外洩／未授權 effect=0，關鍵受控 facts 100%一致，grounded correctness 點估計≥95%、首次JSON≥99%；每項同報樣本與95%區間，低樣本不可宣稱真實母體準確率。LLM judge不能推翻 deterministic fail；至少兩位 reviewer 抽驗有分歧案例。互動草稿 p95≤12秒、20秒內timeout安全降級。候選若未通過則維持人工／已核准 baseline，不為了便宜放寬 guards。

新增 scripts 由此任務在 `package.json` 定義：`eval:admin`（offline）與 `eval:admin:live`（顯式 live guard＋總成本上限）；執行前先 validate corpus 不含真會員資訊。缺 live key 時 exit/報告 BLOCKED，不能 skip→PASS。每 run 帶 source/model/provider/pricing/prompt/policy 版本與輸入hash，不存未去識別原文。


## T14A — 會員／職員登入入口、Google 與電郵登入連結

**Findings:** F-AI14、O04、O09；**依賴:** T00；**估計:** 2–3 人日。這是優先主流程，不等 AI 完成。

**Files:** Modify T00 source-map 已核實的 login/register/callback/returnTo、admin-login 及 header/footer；不可另造 Auth provider。Create `tests/e2e/full-fix-auth.spec.ts`、`tests/unit/full-fix-return-to.test.ts`；兩個 messages 同步。

**Interfaces:** 沿用現有 session/role。新 `resolveSafeReturnTo(input:{requested:string|null;locale:'en'|'zh-HK';isStaff:boolean}):string` 放 `lib/auth/safe-return-to.ts`（若已有同義 helper，修改原 helper 並更新 source-map）；只接受本地允許路徑，admin destination 仍在目的地 requireAdmin，returnTo 不是權限。

- [ ] 寫 AC-01–04/UC-29–30：有 fresh Google 新身份、no-profile、已存在會員；magic link有效/過期/重播/另一device；`//evil.test`、encoded URL、跨 locale returnTo；member 深層 admin 被拒。逐案斷言身份/role/redirect/持久資料，不只看HTTP200。
- [ ] Run `npx vitest run tests/unit/full-fix-return-to.test.ts`；先確認真實行为缺口，再修。fresh provider E2E 用隔離 Auth 與核准 test identity/recipient，不能注入 session 後稱登入已過。
- [ ] `/zh/admin-login` 明確標「職員登入」，電郵登入連結優先、Google 次選；寄出後顯示目的信箱（適當遮罩）、倒數/再寄、垃圾郵件提示、改電郵及支援。統一防 enumeration 文案、rate limit、單次 token。保留 footer 職員入口；登入成功後 staff 有「管理後台」入口，member 去會員區。
- [ ] 修正帳戶恢復/身份連結缺口；Google email 相同不自動合併未驗帳戶或授予staff；使用 provider 支持的 verified linking/重新驗證機制。logout 清私有cache，過期session保留合法目的頁。
- [ ] Run `npx playwright test tests/e2e/full-fix-auth.spec.ts`；provider 若需人手 challenge，保留 handoff及receipt，不繞過。Commit `fix: complete member and staff sign-in journeys`。

## T14B — 入會、補件、審批、權益及續會生命週期

**Findings:** F-AI14、O03、O06、O07、O12、O13；**依賴:** T14A；worker/batch聯合驗收另需T02/T03；**估計:** 2–3 人日（發現新的業務缺陷另列修復增量）。

**Files:** Modify T00 map 的 membership lifecycle/application/billing/grants/renewal services 和表單；Create `tests/e2e/full-fix-membership.spec.ts`、`tests/integration/full-fix-membership-lifecycle.test.ts`。既有 states/transition tables 不改名。

**Interfaces:** provider-confirmed payment attempt 與 entitlement transaction 沿用既有 signature；policy acceptance 存 policyVersion/acceptedAt/actor。任何新 mapper 簽名記到 source-map，不讓 UI自己計到期日或判 paid。

- [ ] 寫 UC-31/32、AC-05/11/15：新會員填寫→中斷→恢復→提交→補件→審批；相同 submit idempotent；付款pending不啟用且不叫再付；需要人工核准的 tier 不因付款跳過審批。
- [ ] 寫有限期 grant 開始/結束/HK月界、公司席位上限、已有paid會員續會、past_due/expired恢復、不重疊/倒退entitlement期間；期限規則取核准政策 fixtures，沒有決策就不生成正式新規則。
- [ ] Run `npx vitest run tests/integration/full-fix-membership-lifecycle.test.ts`，在隔離DB及Stripe TEST重現失败；修 server transaction、冪等鍵、明確member狀態與下一步。
- [ ] 已有 paid/unapplied 修復及 refund pending 對帳沿原管理工作，不直接手改 paid 欄位。職員 Member360 一頁列 application/payment/entitlement、owner、期限、時間線；支援依case追溯，不靠工程師查DB。
- [ ] Run `npx playwright test tests/e2e/full-fix-membership.spec.ts`；保存 webhook/entitlement/receipt關聯，驗同一事件兩次只有一次權益。Commit `fix: verify membership onboarding and renewal lifecycle`。

## T14C — 活動報名、名額、付款、退款及票券

**Findings:** F-AI14、F-AI11；**依賴:** T14A；worker/batch聯合驗收另需T02/T03；**估計:** 2–3 人日。

**Files:** Modify T00 map 的 event mode/registration/checkout/webhook/refund/ticket services；Create `tests/integration/full-fix-event-payment.test.ts`、`tests/e2e/full-fix-events.spec.ts`。

**Interfaces:** 保留 local/free、external、paid 的實際 mode enum；外部報名連結由staff allowlist/驗證，不能誤建立local paid order。金額/貨幣/名額取DB且由server送provider。退款完成依provider receipt，不依點按成功toast。

- [ ] 寫 UC-32/33、AC-20：最後1席同時2人報名只有1筆有效allocation；重播checkout/webhook不重建票；亂序事件不令paid倒退pending；支付成功晚於hold過期有明確人工對帳政策，不靜默超賣或吞款。
- [ ] Run `npx vitest run tests/integration/full-fix-event-payment.test.ts`；Stripe TEST測成功/取消/失敗/延遲、簽章錯誤、錯金額/貨幣、duplicate/亂序webhook。失敗或pending退款不可提前標refunded。
- [ ] 按核准政策測全額退款、部分退款（只有既有政策支援才測啟用）、活動取消及票券失效；多次重發票沿原sender防重。使用者頁展示registration/order/ticket各自狀態和支援reference。
- [ ] 開event editor驗必要欄位、日期時區、模式切換、preview/發布；保留demo公開排除。未發布/已過期/已售罄顯示合理狀態，server阻止繞UI下單。
- [ ] Run `npx playwright test tests/e2e/full-fix-events.spec.ts`；未支援partial refund寫NOT_APPLICABLE＋policy依據。Commit `fix: validate event registration and payment recovery`。

## T14D — 通訊送達、同意、人工接手與結果不明復原

**Findings:** F-AI03、F-AI14、O05、O11；**依賴:** T02、T03、T14A；**估計:** 1–2 人日，另需 provider receipt。

**Files:** Modify T00 map 的 outbox/channel/inbox/journey dispatch與reconciliation；Create `tests/integration/full-fix-delivery-recovery.test.ts`、`tests/e2e/full-fix-support.spec.ts`。

**Interfaces:** 復用 outbox effect/idempotency/providerMessageId；`accepted`不等於`delivered`，mock/sink 不等於real provider。manual takeover 狀態由既有service控制，不能在AI側獨自變更。

- [ ] 寫 UC-07/35/38、AC-21：accepted→timeout→delivered；not-accepted可安全retry；worker crash；STOP/退訂到達預覽後、發送前；再次同文合理回覆不能被永久去重吞掉。
- [ ] Run `npx vitest run tests/integration/full-fix-delivery-recovery.test.ts`；先sink重現；需要真provider時用明確核准test recipient取得masked receipt，不發真會員。
- [ ] unknown停在可見對帳隊列；已送不重發，不改新attempt key逃過冪等；不能以catch後delivered=true收尾。停sender時保留queued/unknown，復原逐筆分類。
- [ ] 測bounce、invalid recipient、template未批准/錯locale、WhatsApp window不合、human takeover、reopen、reply權限；介面給owner/next action，不只顯示失敗。
- [ ] Run `npx playwright test tests/e2e/full-fix-support.spec.ts`；將sink與真provider分列，Commit `fix: make administrative delivery failures recoverable`。


## T17 — 公開內容、CMS 草稿／發布與歷史回歸

**Findings:** F-AI14、O01、O06、O08、O14；**依賴:** T00；**估計:** 2–3 人日。

**Files:** Modify T00 map 的 news/page-copy/media/event editor/private drafts/publish actions；Read `docs/wtia-programme-claims-review.md`（若當前存在）；Create `tests/e2e/full-fix-content-maintenance.spec.ts`、`tests/integration/full-fix-cms-visibility.test.ts`、`docs/audits/hkwtia-2026-10-03-full-fix/content-signoff.csv`。

**Interfaces:** 沿用既有 draft/version/published/CAS 及 `CMS_SERVER_DRAFTS_ENABLED`，不創作第二個草稿表。每內容欄位的source/owner/approval/version記content-signoff；未批准中文品牌名及會員政策顯示待決，不自行翻譯定案。

- [ ] 寫 AC-18/19：編輯→返回list→繼續、刷新/斷網/雙tab版本衝突、未儲存導航、中英分開草稿；private draft不能在公開HTML/API/cache/sitemap露出；正式仍是舊published version。
- [ ] Run `npx vitest run tests/integration/full-fix-cms-visibility.test.ts`；先失敗再修。publish按expectedVersion CAS＋audit同transaction，invalidate只影響相關public cache；archive引用中的media須拒絕或明確處理。
- [ ] 列出主要public頁（首頁、about、membership/join、events、news、programmes、contact、privacy）實際route，中英逐頁查空白/placeholder/CTA/metadata/links；不猜路徑。歷史programme claim以核准原始來源與corrected claim review為準，舊audit不是歷史事實來源。
- [ ] 驗會員profiles/active memberships/company seats語義及數字；79 partner links若無核准URL保持無外鏈，不捏造網址。demo exclusion原本通過須仍通過。
- [ ] Run `npx playwright test tests/e2e/full-fix-content-maintenance.spec.ts`、`npm run audit:strings`；content owner未批准部分列BLOCKED，不自改品牌與政策。Commit `fix: complete bilingual content maintenance workflows`。

## T18 — SaaS 工作台、批次操作導向及職員 SOP

**Findings:** F-AI11、F-AI13、F-AI14、O07、O09、O10；**依賴:** T00；**估計:** 2–3 人日；最終SOP驗收在G5。

**Files:** Modify T00 map 的 admin layout/sidebar/dashboard/member list/segment list/case panel；Create `lib/admin/workspace-search.ts`、`tests/e2e/full-fix-admin-workspace.spec.ts`、`tests/integration/full-fix-workspace-search.test.ts`、`docs/audits/hkwtia-2026-10-03-full-fix/operations-handbook.md`。

**Interfaces:** `searchWorkspace(actor:AdminActor,input:{query:string;cursor?:string;limit:20}):Promise<{items:{kind:'member'|'company'|'application'|'event'|'conversation';id:string;label:string;href:string}[];nextCursor:string|null}>`。DB先按actor/權限過濾，不能先查全量再UI遮；空/過長query不掃全表。只用既有role/capability，不另造frontend superadmin bool。

- [ ] 寫 AC-06/07/17/24：mine空但unassigned非空有明確入口；owner/due/overdue清楚；search counts/snippets也不能洩漏跨權限資料；51/101筆segment同sort值翻頁無重漏；URL保留filters/sort/cursor並支援返回。
- [ ] Run `npx vitest run tests/integration/full-fix-workspace-search.test.ts`；先失敗後實作role-scoped search。頂部結果按entity分類；沒有結果、服務失效及無權不同文案，不用「0」代替讀取失敗。
- [ ] 保留六組導航並以真工作命名：今日工作、會員及申請、通訊支援、活動內容、報告、設定/健康（實際名稱跟locale bundle）；顯示未指派/逾期/失敗，不建立另一套聊天首頁。member搜尋與global搜尋明確分別；worker/batch/AI-review各能回原案。
- [ ] 批次selection/bar與row action可由鍵盤操作；預設目前頁，多頁全篩選須明確確認；關閉能力仍可讀歷史和停用原因；save/retry/export有進度及逐筆結果。dangerous權益/財務動作用既有高權限與review，AI不新增捷徑。
- [ ] 寫操作手冊：每日登入→worker異常→逾期/未指派→補件/回覆→批次預覽→部分失敗/unknown對帳→交班；每週policy到期/錯誤抽樣；每月續會/KPI/費用。每流程附入口、必需role、正常結果、錯誤復原、證據reference。
- [ ] Run `npx playwright test tests/e2e/full-fix-admin-workspace.spec.ts`；3–5位職員在G5各自完成補件、回覆、50筆batch預覽/失敗復原及CMS發布，記完成率/時間/誤操作/需工程師協助次數。目標每項關鍵任務可獨立完成、0不可逆誤操作；未達即修UI/SOP再驗。Commit `feat: complete the administrative daily workspace`。


## T15 — 效能、鍵盤與維護效率

**Findings:** F-AI10、11、14。**估計:** 2–3 人日；依 T03、T09–T12、T14A–D、T17、T18。

**Files:** 原會員list／inbox／reports queries和各UI；Create `tests/e2e/ai-admin-usability.spec.ts`，使用現有Lighthouse及axe設定。

**Interfaces:** `operationId`串request、DB、model、draft、batch回執；metric無PII。公開及私有快取界線不改。

- [ ] 以1k／10k合成會員測搜尋、keyset分頁、報告、draftqueue；記queries、p95、payload和heap，測所有篩選結果不重不漏。
- [ ] 香港及新加坡各三次冷／暖載入並記網絡設定；補RUM后才作region决定，不能用工具等候時間代替LCP或INP。
- [ ] 1440px／390px、Tab／Shift-Tab／Esc、focus return、表格橫向及drawer；serious/critical axe0只是最低自動門檻，另真人完成案件任務。
- [ ] 3–5位職員完成補件、回覆、50筆預览／失敗復原，記time-on-task及錯誤；預設scope、數字、draft來源必須可理解。
- [ ] Run相關test及 `npm run test:lighthouse`，以實測瓶頸修query／payload，不盲目加全站cache；提交 `perf: improve measured administrative workflows`。


**AC-23 與效能 gate：** 表格預設50/最多100筆、keyset不漏不重；10k synthetic資料每個list/search request不載入全表。先記baseline，再設定同環境list/search server p95≤1秒、首個可操作畫面≤3秒的初始目標；不能以加 timeout/只減 fixture 通過。HK公開RUM p75 LCP≤2.5s、INP≤200ms、CLS≤0.1（觀察目標）；sample不足須標unknown，lab不可冒充RUM。保留原 Lighthouse thresholds，不調低；定位query count/EXPLAIN/TTFB/payload再優化，私人資料不進共享cache。不同使用者輪流登入同browser不見前一人資料。真 screen-reader驗 labels、error summary、live progress；自動axe0不能宣稱全部WCAG通過。


**Focused verification:** 分別執行 `npx playwright test tests/e2e/ai-admin-usability.spec.ts`；預期所有適用assertions PASS，外部guard缺失列BLOCKED。


## T16 — 發佈證據、分能力啟用、試點及回退

**Findings:** 全部；**依賴:** 全部必要任務，Go可明確不採用；**估計:** 1–2 人日＋觀察期。

**Files:** Create/update `docs/audits/hkwtia-2026-10-03-full-fix/{status.csv,acceptance.csv,rollout.md,rollback.md,release-manifest.json,runbook.md}`；原CI保持quality必需成功，不能用skip繞gate。

**Interfaces:** release manifest `{appSha,workerSha,deployments,migrationLedger,bindingSummary,capabilities,providerModes,modelVersions,promptVersions,policyVersions,approval,evidence}`；秘密只記presence/來源，不寫值。finding→task→case→receipt雙向可查。

- [ ] 單次完整必要suite跑到結束，分列pass/fail/blocked/skip；保存原失敗與定向rerun，不能相加稱一輪全綠。適用test guard缺參數是BLOCKED，不是PASS。
- [ ] 演練additive migration：備份/restore證據→空DB/基線DB升級→journal一致→新web/worker→舊相容版本讀寫→fault recovery。回退保留schema、audit、outbox、budget、claims與未完成付款，禁止DROP抹掉新交易。
- [ ] 完成readiness及隔離preview，用positive marker驗runtime DB；2個worker窗口；magic link/Google、TEST付款、真test sender、所有新增AC與旧UC證據；準備具體可review的release scope與rollback owner，才提交發佈決定。
- [ ] 在已有正式部署授權範圍內依次啟用：相容schema→web安全降級/入口→服務身份及scoped worker→無副作用UI→export/profile_patch→import→finite grants/通訊/票券等各自gate。不可只因ADMIN_BATCH_ENABLED=1一次開所有operation flags。
- [ ] AI先2名staff、每日最多50宗、draft-only一週；先application/support，再renewal/board/content；不自動核准/送出/發布。各task model未過T13不可啟用；Go未核准保持off。
- [ ] 正式smoke只用已核准測試身份／對象；每階段看5xx、queue lag、unknown、成本、grounding、錯誤收款/權益/權限。任何重大越權/外洩/錯金額、超預算或重複effect立即pause相關writer/dequeue並保留人工流程，先對帳再復原。
- [ ] 一週試點核對人工基線、review/rework、完成率、policy版本、provider帳單；ROI無樣本不可宣稱。職員獨立SOP完成後才標operational PASS。Commit `docs: record full remediation release and recovery evidence`。

**回退不是取消已發效果：** 停新generation/new batch commit/sender dequeue；已accepted或unknown先provider核實。切至已證相容web/worker版本；DB採forward repair，保留所有receipt。內容可回發布版本、AI可關閉而人工操作正常；已發信、付款或退款不能用git revert撤回。


## 測試命令、證據及每日交接

以下基於 ZIP 的 package/CI；T00 必須核對 current HEAD。單元/integration先 focused red→green，再按repo gate完整檢查；不因外部限流默默放寬原timeout、刪斷言或cache session。新bug的測試在一次受控回退/缺陷注入時仍能抓到違規。

```bash
npm ci
npm run audit:strings
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
npm ci --prefix workers
npm --prefix workers run typecheck
npm --prefix workers test
```

`npm run test:e2e`、`npm run test:lighthouse` 用已確認隔離的部署/fixtures；大套件可採repo既有shards，輸出同一source與collection。`npm run eval:concierge` 保留舊25題；`npm run eval:concierge:live` 只在核准provider/budget/guard齊備時。T13新增的 `npm run eval:admin`／`npm run eval:admin:live` 在該task完成後才存在。

`npm run db:migrate`、`db:seed` 不是普通無副作用檢查。只在確認隔離目標設定好後執行，遵循AGENTS的DATABASE_URL_TEST/allowlist/非Production guard；測試缺URL不得碰正式DB。新增fixtures全部`.example.test`、無真個資，cleanup只刪owned測試資料，保留故障證據。

每task最少receipt：`taskId/caseIds/findingIds/sourceSha/environment/bindingProof/command/startedAt/exitCode/result/evidencePath/limits`。E2E另外附role、步驟、expected/actual、screenshot/trace、provider effect狀態；AI附model/prompt/policy/pricing版本；DB附query plan/rows/boundedness。log不含token、secret、原始會員對話或完整付款資料。

每日交接只需：已完成task/commit、下一個可執行task、未解blocker、原始fail與rerun、哪些能力仍disabled。不要把「已寫code」「已合併」「已部署」「職員已實際用過」合成一個Done。

## 歷史回歸追蹤及驗收矩陣

同包 `HKWTIA_Full_Fix_Traceability_2026-10-03.csv` 涵蓋全部 F-AI01–14 與 O01–14；`HKWTIA_Full_Fix_Acceptance_2026-10-03.csv` 保留原40個UC的歷史狀態，新增24個AC的fixtures/steps/assertions，全部新run狀態初始化NOT_TESTED。舊PASS是當時有限scope，不自動繼承為新release PASS。

最少必過主旅程：訪客→Google或電郵登入→新profile→入會草稿/恢復→提交/補件→按政策付款/審批→有效會員→續會→過期恢復；staff登入→今日工作→owner/SLA→補件/客服草稿→覆核→手動發送→送達/unknown復原；活動建立→草稿/發布→報名/付款→票券→取消/退款；CSV預覽→衝突解決→分批執行→部分失敗復原；內容雙語草稿→preview→發布→回退。每條都要有負向權限及中斷恢復案例。

## 工程排期與交付界線

22項任務合計約 **42–63 工程人日**；逐項工時見 tasks CSV。它是根據現有證據的工程估算，包含開發/定向驗收，不是模型運行時間或交付日期承諾；未知回歸缺陷需追加具體ticket。兩個worker窗口、兩星期人工基線、一星期試點、Auth/provider與政策批准是日曆前置，不能用人日相加消除。

先交可review的 G1 核心修復，再分能力G2與G3/G4；全面發佈只在G5/G6證據齊備後。遇到外部阻礙，完成不依賴它的工作並交付具體blocked清單；不要提前寫『已full fix』。

## 給 Codex 的執行起點

把同包 `HKWTIA_Codex_GPT_6_1_Sol_Start_Prompt_2026-10-03.txt` 與原始 evidence ZIP 一起交給 Codex。起點是 T00 → T01，再按dependencies推進；執行時持續更新status，不在每個小task完成後反覆問是否繼續。只有涉及尚未授權的外部effects/正式release，才以完成的preview、測試證據和回退方案作最後決定。

## T06 本輪執行紀錄

- [x] 原子ledger／20 concurrent／重播與unknown TTL的實際PG行為驗證。
- [x] 四agent、Writer原quota、SDK7 aggregate/cache/reasoning、receipt-before-body。
- [x] embedding、背景evaluation及judge同一budget；20秒deadline與穩定人工fallback。
- [x] 相容停用生成／保留帳本及填有歷史資料的0056→0057向前演練。
- [x] 確認隔離Neon套用0057（ledger56→57，零provider request，profiles數量不變）。
- [x] 最終完整gate／source review（6490 pass／355 skip；focused267／PG16）；Preview候選另記實際receipt。
- [ ] 真provider帳單、owner上限及正式capability發布（精確owner gate已記錄，不計為pass）。

## T07 執行記錄（2026-10-04續接）

- [x] actual SQL legacy/scope及NULL provenance先RED再修；Unicode hash/offset由DB核對。
- [x] Approved version／owner／configured approver／HK dates／cross-locale facts／version CAS／withdraw及existing KB檢索。
- [x] 12港英query與31actual PG pass0skip；accepted embedding timeout不自動重試。
- [x] 207focused pass0skip；各server action自己取actor；golden原字節與業務期待保留。
- [x] 已確認隔離Neon套用0058（ledger57→58／零provider），來源管理中英入口及SOP。
- [ ] 完整gate／本次exact-source Preview／新same-origin實際synthetic角色及來源維護验收。
- [ ] 真embedding invoice、政策owner核准、T08最終正文與draft stale、T13模型安全及正式能力發布。


### T07 final engineering evidence — 2026-10-04 Hong Kong

- [x] Exact source7c6b0844: local full6514 pass/386 guarded skips/0fail, serial3440.48s; CI37137557588 shards6514pass386skip, worker57pass. Earlier9 inventory failures and incomplete memory-pressure run retained separately.
- [x] Typecheck/build/strings exit0; lint0errors,82 existing warnings plus1 ignored reproduction helper warning.
- [x] Confirmed isolated PG31pass0skip, Neon0058 ledger58, exact-source Preview dpl_6XKCHM3VhF8bskXb7rb7g8Pa6gFT baseline17+knowledge12 native checks. HK dates, keyboard/mobile, source creation/separate approval/withdrawal; no provider/payment/messages.
- [ ] Actual approved embedding provider/invoice, association source/approver policy, T08/T13 final-body/stale draft/real-model safety, and specific Production release authorization.

- [x] Final T07 URL review correction a49e6629:5 actual RED,53focused,31actual PG, full CI6520pass386skip0fail plus worker57; lint/typecheck/build/strings passed in exact-source CI. Refreshed exact-source Preview native17+12, dpl_3roUp1uVnxwpNQehBSvqCHVhxToW. Earlier7c local serial run remains its own historical receipt.

## T08 本輪工程驗證

- [x] 四個 actual Concierge/runtime final-body RED→GREEN；錯90不delta、不保存；provider完成成本不退款。
- [x] SQL concurrent review/facts stale/adoption audit與不可改寫歷史；durable work/requesting unknown/回執綁定；最新30actual PG。
- [x] 510 broad focused及final89（含PG30）全部0skip；lint/typecheck/strings/build0。
- [x] 已確認隔離Neon0059（58→59、profiles不變、零provider）。
- [x] T08 exact9cf full CI6567pass416skip、worker57、native Preview17+12及mobile44px；receipt見evidence/t08。
- [ ] T09–T12業務facts/生成、T13真模型、T14D送達及正式release各自驗證。
