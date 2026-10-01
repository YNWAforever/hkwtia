# HKWTIA Full Remediation Implementation Plan — Codex GPT-6.1 Sol

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 使用者指定 Codex GPT-6.1 Sol；本計劃預設由該執行者依序完成，不要求另開代理。

**Goal:** 修復 2026-10-01 審核的 14 項問題並完成 60 項流程驗收，讓職員能以清晰的 SaaS 後台處理入會、續會、活動收款、支援、內容及批次維護。

**Architecture:** 保留既有 Next.js App Router、Neon Auth／Postgres、Drizzle、Stripe、既有 worker／outbox 及角色模型。以相同 server-side domain service 統一新舊入口，沿用現有批次、匯入、grant 及 campaign review 功能；新增 case、健康狀態及 CMS 草稿只補現有缺口。UI 從已授權的 view model 取得狀態，任何修改仍由 server action 重新驗證身份、權限、版本及業務條件。

**Tech Stack:** 審核 checkout 的 lockfile：Next 16.3.6、React 19.2.7、TypeScript 5.8.3、Neon Auth 0.5.0-beta、Drizzle ORM 0.45.2、Stripe SDK 22.3.1、Vitest 3.2.7、Playwright 1.61.1；Tailwind、shadcn/ui、next-intl。這是固定基準，並非升級要求。

**Spec:** 隨包的 `inputs/HKWTIA_Audit_Evidence_2026-10-01.zip`，內含 `HKWTIA_Audit_2026-10-01_zhHK.md`、`HKWTIA_Maintenance_and_Remediation_2026-10-01_zhHK.md`、`HKWTIA_UAT_2026-10-01.csv`、截圖及 logs。執行時先解壓閱讀。推薦把本計劃複製到 repository 的 `docs/superpowers/plans/2026-10-01-hkwtia-full-remediation.md`，更新進度並保留證據引用。

日期：2026-10-01，Asia/Hong_Kong。這次交付是實施計劃，未執行應用修改、資料遷移、部署或功能開關變更。

## Global Constraints

- 僅目標 repository `https://github.com/YNWAforever/hkwtia`，正式網站 `https://hkwtia.vercel.app/`；不得套用其他 WTIA／WiseTech repository。
- 證據 SHA `60a272b68c334d256d578ade36d8e24ca3be5485`；審核時 production SHA `e7fa4add247489f525f015007460fb522fb1531b`、deployment `dpl_GYj8pTrvHxSZRDszXnVnCtkDS8rV`。兩者差 4 個文件 commits；執行當天必須重新核對，不能強制 reset 最新 main。
- 輸入 ZIP SHA-256：`1d3f95facf08c377660d56b3f5cd17df62fe3405b8771f2b360985eb20d95112`。原始證據保持不變；修復後 evidence 另存。
- 先讀 `AGENTS.md` 及相關子目錄規則；Next 行為以安裝版本 `node_modules/next/dist/docs/` 為依據。以 lockfile 安裝；不把框架升級或 Auth 遷移混入此修正。
- 中英文字分別在 `messages/en.json`、`messages/zh-HK.json`；locale `zh-HK` 的公開 URL prefix 是 `/zh`，使用既有 localizedPath，不手拼 `/zh-HK/`。
- 保持 Server Components 預設；DB／Auth／Stripe 只在 server。runtime schema 從 `lib/db/server-schema.ts` 匯入，build-time schema 在 `lib/db/schema-core.ts`。
- `use server` exports 必須從 session 取 actor，不能接收 client 提供的 actor、role、批准人或 membershipStatus 作授權依據。
- 個人資料修正不可順便改 email、role、consent 或 billing；機構 owner/admin、一般席位及個人 owner 需分別授權。
- 所有寫入驗收在確認隔離的 DB/Auth、Stripe test mode 及指定測試收件人執行。`.example.test` 合成電郵不能拿來驗真實送達；送達測試另用明確 allowlist。
- 保留 5,000 max items、50 claim size、最多 5 attempts、預覽 default TTL 30 分鐘的現有批次契約；若要變更需獨立性能證據與決定。
- 不自動更改正式價格、退款／續費條款、既有免費權益、成員角色、provider live mode 或 production flags；政策依賴不阻擋其他可完成工作。
- 「已開發、已部署、已啟用、已驗收」分開記錄。171 skipped、mock、空列表或綠色 toast 不是 provider 或交易驗收證明。

## Review Focus

| 容易遺漏的條件 | 合理預期 | 負責任務／測試 |
|---|---|---|
| 同一電郵經 Google 與 magic link 回來、邀請與登入同時發生 | 不因電郵相同自動合併不可信 identity，不重複 profile／權益 | T05 `identityCollisionDoesNotEscalate`；U03–U06 |
| 預覽後有人改資料或被撤權 | 不覆蓋新值，不沿用舊權限執行 | T06／T13／T14 CAS 與角色撤銷；U24、U29 |
| Provider 已接收，但 worker 失去回應或 crash | 先對帳未知結果，不製造重複信、款或票 | T11／T14／T16 故障注入；U30、U40–U43 |
| 香港時間跨日、到期邊界與補跑排程 | 同一到期 episode 不漏發、不重發，金額與狀態不倒退 | T08／T12 冷凍 clock 與補跑；U17–U21、U51 |
| Back／Forward、雙視窗及本機儲存失敗 | 草稿可恢復；衝突明示，不 last-write-wins | T04／T17 真瀏覽器與 CAS；U46–U48 |

## 1. 範圍、證據及完成定義

**Full fix 指所有 O01–O14 均有修正或新證據證明已修，U01–U60 均有執行結果。** 未執行的 provider／政策依賴必須顯示 blocked 並列具體解除條件；不得把這種交付寫成「全部修復完成」。已通過且無需修改的功能保留，補可靠驗收即可。

| 類型 | 審核證據 | 本計劃處理 |
|---|---|---|
| 正式可重現 | O01 中文亂碼、O02 停用選取困惑、O08 CMS 返回遺失 | 優先重現、測試修復及雙語畫面驗收 |
| 源碼規則／能力缺口 | O03 舊 comp、O10 cursor、O11 舊 Queue、O12 billing、O13 查詢 | 用隔離資料及真 domain/repository 重現，再做最小修正 |
| 業務營運／內容 | O06 政策、O07 申請個案、O09 SaaS UX、O14 對外內容 | 明確 UI 與資料契約，政策由 WTIA 批准 |
| 未完成驗收 | O04 新身份、O05 worker／provider；支付活動與批次 UAT | 接通真隔離環境取 receipts，依失敗根因修復 |

既有職員電郵登入已成功。Google 裝置密碼金鑰受阻不是 WTIA callback 缺陷證明。公開 0 活動因 demo exclusion，79 夥伴已恢復；均不可重報舊 bug。HTTP 約 8 秒大量落在 TLS，不能當純 app/DB 延遲；先量度再優化。

## 2. 子項目及依賴次序

本計劃拆成可獨立審核及發布的子項目；不是一次替換全站的大 PR。

| 階段 | 任務 | 交付／退出條件 |
|---|---|---|
| A 基準及快修 | T00 → T01、T02、T03、T04 | 4 個可重現 UI 問題有 focused tests 與 screenshot |
| B 身份及治理 | T05、T06、T07、T08、T09 | 登入不擴權；新舊 grant／通訊走同一規則；billing 可復原；政策機制可用 |
| C 營運可靠性 | T10、T11、T12、T13、T14、T15、T16 | 申請／worker／renewal／batch／import／ticket 具交易與故障證據 |
| D SaaS 可用性 | T17、T18、T19、T20、T21 | 內容與每日工作可獨立完成；雙語、手機、鍵盤與效能達標 |
| E 整體驗收與發布 | T22 → T23 | 60 UAT 結果、migration/rollback 演練、正式版本與 flags readback |

可先做不依賴業務決策的工作；T09 政策未批准只阻擋相關 checkout／審批／自動發送推出，不阻擋亂碼、CMS、分頁、健康監察等。每任務依賴見下表；執行者可重排無依賴任務，但不得跳過 gate。

## 3. 統一任務執行方式

每任務先讀現有實作及相鄰測試；若已修，寫 revalidation evidence，不重做。新增介面下文標示為「擬新增」；先找等價契約，有則直接擴充並記錄 mapping，不建立第二套來源。

程式任務用真行為的 Red → Green 流程，紅燈必須是目標行為失敗，不能是 module not found。UI、權限、交易、並發及冪等需要測試；純文字／文件修改以內容核對與預覽足夠，不寫鏡像實作的測試。每任務完成後提交列明的檔案，使用 conventional commit；不要 `git add .` 收入 secrets／trace／他人工作。

以下 `npm exec -- vitest run ...` 與 `npm run test:e2e -- ...` 是目標測試命令；新增測試檔由該任務建立。E2E 必須確認 `PLAYWRIGHT_BASE_URL` 指向自己的 app 和隔離 provider；不能因 reuseExistingServer 測錯站。無環境則記 blocked，先完成所有其他任務。


## 4. 可執行任務

### T00 · 核對版本、環境及隔離 fixture

**依賴：** 無。**對應：** O01–O14；U01–U60。

**檔案及責任：**

- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/baseline.md`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/status.csv`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/fixtures/full-remediation-fixture.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 消費原始 ZIP 與當前 git/deployment；產生 baseline（repo、branch、SHA、dirty files、lockfile、app/worker SHA、migration ledger、flags 狀態、provider mode）及 O/U 狀態台帳。只列設定名稱和狀態，不能保存值。fixture 擬新增 seedFullRemediationFixtures(options: {confirmedIsolated: true; runId: string}): Promise<{runId: string; counts: Record<string, number>}>，沿用現有 seed safety guards，不接受 production host。

- [ ] **建立行為證據：** fixture 拒絕未確認或 production；同 runId 重跑不重複。提供四角色、公司三角色、新舊 identity、付款／會籍各狀態、51/101 分群、50/500/5000 batch；固定 clock 測日期邊界。
- [ ] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 先 git status、核對 remote/最新 main，保留現有工作並用獨立 worktree。逐項標 reproducible/source-confirmed/already-fixed/unverified。讀完整 AGENTS、現有 fixtures、migration 及 release 文件；建立隔離 DB/Auth/provider allowlist。優先重用 M2、audit-batch、audit-import、audit-grant fixtures；新 fixture 只補缺口，不 fork 一套系統。記錄已知 6097 pass/171 skip 是舊基線，不當本次新結果。
- [ ] **驗證：** git status --short；git rev-parse HEAD；git remote -v（報告遮罩 credentials）；npm ci；npm run typecheck。依 DB 指向說明在隔離目標執行 migration/seed，保存 ledger 及重跑 count。
- [ ] **結案與提交：** 每項有當前狀態；環境指向已確認；不需 credentials 的缺陷可立即開始。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`docs: establish full remediation baseline`。

### T01 · 修復繁中分群及翻譯品質 gate

**依賴：** T00。**對應：** O01；U07 U08。

**檔案及責任：**

- 修改：`messages/zh-HK.json`。
- 修改：`messages/en.json`。
- 修改：`scripts/audit-visible-strings.mjs`。
- 擬新增：`tests/unit/audit-full-translations.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 沿用 Admin.segments keys；新增 JSON value 品質檢查輸出 key 與 reasonCode，對連續佔位問號、U+FFFD、空 required label 失敗。合法 URL query／正則等非 UI 字串需明確例外，不全域粗暴取代問號。

- [x] **建立行為證據：** rendersReadableZhSegments：33 個已損壞值修復且與英文插值 token 一致；detectsCorruptTranslationSample 必須攔截 ???? 及替代字元；合法單問號句子通過。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 依英文語意恢復 33 值；補鍵值 parity、插值及 JSON 內容檢查到既有 audit 命令。逐個閱讀繁中 title/filter/preview/table，保留香港用語。
- [x] **驗證：** npm exec -- vitest run tests/unit/audit-full-translations.test.ts；npm run audit:strings；繁中與英文分群 UI 截圖。
- [x] **結案與提交：** U07、U08 pass；修改前後 mutation check 能使壞樣本紅燈。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: restore readable Chinese segment controls`。

### T02 · 批次功能狀態與列表選取一致

**依賴：** T00。**對應：** O02；U26 U57。

**檔案及責任：**

- 修改：`app/[locale]/(admin)/admin/members/page.tsx`。
- 修改：`components/admin/member-table.tsx`。
- 修改：`lib/admin/batches/service.ts`。
- 擬新增：`lib/admin/batches/capabilities.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/unit/audit-full-batch-capabilities.test.tsx`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 擬新增 getBatchCapabilities(actor: AdminActor): Promise<readonly {operation: BatchOperation; available: boolean; reasonCode: string | null}[]>，消費現有 server env/role guards。UI 使用 server 結果，server action 仍獨立重驗；讀歷史權限與啟用新作業分開。

- [x] **建立行為證據：** noSelectionWhenNoOperations；roleAndFlagMatrix；historyReadableWhenDisabled；staleUiCannotBypassActionFlag。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 沒有可用選取操作時隱藏 checkbox/全選 toolbar，列表顯示「此環境暫未開放批次操作」。有部分操作時只顯示可用操作及具體停用原因；不在前台暴露秘密配置。不得為此修改 production flags。
- [x] **驗證：** npm exec -- vitest run tests/unit/audit-full-batch-capabilities.test.tsx tests/unit/admin-batch-service.test.ts；停用/部分啟用/無權限三種 UI。
- [x] **結案與提交：** 勾選一定對應可用動作；停用解釋及歷史可讀；服務端拒絕仍有效。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: align member selection with batch capabilities`。

### T03 · 分群完整分頁與 campaign context

**依賴：** T00。**對應：** O10 O09；U35 U36。

**檔案及責任：**

- 修改：`components/admin/segment-results.tsx`。
- 修改：`lib/admin/segments.ts`。
- 修改：`lib/admin/segment-schema.ts`。
- 修改：`app/[locale]/(admin)/admin/segments/page.tsx`。
- 擬新增：`tests/unit/audit-full-segment-pagination.test.tsx`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-segment-pagination.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 保留 SegmentPreview.nextCursor；URL 延續 validated filter、locale、campaignDraft。頁面顯示目前區間/總數；cursor 按 filter fingerprint 綁定，條件變更清除舊 cursor history。

- [x] **建立行為證據：** 51/101 筆遍歷不重不漏；previous 保留條件；改 filter 不沿用舊 cursor；第 21 個 event filter 選項不能掉失；空與查詢失敗不同。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 用既有 keyset cursor 建下一頁及上一頁歷史；UI 不把當頁 items.length 當受眾總數。preview total、符合條件、可發送及 blocked 數量分清；保留既有聯絡人與會員 filter 互斥安全規則。
- [x] **驗證：** npm exec -- vitest run tests/unit/audit-full-segment-pagination.test.tsx tests/unit/segment-query.test.ts；npm run test:e2e -- tests/e2e/full-segment-pagination.spec.ts。
- [x] **結案與提交：** 隔離 101 筆，翻頁與返回均保留 context；SQL 真資料結果與總數相符。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: paginate segment previews without losing filters`。

### T04 · CMS Back/Forward 草稿復原

**依賴：** T00。**對應：** O08；U46 U48。

**檔案及責任：**

- 修改：`components/admin/page-copy-form.tsx`。
- 修改：`components/admin/unsaved-changes-guard.tsx`。
- 擬新增：`lib/admin/page-copy-local-draft.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/unit/audit-full-cms-draft.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-cms-history.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 擬新增 LocalCopyDraft={schemaVersion:1; namespace:string; baseRevision:string; updatedAt:string; changes:Record<string,string>}。只保存 allowlisted 非敏感 CMS 字串到 sessionStorage，key 按登入身份/namespace 分隔，TTL 24 小時；含兩語欄位。其保存不是正式發布。

- [x] **建立行為證據：** 真 Browser Back/Forward 恢復修改；語言/側欄離開可復原；storage 拒絕時顯示保存失敗；revision 改變時提示比對而非覆蓋；登出或換身份不顯示他人草稿。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 輸入時更新本機草稿並顯示「此分頁暫存」及最後成功時間；恢復/丟棄有明確選擇；成功發布或顯式丟棄後清除。若儲存不可用，清楚 warning + 既有離開保護；不能宣稱可以強制攔住所有 history。保留 server optimistic revision。
- [x] **驗證：** npm exec -- vitest run tests/unit/audit-full-cms-draft.test.ts；npm run test:e2e -- tests/e2e/full-cms-history.spec.ts。
- [x] **結案與提交：** 重跑 audit 原步驟無無聲遺失；storage 失效也不假報已保存。跨裝置 server draft 在 T17 完成。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: recover unsaved CMS copy after history navigation`。

### T05 · Google／電郵登入與會員建檔閉環

**依賴：** T00。**對應：** O04 O14；U01 U02 U03 U04 U05 U06 U10 U24 U55。

**檔案及責任：**

- 修改：`components/auth/sign-in-form.tsx`。
- 修改：`lib/auth/login-destination.ts`。
- 修改：`app/[locale]/member-login/provision-action.ts`。
- 修改：`app/[locale]/admin-login/page.tsx`。
- 修改：`lib/membership/join-service.ts`。
- 擬新增：`tests/unit/audit-full-auth-continuation.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-auth-onboarding.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 沿用 Neon Auth identity 與既有 provision/login destination；callback destination 只接受相同站內允許路徑。登入 continuation 包含 plan、locale、申請與 next，但身份/角色只由 server 解析。

- [ ] **建立行為證據：** identityCollisionDoesNotEscalate；noProfileResumesJoin；magicLinkExpiredReusableRecovery；externalNextRejected；revokedStaffDenied；會員登入不因 /admin next 而升權。
- [ ] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 先以 provider callback reference 定位根因，只有重現後才改 provision/schema。既有與全新帳戶分別跑 Google、email、取消、重用、到期；Google verified email 不能直接作任意帳戶合併依據，遵循 provider 綁定政策。職員頁給「電郵登入連結」、Google、已寄送/重寄/支援 reference；T20 補公開入口。
- [ ] **驗證：** npm exec -- vitest run tests/unit/audit-full-auth-continuation.test.ts tests/unit/login-profile-provision.test.ts；npm run test:e2e -- tests/e2e/full-auth-onboarding.spec.ts；真隔離 OAuth／magic link 人手完成 provider 驗證並保存遮罩 receipt。
- [ ] **結案與提交：** 新舊身份兩登入方式均完成到目的頁；UI mock 不能結案；沒有 provider access 時列明 blocked 子案例並繼續其他任務。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: complete member authentication and safe continuation`。

### T06 · 統一會籍授予與付款修復入口

**依賴：** T00。**對應：** O03；U22 U23 U24 U25。

**檔案及責任：**

- 修改：`components/admin/membership-comp-form.tsx`。
- 修改：`components/admin/membership-grant-form.tsx`。
- 修改：`lib/admin/membership-comp-actions.ts`。
- 修改：`lib/db/repos/admin-membership.ts`。
- 修改：`lib/admin/membership-grant-actions.ts`。
- 修改：`lib/membership/grants.ts`。
- 修改：`app/[locale]/(admin)/admin/members/[id]/page.tsx`。
- 擬新增：`tests/unit/audit-full-grant-boundary.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/legacy-comp-inventory.md`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 單一授予契約重用 MembershipGrantInput（target、planCode、effectiveAt、expiresAt、reason 10–1000 字）與現有 grant service；保留現有 superadmin/flag 邊界。舊 comp mutation 禁止新增 indefinite grants，回可理解的 legacy-retired code 或導向正式新入口，不保留弱權限捷徑。

- [x] **建立行為證據：** legacyCompCannotBypassGrantPolicy；staff/exco/server actor 偽造被拒；相同 idempotency 並發只一份 grant；expiredAt 邊界正確；既有 indefinite rows 保留原權益。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 前台改「特別會籍」與「付款核對」兩操作；舊程式 caller 全部盤點替換，tests/seed 的既有用途明確區分。legacy inventory 只讀，列來源缺失不虛構原因/到期日。付款已扣但未啟用連到 T08 對帳，不新建 comp。擴大角色或撤回舊權益另需已批准政策。
- [ ] **驗證：** npm exec -- vitest run tests/unit/audit-full-grant-boundary.test.ts tests/unit/membership-grant-service.test.ts；隔離三角色及並發 DB 驗收。
- [ ] **結案與提交：** 任何入口均不能繞過同一 grant guard；新授予有原因期限與 audit；無既有權益被默默改動。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: unify membership grants and retire legacy comp writes`。

### T07 · 舊分群 Queue 納入同一 campaign 審批

**依賴：** T03。**對應：** O11；U36 U37 U38。

**檔案及責任：**

- 修改：`lib/admin/campaigns.ts`。
- 修改：`lib/admin/campaign-actions.ts`。
- 修改：`lib/admin/campaign-wizard.ts`。
- 修改：`lib/admin/campaign-review-core.ts`。
- 修改：`components/admin/segment-results.tsx`。
- 擬新增：`tests/unit/audit-full-campaign-entry.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-campaign-review.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** saved segment 快捷鍵產生帶 segmentId 的 wizard context；無 DB 寫入的 GET。最後提交使用既有 createCampaignDraft 與 review service。舊 queueCampaign HTTP/action 入口不可再直接 queued；維持需要另一位管理員批准的現有規則。

- [x] **建立行為證據：** legacyQueueCannotSend；GET 不造 campaign row；作者不能自審；批准後內容/受眾變更使審批失效；入列後 STOP 仍在 send-time blocked；contacts/both filters 不擴大到全會員。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 按鈕改「建立通訊草稿」；呈現預覽、可送/排除原因、內容及受眾版本；只批准所看版本。不要創造「小規模免批」例外。掃所有 callers，讓必需 transactional notices 使用原有獨立業務 outbox，而非誤導入 marketing review。
- [ ] **驗證：** npm exec -- vitest run tests/unit/audit-full-campaign-entry.test.ts tests/unit/campaign-review-boundary.test.ts tests/unit/campaign-eligibility.test.ts；npm run test:e2e -- tests/e2e/full-campaign-review.spec.ts。
- [ ] **結案與提交：** 新舊人工推廣入口同一流程，實際 provider send 只在批准及同意都有效時發生。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: route segment campaigns through draft review`。

### T08 · 到期會員 billing 復原與付款對帳

**依賴：** T05。**對應：** O12 O03；U17 U19 U20 U21 U23。

**檔案及責任：**

- 修改：`lib/portal/queries.ts`。
- 修改：`app/[locale]/(member)/portal/billing/page.tsx`。
- 修改：`components/billing/billing-actions.tsx`。
- 修改：`lib/billing/checkout-service.ts`。
- 修改：`lib/billing/webhook-service.ts`。
- 擬新增：`lib/portal/billing-summary.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/unit/audit-full-billing-recovery.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-member-renewal.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 擬新增 getBillingSummary(actor: Actor): Promise<{membershipId:string|null; status:string; canManageBilling:boolean; recovery:"none"|"resume"|"new_checkout"|"support"; subscriptionRef:string|null}>；server 對本人或公司 owner/admin 授權，不依賴 active entitlement 的 getDashboard。敏感欄位按角色裁切。

- [x] **建立行為證據：** expired/cancelled billing 不500；seat member 不可代付/看不應見資料；pending/paid 重複 checkout 不造第二訂閱；亂序 webhook 不倒退；付款修復只對帳已存在訂單。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 到期仍能查看本人合法帳單及下一步；依 provider 真狀態決定 resume、新 checkout 或 support，不以一個 button 盲建訂閱。管理端提供 payment→subscription→membership correlation 及具權限的既有 reconciliation 路徑，保留 idempotency/CAS；不得接受 client 自報 paid。
- [ ] **驗證：** npm exec -- vitest run tests/unit/audit-full-billing-recovery.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/billing-checkout-locking.test.ts；npm run test:e2e -- tests/e2e/full-member-renewal.spec.ts。
- [ ] **結案與提交：** 四類取消/過期/欠費/已付未啟用可恢復且不重複收款；取消/權益按 T09 批准政策驗收。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: recover billing access without granting membership access`。

### T09 · 版本化會籍政策與付款前確認

**依賴：** T00。**對應：** O06；U09 U14 U17 U19 U20 U21 U56。

**檔案及責任：**

- 修改：`lib/membership/catalog.ts`。
- 修改：`lib/membership/public-catalog.ts`。
- 修改：`lib/db/schema-core.ts`。
- 修改：`lib/db/server-schema.ts`。
- 修改：`app/[locale]/(join)/join/checkout/page.tsx`。
- 修改：`messages/en.json`。
- 修改：`messages/zh-HK.json`。
- 擬新增：`lib/membership/policy.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`lib/db/repos/membership-policy-acceptances.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/unit/audit-full-policy-acceptance.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/policy-decisions.md`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 擬新增 MembershipPolicy={version:string; effectiveAt:string; approvedAt:string; approvedBy:string; localeContent:Record<"en"|"zh-HK",string>}；recordPolicyAcceptance(actor: Actor,input:{applicationId:string;policyVersion:string}): Promise<void> 在 server 核對 owner/當前批准版本，留 timestamp 與 content hash。沿用既有 schema 若已有等價欄位。

- [x] **建立行為證據：** 未批准版本不能成為 active policy；舊版本失效要求重閱；偽造 application owner 被拒；同版本重試冪等；價錢仍來自 server catalog/Stripe。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 把需要 WTIA 決定的續費方式、寬限、取消生效、退款、發票/席位、審批計劃、特別授權角色列成具體選項/影響/負責人。可先完成 schema/UI/測試，不填假條款。批准後同一版本用在方案、FAQ、checkout 及客服；不把條款寫死到多處。沒有批准內容不自動改正式 checkout 行為。
- [ ] **驗證：** npm exec -- vitest run tests/unit/audit-full-policy-acceptance.test.ts；隔離 migration 正反相容及 checkout 中英預覽；記錄政策批准文件引用。
- [ ] **結案與提交：** 工程 ready 與業務 approved 分開；相關正式功能只在批准版本存在後推出。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`feat: version membership policies and checkout acceptance`。

**工程驗證：** 隔離 SQL 5 pass，純政策 10 pass，回歸 204 pass，擴充 focused 27 pass；真 Chromium／Stripe TEST checkout 1 pass。政策 registry 空白且 flag 預設停用；正式條款／批准文件 D01–D06 未提供，完整業務驗收及公開方案/FAQ T20 保持待辦。無 schema migration；沿用 audit_events 不變收據。

### T10 · 申請個案、補件及營運狀態

**依賴：** T05 T09。**對應：** O07；U10 U11 U12 U13 U23 U45。

**檔案及責任：**

- 修改：`lib/db/repos/applications.ts`。
- 修改：`lib/db/repos/staff-tasks.ts`。
- 修改：`lib/db/schema-core.ts`。
- 修改：`lib/db/server-schema.ts`。
- 修改：`components/admin/application-queue-table.tsx`。
- 修改：`app/[locale]/(admin)/admin/members/queue/page.tsx`。
- 擬新增：`lib/admin/application-case-service.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`lib/admin/application-case-actions.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`app/[locale]/(admin)/admin/members/queue/[id]/page.tsx`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/integration/audit-full-application-case.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 擬新增 ApplicationCasePatch={expectedVersion:string;ownerProfileId?:string|null;dueAt?:string|null;missingFields?:string[];nextActionCode?:string;note?:string}；updateApplicationCase(actor: Actor,id:string,patch:ApplicationCasePatch): Promise<{version:string}>。reuse staff task 關聯；新增 metadata 或 case table 只在缺少時建立，applicationId unique。

- [x] **建立行為證據：** assign/補件/更正/resume 保留同申請；並發版本衝突；一般職員不可竄改 paid/active；人工批准不等同已付；付款先到/審批先到依政策只啟用一次；公司席位不能改 owner。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 個案 header 顯示申請、付款、會籍三個獨立狀態；負責人、缺件清單、下一步、期限、timeline。補件只含 allowlisted 欄位名，不任意清空資料；安全續辦要登入後驗 owner。記錄每個決定及原因；批准/拒絕按 T09 規則，可先交付 assign/follow-up 不具權益副作用部分。
- [ ] **驗證：** npm exec -- vitest run tests/integration/audit-full-application-case.test.ts（使用隔離 DB，必須實際執行而非 skipped）；U10–U13 真瀏覽器及付款 test-mode。
- [ ] **結案與提交：** 職員可從列表完成跟進，不用開 DB；同個案 timeline 能解釋為何未啟用。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`feat: add actionable membership application cases`。

T10 engineering evidence: evidence/t10 and verification.md. Approval/activation policy, approved missing-document sends and whole U10-U13 remain explicitly gated; operational case closure does not approve or activate membership.

### T11 · 背景工作健康與未知外部效果

**依賴：** T00。**對應：** O05；U18 U30 U37 U41 U42 U43 U44 U57。

**檔案及責任：**

- 修改：`workers/src/index.ts`。
- 修改：`workers/wrangler.toml`。
- 修改：`components/admin/automation-dashboard.tsx`。
- 修改：`lib/jobs/admin-batch-runner.ts`。
- 修改：`lib/db/schema-core.ts`。
- 修改：`lib/db/server-schema.ts`。
- 擬新增：`lib/jobs/health.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`lib/db/repos/job-health.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/unit/audit-full-job-health.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 擬新增 JobHealth={jobKey:string;enabled:boolean|null;deploymentSha:string|null;lastStartedAt:string|null;lastSucceededAt:string|null;nextExpectedAt:string|null;oldestPendingAt:string|null;failedCount:number;uncertainCount:number;state:"healthy"|"degraded"|"disabled"|"unknown"}；readJobHealth(actor: Actor):Promise<readonly JobHealth[]>。jobKey 來自既有 runner registry；heartbeat 只由已驗證 worker 寫。

- [x] **建立行為證據：** 沒有 heartbeat 不是 healthy；空 queue 但成功 poll 可 healthy idle；disabled 與失敗不同；heartbeat 過期按排程+容差變 degraded；provider accepted-timeout 不當確定失敗自動重送。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 在既有受保護 jobs endpoints/worker 完成後記錄 elapsed/count/錯誤 code，不存 PII。每 job 定義 expected interval 和 grace，寫入 runtime mapping；只啟動不能算成功。未知 provider outcome 以既有 outbox 狀態/新增 outcome 欄位表示，附 resultRef/reconcile action；必要時新增最小 migration，不創第二套 scheduler。
- [ ] **驗證：** npm exec -- vitest run tests/unit/audit-full-job-health.test.ts；隔離 worker scheduled trigger、crash、timeout、空輪詢；核對 deployed worker SHA 與最近成功。
- [ ] **結案與提交：** 操作者可分辨停用、未知、健康、異常；健康 UI 有真 worker readback。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`feat: expose verified worker and delivery health`。


T11 evidence: source/isolated SQL/local workerd/browser verified; cloud deployed SHA/target, Preview and whole provider cases remain pending. See verification.md T11.

### T12 · 續會候選有界查詢、checkpoint 及補跑

**依賴：** T09 T11。**對應：** O13 O05；U18 U19 U20 U21 U51。

**檔案及責任：**

- 修改：`lib/db/repos/renewal-enrollments.ts`。
- 修改：`lib/automation/enrollment.ts`。
- 修改：`lib/automation/renewal-runner.ts`。
- 擬新增：`tests/integration/audit-full-renewal-window.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** listDue 改為有界參數 {from:Date;to:Date;statuses:readonly Membership["status"][];after:{billingPeriodEnd:Date;membershipId:string}|null;limit:number}，回 {items:RenewalEnrollmentCandidate[];nextCursor:同 after 型別}。window 由 server 根據既有 90/60/30/14 及批准 dunning/winback 規則產生，不能 client 任意注入。

- [x] **建立行為證據：** 窗口邊界、HKT 跨日、取消/已續會排除、winback 不被錯誤濾走；同 timestamp keyset；checkpoint crash 後補跑；episode 重複 enrol 不多信。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 避免讀全部 billingPeriodEnd 非空 rows；以 (billingPeriodEnd,id) 排序及 checkpoint 分塊，分旅程狀態/窗口處理，不一刀切只 active。transaction 內提交 enrol 與進度或以獨立冪等鍵確保重跑安全；以 EXPLAIN 決定複合/部分索引，保留 granted/免費會籍邊界。
- [x] **驗證：** npm exec -- vitest run tests/integration/audit-full-renewal-window.test.ts；固定 clock 多窗口 5000+ 合成資料，保存 EXPLAIN 與候選數／漏重比對。
- [ ] **結案與提交：** 不掃描無關全量會籍；補跑不遺漏/重發；批准政策對應每一旅程。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`perf: bound renewal enrollment and checkpoint progress`。

### T13 · 批次 all-matching 快照查詢

**依賴：** T02。**對應：** O13 O02；U27 U28 U29 U31。

**檔案及責任：**

- 修改：`lib/admin/batches/selection.ts`。
- 修改：`lib/db/repos/admin-members.ts`。
- 修改：`lib/db/repos/admin-batches.ts`。
- 擬新增：`tests/integration/audit-full-batch-snapshot.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 保留 resolveMemberSelectionIds(actor: AdminActor,selection: MemberSelection,tx: BatchExecutor): Promise<string[]>；內部增加專用受權限限制的 snapshot query，沿用同一 predicate builder，最多讀 maxItems+1，不每 50 列重算聚合。

- [x] **建立行為證據：** ids 與 allMatching 結果一致；excluded 不誤改；5010超限；5000快照並發修改不擴大；row version/digest 改變拒絕舊提交；同一 owner scope。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 在既有 repeatable-read preparation transaction 內一次集合式取得 ID，或 bounded keyset 只計一次 total；不得改掉快照 isolation 省時間。UI 明示本頁/所有符合及排除。保留目前「符合條件總數超 max 即拒絕」語意，若想扣 exclusions 才限額需獨立變更與測試。
- [x] **驗證：** npm exec -- vitest run tests/integration/audit-full-batch-snapshot.test.ts；50/500/5000 性能對照，保存 SQL round trips、query plan、p95。
- [ ] **結案與提交：** 不再以 100 次含 aggregate 的 search 完成 5000選取；結果及權限與舊契約一致。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`perf: resolve bulk member selections without repeated counts`。

### T14 · 批次預覽、執行、取消及安全重試

**依賴：** T06 T07 T11 T13。**對應：** O02 O05；U27 U28 U29 U30 U31 U34。

**檔案及責任：**

- 修改：`lib/admin/batches/service.ts`。
- 修改：`lib/admin/batches/types.ts`。
- 修改：`lib/jobs/admin-batch-runner.ts`。
- 修改：`components/admin/batch-preview.tsx`。
- 修改：`components/admin/batch-progress.tsx`。
- 擬新增：`tests/integration/audit-full-batch-failures.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-batch-lifecycle.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 重用 BatchRequest/BatchPreview/BatchState/BatchItemState；不為美化頁面另建批次狀態。deliveryOutcome 區分確定可重試與未知待對帳；只在必要時在 item metadata 增加 typed outcome，不把 unknown 映射成可任意 retry 的 failed。

- [x] **建立行為證據：** 相同 idempotency 重提交；preview expiry/CAS；worker lease 過期/crash；取消 queued/running；provider accepted-timeout；停用 flag 後新動作拒絕，既有 in-flight 依明確 worker policy 處理；結果總數守恆。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 預覽 before/after、eligible/skipped/blocked、原因、筆數、到期及確認；background progress 仍用現有 50 列/status API，按狀態增量更新。僅安全失敗項目可重試；處理中取消顯示可能已有部分成功，保留 provider receipts。不得全量 poll 5000 rows 或無條件「全部重試」。
- [x] **驗證：** npm exec -- vitest run tests/integration/audit-full-batch-failures.test.ts tests/unit/admin-batch-lease.test.ts；npm run test:e2e -- tests/e2e/full-batch-lifecycle.spec.ts。
- [ ] **結案與提交：** 八種 BatchOperation 逐一填預覽/角色/旗標/效果/重試矩陣；具副作用操作只以指定測試對象驗收。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: make batch completion and recovery reliable`。

### T15 · 匯入、資料更新及私人匯出

**依賴：** T13 T14。**對應：** O02 O09；U32 U33。

**檔案及責任：**

- 修改：`lib/admin/imports/service.ts`。
- 修改：`lib/admin/imports/parse.ts`。
- 修改：`lib/admin/imports/validate.ts`。
- 修改：`lib/admin/imports/match.ts`。
- 修改：`components/admin/member-import-wizard.tsx`。
- 修改：`lib/admin/batches/export.ts`。
- 擬新增：`tests/integration/audit-full-import-export.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 沿用現有 importRunId、row decisions、import_commit、export_members/export_event_attendees；所有 mapping 和匹配決定成為 preview snapshot。export fields 限現有 allowlist，不因 CSV 要求直接開 email/role/consent mutation。

- [x] **建立行為證據：** BOM、中英/換行/逗號、重複列、大小寫電郵、既有身份、公式 = + - @ 與控制字元；其他角色下載拒絕；過期 URL 拒絕；重試匯入不重造人。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 每列標新增/更新/衝突/略過，顯示前後差異、來源與錯誤；email 匯入不是已驗證身份，更不是營銷同意。會員需收到指定且經批准的資料更新邀請才進登入流程。私人匯出有列數、欄位、期限及 audit，按 repository 現有 TTL/retention contract；不可 public 永久 URL。
- [x] **驗證：** npm exec -- vitest run tests/integration/audit-full-import-export.test.ts tests/unit/member-import-validation.test.ts；隔離 import/下載/過期及 retention job 驗收。
- [ ] **結案與提交：** 非技術職員可用可下載的錯誤清單修正再匯入；重複與個資邊界不被簡化 UI 弱化。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: complete safe member import and export workflows`。

### T16 · 活動報名、付款、票券與退款閉環

**依賴：** T08 T11。**對應：** 核心付款驗收 O05；U15 U16 U39 U40 U41 U42 U43 U56。

**檔案及責任：**

- 修改：`lib/tickets/checkout-core.ts`。
- 修改：`lib/db/repos/event-orders.ts`。
- 修改：`lib/billing/ticket-webhook-processor.ts`。
- 修改：`lib/billing/ticket-email-runner.ts`。
- 修改：`lib/billing/refund-success.ts`。
- 修改：`lib/billing/refund-failure.ts`。
- 修改：`app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx`。
- 擬新增：`tests/integration/audit-full-ticket-lifecycle.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-event-payment.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 沿用 order/seat/hold/payment/refund/outbox 模型及 Stripe event id；財務事件與通知分開。顯示 orderRef、付款狀態、票券狀態、退款及通知結果，不把 mail error 當 payment failed。

- [x] **建立行為證據：** 免費/付費、decline/cancel/async payment、最後一席競爭、hold expiry、相同 webhook/亂序、付款完成但回跳中斷、通知失敗、錯活動QR/重掃、退款成功/失敗/重送、退款與 check-in 競爭。
- [x] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [x] **實施：** 先跑 source 現有測試及真 test-mode，僅按失敗修復；client 金額/票數不能取代 server 驗證。後台活動 header 保持 event context，分內容、報名、訂單、通知、簽到；demo 標示非公開原因。重發票不可重啟已退票權益，退款需批准角色/原因/冪等，成功 callback 後才確定退款狀態。
- [ ] **驗證：** npm exec -- vitest run tests/integration/audit-full-ticket-lifecycle.test.ts；npm run test:e2e -- tests/e2e/full-event-payment.spec.ts；附 Stripe test-mode event/訂單/票/outbox 遮罩 reference 與 read-after-write。
- [ ] **結案與提交：** UI、DB 與 provider 三方一致；無 oversell、重複付款效果、重複票或未知退款被當成功。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: verify end-to-end event payments and ticket recovery`。

### T17 · CMS 草稿發布、區塊編輯及媒體搜尋

**依賴：** T04。**對應：** O08 O09；U46 U47 U48 U50。

**檔案及責任：**

- 修改：`components/admin/page-copy-form.tsx`。
- 修改：`components/admin/event-form.tsx`。
- 修改：`lib/admin/page-copy-action-core.ts`。
- 修改：`lib/db/repos/page-copy.ts`。
- 修改：`lib/i18n/page-copy-catalog.ts`。
- 修改：`lib/i18n/page-copy-cache.ts`。
- 修改：`lib/db/repos/media.ts`。
- 修改：`lib/db/schema-core.ts`。
- 修改：`lib/db/server-schema.ts`。
- 擬新增：`lib/admin/page-copy-drafts.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`components/admin/media-picker.tsx`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/integration/audit-full-cms-publish.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-cms-workspace.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 擬新增 saveCopyDraft(actor: Actor,input:{namespace:string;baseRevision:string;changes:Record<string,string>;expectedDraftRevision:string|null}):Promise<{draftId:string;revision:string}>；publishCopyDraft(actor: Actor,input:{draftId:string;expectedDraftRevision:string;expectedPublishedRevision:string}):Promise<{revision:string}>。沿用 allowlisted keys 和 savePageCopy transaction，不讓 preview 對外公開未批准內容。

- [ ] **建立行為證據：** save draft 不改匿名頁；publish 同 transaction audit/CAS；雙編輯衝突；回復舊版產生新 revision；cache 失效；唯一 label；媒體 79+ 可搜尋選擇，不接受跨來源任意 URL。
- [ ] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** Home 166 keys 改按頁面/區塊顯示，搜尋、只看已修改、雙語並排、重設及實際版面預覽；不要一次 render 332 inputs。server draft 提供跨裝置保存；T04 session draft 只是復原層。publish 權限沿現有 actor policy，不自創角色；保持 30 秒 cache 及發布失效。media picker 按名稱/用途/類型顯示縮圖及 alt，沿用現有媒體 registry/storage，不另造上傳平台。
- [ ] **驗證：** npm exec -- vitest run tests/integration/audit-full-cms-publish.test.ts；npm run test:e2e -- tests/e2e/full-cms-workspace.spec.ts；匿名頁 readback + 中英 screenshot。
- [ ] **結案與提交：** 保存/預覽/發布清楚分開；職員可在一個區塊完成修改；history/CAS 不遺失內容。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`feat: add focused CMS drafting and publishing workflow`。

### T18 · SaaS 導航、今日工作及會員維護

**依賴：** T02 T10 T11。**對應：** O07 O09 O14；U01 U24 U45 U49 U59。

**檔案及責任：**

- 修改：`components/admin/admin-nav.tsx`。
- 修改：`config/internal-navigation.ts`。
- 修改：`components/admin/dashboard-tiles.tsx`。
- 修改：`lib/db/repos/admin-dashboard.ts`。
- 修改：`components/admin/member-filters.tsx`。
- 修改：`components/admin/member-table.tsx`。
- 修改：`app/[locale]/(admin)/admin/members/[id]/page.tsx`。
- 擬新增：`lib/admin/work-queue.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`components/admin/work-queue-table.tsx`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/unit/audit-full-workspace.test.tsx`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-admin-daily-work.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 擬新增 WorkQueueItem={id:string;kind:"application"|"renewal"|"payment"|"support"|"content";summary:string;ownerProfileId:string|null;dueAt:string|null;nextActionCode:string;href:string;priority:"high"|"normal"}；listMyWork(actor: Actor,input:{scope:"mine"|"unassigned"|"all";cursor:string|null}):Promise<{items:readonly WorkQueueItem[];nextCursor:string|null}>，aggregate 既有 source records，不複製會籍/payment facts。

- [ ] **建立行為證據：** dashboard failure 不偽裝0；草稿申請可見且分已提交/未完成；all scope 按權限；公司 autocomplete 不洩漏；篩選/返回保留；390/768/1440px；鍵盤及焦點管理；profile/付費/公司席位分母分清。
- [ ] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 六主組：今日工作、會員與機構、活動與收款、訊息與支援、網站內容、系統與稽核；保留舊 URL/deep links。用語意 icon+文字替代重複首字；mobile drawer 有 focus trap/return。會員列表首屏搜尋及資料，advanced filter 收起，公司名稱 autocomplete；Member360 固定 identity/會籍/到期/付款/負責人/下一步，低頻技術資料收進詳情。分頁不重置 view。
- [ ] **驗證：** npm exec -- vitest run tests/unit/audit-full-workspace.test.tsx；npm run test:e2e -- tests/e2e/full-admin-daily-work.spec.ts；axe+人工鍵盤及中英三視窗寬度。
- [ ] **結案與提交：** 營運可由工作台找到並完成入會、到期、付款例外；資訊不依靠 raw UUID 或24個平鋪入口。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`feat: organize admin around daily membership operations`。

### T19 · 客服交接、待辦與通訊送達維護

**依賴：** T07 T10 T11 T18。**對應：** O05 O09；U30 U37 U38 U44 U45。

**檔案及責任：**

- 修改：`lib/admin/inbox.ts`。
- 修改：`lib/admin/inbox-actions.ts`。
- 修改：`lib/admin/task-actions.ts`。
- 修改：`lib/db/repos/inbox.ts`。
- 修改：`lib/db/repos/staff-tasks.ts`。
- 修改：`components/admin/inbox-thread.tsx`。
- 修改：`components/admin/inbox-composer.tsx`。
- 修改：`components/admin/task-table.tsx`。
- 擬新增：`tests/integration/audit-full-support-handoff.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 重用 thread、task、provider message id/既有 dedupeKey；task context 擴充 application/payment reference 必須 strict typed allowlist，不存 token。擬新增 support disposition 為 existing task metadata，而非新 CRM。SLA 按 T09 另列營運批准值。

- [ ] **建立行為證據：** 同 inbound event 去重；不同時間相同回覆可合法再發；兩職員並發回覆/接手；未送/已接收/送達/不確定分開；STOP 後 marketing blocked；一般支援不能用 profile patch 改角色或免費解決付款。
- [ ] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 未分派/我的/逾期視圖，owner、下一步、跟進日期與交接 note；接手動作可稽核。登入支援收 reference，不要求會員交 magic link；付款直接到 T08 對帳，未知送達到 T11 核對。歷史 Phase C WhatsApp 規則及合法 transactional purpose 保留；勿因統一 UX 破壞既有頻道同意策略。
- [ ] **驗證：** npm exec -- vitest run tests/integration/audit-full-support-handoff.test.ts tests/unit/inbox-repeat-reply.test.ts tests/unit/woztell-consent-audit.test.ts；兩隔離職員與測試收件人完整交接。
- [ ] **結案與提交：** 客服可找到人、接手、回覆、知道送達與關閉原因；錯誤不只能交開發者處理。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`feat: complete support ownership and follow-up workflows`。

### T20 · 公開內容、登入入口與會員語意

**依賴：** T05 T09。**對應：** O14 O06；U01 U09 U14 U15 U54 U59。

**檔案及責任：**

- 修改：`messages/en.json`。
- 修改：`messages/zh-HK.json`。
- 修改：`config/internal-navigation.ts`。
- 修改：`lib/membership/public-catalog.ts`。
- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/content-signoff.md`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/e2e/full-public-content.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 依既有公共 header/footer 元件及頁面 contracts 修改，不改方案 ID/價格來源。會員登入 CTA → 現有 member-login；footer「職員登入」→ localized admin-login；已登入職員可回管理後台。

- [ ] **建立行為證據：** 主導航/手機/頁尾兩身份入口可找到；URL locale 正確；沒有 VERIFIED WTIA ARCHIVE、不是抓取標誌牆、price ID 等內部措辭；79夥伴58/15/6、lazy images 滾動載入及有效連結；真 published 活動可見而 demo 排除。
- [ ] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 公開頁先回答服務、對象、價值、如何加入與聯絡；無來源的統計/合作/推薦語不得編造。政策摘要引 T09 版本；內部 verification 放維護文件。後台將 profile/申請人/有效會員/免費/付費/granted/公司席位分開；收入0與無分母N/A保留。檢查 CMS overrides，不能只改 locale JSON 卻被舊文案蓋回。
- [ ] **驗證：** npm run test:e2e -- tests/e2e/full-public-content.spec.ts；逐頁 content-signoff、desktop/mobile、匿名公開readback。
- [ ] **結案與提交：** 不需知道URL即可找職員登入；內容可信、價值清楚，既有79夥伴與活動規則無回歸。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`fix: clarify public membership content and staff access`。

### T21 · 量度後的效能優化與私人快取邊界

**依賴：** T12 T13 T17 T18。**對應：** O13；U31 U51 U52 U53。

**檔案及責任：**

- 修改：`lib/db/repos/admin-members.ts`。
- 修改：`lib/i18n/page-copy-cache.ts`。
- 擬新增：`scripts/audit-remediation-performance.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/performance.md`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/integration/audit-full-cache-boundary.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 產生 route/query/worker performance evidence（環境、SHA、資料量、樣本數、cold/warm、median/p95、TLS、錯誤率）；logger 只存 safe route、duration、correlation ID，不把 search term/PII/token 放標籤。

- [ ] **建立行為證據：** 兩身份讀取不洩漏 cache；私人頁 no-store；發布使公開 copy cache 失效；50/500/5000 有界查詢；loading/empty/error 不互相混淆。
- [ ] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 測香港/新加坡網絡與真環境位置，先分 TLS/network/app/DB；有證據才調 query/index、public cache、bundle/images 或 function region。不能把 iad1 改為亞洲就宣稱修好。reuse next 現有 docs/api；不要給整個 auth layout 公用 cache。移除CMS巨量render與重複查詢後再測。
- [ ] **驗證：** npm exec -- vitest run tests/integration/audit-full-cache-boundary.test.ts；npm run test:lighthouse（記錄環境限制）；新增 performance script 用至少30次warm樣本/規模及獨立cold樣本；RUM mobile/desktop p75另列。
- [ ] **結案與提交：** 目標而非既有實績：list/preview p95≤2秒；公開LCP≤2.5秒、INP≤200ms、CLS≤0.1。未有RUM樣本標 pending，不以Lighthouse代替。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`perf: verify and improve membership workspace performance`。

### T22 · 整合生命週期、UAT、migration 及回復演練

**依賴：** T01–T21。**對應：** O01–O14；U01–U60。

**檔案及責任：**

- 擬新增：`tests/e2e/full-membership-lifecycle.spec.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`tests/integration/audit-full-migration-recovery.test.ts`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/acceptance.csv`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/release-readiness.md`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** acceptance.csv 每行包含 UAT_ID、task、SHA、environment、fixture、expected、observed、pass/fail/blocked、evidenceRef、owner；provider實測另記遮罩receipt。範圍對照隨本計劃 CSV。

- [ ] **建立行為證據：** 新申請→email/Google→公司→政策→付款→啟用→客服→續會；活動→收款→發票/票→簽到→退款；批次50/500/5000；草稿→發布→回復；migration從基準與乾淨DB兩路。
- [ ] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 先完整跑相關既有suite，核對skip原因；以真integration拉通route/domain/repository/provider，不讓每層互mock掩蓋契約錯配。混合角色、時間及金額；人工職員按SOP完成日常工作，記錄成功率及找不到下一步的地方並修復。應用回退演練保留新schema及交易，不刪history。
- [ ] **驗證：** npm test；npm run lint；npm run typecheck；npm run build；npm run audit:strings；npm run test:e2e（隔離允許設定）；migration/rollback rehearsal。完整結果及skip清單必須附SHA。
- [ ] **結案與提交：** 所有UAT都有實際結果；未通過的P1 gate不得簽full fix。若provider/policy受阻，產出可審PR和精確blocked清單而非停做其他工作。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`test: complete membership operations acceptance evidence`。

### T23 · 分批發布、正式核對及營運交接

**依賴：** T22；相關業務／發布已獲批准。**對應：** O01–O14；U56 U57 U58 U60。

**檔案及責任：**

- 擬新增：`docs/integration/2026-10-01-hkwtia-remediation-release.md`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/production-readback.md`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。
- 擬新增：`docs/audits/hkwtia-2026-10-01-remediation/operations-handbook.md`（如有等價既有實作，擴充該檔並在台帳記錄 mapping）。

**介面／契約：** 發布矩陣一行一能力：appSHA、workerSHA、migration、flagName/狀態、providerMode、UAT evidence、approvedAt、rollbackOwner。operator應用使用現有 deployment/flag機制，不新增自動live模式。

- [ ] **建立行為證據：** 匿名/public與staff/member smoke；migration先後相容；新工作停用仍可查歷史；provider未知結果人工對帳；rollback app不刪新交易；正式alias指向與release一致。
- [ ] **確認修改前結果：** 程式缺陷先執行下列 focused test 並閱讀目標行為失敗；已通過或純設定／文件項記錄實際 baseline，不為追求紅燈破壞正常功能。
- [ ] **實施：** 先完成可審PR/preview/測試/回退計劃。若本次執行只有寫碼授權，停在此具體發布邊界要求發布批准，不反覆問已授權事項。批准後順序：無副作用UI→schema+worker健康→資料修正/私人匯出→匯入→grant→通訊/票重發。每項小批canary核對後再擴；不批量啟用所有flags。
- [ ] **驗證：** 實際部署identity/readback；批准的小批交易receipt；worker至少跨兩個預定執行窗口觀察；匿名與各角色smoke；每日SOP由職員自行完成一次。
- [ ] **結案與提交：** 交付current source/deployment/worker/ledger/flags/UAT矩陣、剩餘問題及回退操作；正式未啟用功能明示，不稱已全線上線。 把結果、SHA與證據填入 status/acceptance；只 stage 本任務檔案。建議 commit：`docs: record verified rollout and operating handover`。

## 5. 資料遷移與相容性

由需要 schema 的任務負責自己的 migration，不設一個先建全部表再慢慢接 UI 的大任務。先盤點等價欄位/表/索引再決定最小增量；以下是資料責任，並非要求不經檢查新增六張表。

| 任務 | 資料責任 | 遷移規則 |
|---|---|---|
| T06 | legacy comp 與有限期 grant | 先只讀 inventory；新入口走既有 grant 表/欄位；不替舊 indefinite 會籍亂填期限、不撤權 |
| T09 | policy version 及 application acceptance | append-only 接受紀錄；application/version 冪等唯一性；既有申請標「無歷史確認證據」，不可 backfill 成假同意 |
| T10 | 申請 owner、due、missing fields、next action、version | nullable/additive metadata；application 關聯唯一；已有申請逐批補空 metadata，不改 payment/entitlement 事實 |
| T11 | worker heartbeat、run outcome、delivery uncertainty | 優先擴充既有 job/outbox；worker role 才可寫心跳；保留 append-only effects/ref，不清除未知結果 |
| T12/T13 | 有界候選、查詢索引、進度 | 以實測 plan 選索引；校驗 existing raw SQL indexes；checkpoint 不可跳過未完成項 |
| T17 | CMS draft、revision、publish/history | draft 與 published 分開；用 optimistic CAS；現有 published copy 成為起始版本，不 blank overwrite |
| T19 | task owner/due/context | 若既有已有 owner/due 則直接重用；strict context 不混入 Auth token 或多餘個資 |

每個 schema 任務必須完成：

- [ ] 查看當前 `drizzle` journal，使用下一個真實 migration 編號；不要預設下一號，也不改已套用 SQL。
- [ ] 在乾淨隔離 DB migration→seed，及審核基準 schema→新 migration 兩條路執行。
- [ ] 審核產生的 SQL，避免意外 DROP/CREATE 丟失 raw index、view、constraint；必要的非 transaction 建索引遵循 repository runner 能力並另列操作步驟。
- [ ] 用合成 legacy rows 驗證 NULL/缺欄/重複/中斷補跑；backfill 有 checkpoint、count、驗後讀取及恢復點。
- [ ] 新舊 app 都能讀相容 schema；先 expand→部署 dual-compatible code→驗收→獨立後續 contract。禁止把刪欄/刪資料當即時 rollback。
- [ ] 將 DB ledger 與 app/worker 相依記入發布矩陣；migration 完成不代表 worker 或旗標已推出。

## 6. 必須鎖定的狀態與權限規則

| 領域 | 不能混為同一事實 | 固定要求 |
|---|---|---|
| 會員 | Auth identity／profile／application／membership／company seat | 登入成功不等於入會或繳費；同電郵不自動擴權 |
| 入會 | 補件／人工決定／付款／權益啟用 | review policy 決定需哪些條件；activation 必須冪等，comp 不是批准 |
| 收款 | checkout created／payment pending／paid／refunded | server 驗證 provider event；return URL 與 toast 不可標 paid |
| 通訊 | draft／reviewed／queued／accepted／delivered／unknown | 雙人審批綁內容及受眾版本；未知結果先對帳 |
| 批次 | preview／confirmed／running／partial result／cancelled | 原總數不因 failed filter 改變；同 idempotency 不製造第二次效果 |
| CMS | 本機暫存／server draft／published | 草稿不對外公開；發布需授權、revision、audit、cache invalidation |

批次八項操作均要有 acceptance row：`profile_patch`、`import_commit`、`membership_grant`、`renewal_reminder`、`profile_update_invite`、`ticket_resend`、`export_event_attendees`、`export_members`。不能只驗 profile_patch 然後打開全部功能。

重用現有 `BatchItemState` 時，結果需符合以下行為斷言；這些是測試不變條件，並非新增 API：

```ts
expect(total).toBe(pending + running + succeeded + skipped + failed);
expect(repeatedSubmission.batchId).toBe(firstSubmission.batchId);
expect(replay.externalEffectCount).toBe(1);
expect(unknownDelivery.canBlindRetry).toBe(false);
expect(stalePreview.canCommit).toBe(false);
expect(anonymous.canMutate).toBe(false);
expect(savedDraft.changedPublishedContent).toBe(false);
expect(expiredMember.canReadOwnBilling).toBe(true);
```

適配現有 result shape 寫真實 assert，不為湊上面欄名製造 façade 或自證測試。

## 7. WTIA 待確認決策：只阻擋相關功能

| 決策 | 業務負責人 | 需提供的具體內容 | 工程未獲決定前照做 |
|---|---|---|---|
| D01 續費、到期與寬限 | 會員主管＋財務 | 各 plan 自動/手動續費、取消生效、寬限權益、提醒窗口、winback條件 | T08 查帳/復原介面；T09版本與確認；不發明權益期限 |
| D02 入會審批 | 會員主管 | 哪些計劃人工審、批准前能否收款、補件/拒絕原因及通知 | T10 owner/缺件/期限；審批與activation動作維持受控 |
| D03 特別授權 | 會長／授權負責人 | 允許角色、期限、原因及批准規則，legacy comp處置 | T06退役弱入口、沿用現有superadmin契約，保留歷史權益 |
| D04 通訊與支援 | 營運主管 | 目的分類、頻道同意、雙人批准、收件人限制及SLA | T07統一現有review；T19功能完成；無批准不新增免審類別 |
| D05 退款及票務 | 財務＋活動主管 | 可退款條件、部分/全額、已簽到票處理、席位釋放 | T16 test-mode機制與reconciliation；不自行設定正式退款政策 |
| D06 發布責任 | 技術負責人＋業務owner | flags操作人、正式canary對象、回退人、監察窗口 | T22完整preview及證據包，準備可審核發布單 |

若先前已有有效批准文件，沿用並引用，不重問。缺失才提供具體選項與影響給對應 owner；不得因其中一項缺失停止所有程式工作。任何 policy 欄位不得以「TBD」作可發布內容。

## 8. 後台 UX 驗收標準

- 入口：首頁/頁尾可找到「職員登入」；登入頁電郵連結與 Google 清楚，寄送後有目的電郵遮罩、重寄時間、錯誤 reference 與返回路徑。不能以隱藏網址代替權限控制。
- 每頁：標題、目的、主要操作、目前 filter/scope、loading/empty/error/disabled 狀態清楚；錯誤說下一步，避免只顯示 raw code。
- 每個列表：姓名/機構名為主，技術 ID 收入詳情；可搜尋、分頁、儲存視圖、返回不丟 filter；不把進階表單佔滿第一屏。
- 每個具副作用操作：確認對象、scope、前後值/金額、原因、批准及可恢復範圍。按鈕 busy、防重提交；UI成功後需有實際資料效果。
- 每個部分失敗：保留已完成工作、列原因、可安全重試/需對帳/被阻擋分開；不要把一封信失敗顯示為整筆款失敗。
- 無障礙：原生 label、語意 icon、焦點可見、dialog關閉回原控制、鍵盤可操作；錯誤/狀態不能只靠顏色。桌面與390px手機都能完成主要任務。
- Daily SOP：職員能在同一工作台查看新申請、到期、待回覆、付款例外、活動通知及worker健康；owner、期限與下一步可執行。15–30分鐘是營運巡檢建議，不是未量度的完成績效。

## 9. 發布門檻與停止擴大條件

| Gate | 必須具備 | 未達時的具體處理 |
|---|---|---|
| G0 基準 | repo/SHA/隔離目標/flags/worker/provider狀態 | 可繼續無環境依賴的程式工作；不跑未確認目標的寫入fixture |
| G1 程式 | focused/full tests、lint、typecheck、build、strings；skip理由 | 修復相關failure，不略過gate或放寬測試使其變綠 |
| G2 遷移 | 兩路migration、legacy相容、backup/recovery演練 | 保持舊app，修migration；不能用正式資料先試 |
| G3 真流程 | Google/email、付款、outbox、batch、role、60 UAT receipts | blocked功能維持停用，完成其他可發布修正 |
| G4 業務 | 適用政策及文案批准、權限/退款/通訊決定 | 可部署受控程式但不啟用未批准的業務行為 |
| G5 正式 | release批准、app/worker/alias/migration/flags readback、canary | 發布後按功能逐項放行；已存在授權不重複請求 |

出現未授權存取、重複收費/票/訊息、對象數不符、worker停止進展、會員資料不一致，即暫停該能力的新作業並對帳；保留已產生的 receipts。功能開關關閉不是外部交易回退。Web app rollback、worker pause及資料補償分別記錄，後續修正仍需版本/CAS及audit。非致命UI問題可獨立修復，不為回退頁面破壞已完成收款。

正式所有寫入canary需有明確對象/範圍與既有授權。觀察至少跨兩個該job排定執行窗口，且確認queue age回落；對一天一輪的job不能用五分鐘截圖簽收。安全的人工trigger可以補測runner，但不能代替實際排程證據。

## 10. Codex 最終交付格式

每個 PR：問題與影響 → 修改後行為 → O/U 對照 → tests與skip → schema/flags/worker/provider影響 → 截圖或receipt → rollout/rollback。保留小而可審核的commit；相關schema與consumer一同審查。不要把全部24任務擠在一個巨大PR，也不用為每個文字改動開一個PR。

最後交付以下檔案並在摘要列真實狀態：

1. `status.csv`：O01–O14的修正SHA、verified/blocked與證據。
2. `acceptance.csv`：U01–U60 的 expected/observed、環境、fixture、pass/fail/blocked、receipt。
3. `release-readiness.md` 及 `production-readback.md`：app/worker/ledger/flags/provider狀態和確切剩餘門檻。
4. `performance.md`：before/after、資料量/樣本/region/network；不混用TLS、DB latency、Lighthouse及RUM。
5. `operations-handbook.md`：繁中角色指引、每日/每週/每月SOP、常見錯誤、交接與安全重試；配合原維護清單更新。
6. 新 evidence ZIP：遮罩screenshots、logs、receipts、migration/recovery報告、SHA256 manifest；不包含env、登入URL、token、cookie、真實會員匯出或完整provider payload。

完成用語必須區分：**程式已修／隔離驗收通過／正式已部署／正式已啟用／正式驗證完成**。不能以commit存在、UI截圖、6,097項舊測試通過或沒有資料為全系統完成證據。

## 11. 計劃自我核對

| 證據問題 | 主責任務 |
|---|---|
| O01 | T01 |
| O02 | T02、T13、T14、T15、T23 |
| O03 | T06、T08 |
| O04 | T05、T10、T22 |
| O05 | T11、T12、T14、T16、T19、T23 |
| O06 | T09、T20 |
| O07 | T10、T18 |
| O08 | T04、T17 |
| O09 | T03、T15、T17、T18、T19 |
| O10 | T03 |
| O11 | T07、T19 |
| O12 | T08 |
| O13 | T12、T13、T21 |
| O14 | T18、T20 |

60 項 UAT 均在 `HKWTIA_Codex_Remediation_UAT_Traceability_2026-10-01.csv` 指定主責任務；原始狀態保留，新實施/執行結果另欄，初始均為未執行。新增 interface 只在相應任務定義；後續任務重用，不以同名不同語意重新建立模型。
